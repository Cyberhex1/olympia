using System.Text.RegularExpressions;

namespace FireTVManager;

public sealed class AppInfo
{
    public required string Package { get; init; }
    public bool System { get; set; }
    public bool Disabled { get; set; }
    public bool Running { get; set; }
    public bool Foreground { get; set; }
}

public sealed record DeviceInfo(string Model, string FireOs, string FreeRam, string Storage);

/// <summary>Device operations. Every package name is validated before it reaches a shell string.</summary>
public static class FireTv
{
    static readonly Regex PackageRx = new(@"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$|^android$", RegexOptions.Compiled);

    public static bool IsValidPackage(string p) => PackageRx.IsMatch(p);

    static string Checked(string p) =>
        IsValidPackage(p) ? p : throw new ArgumentException($"Not a valid package name: {p}");

    static readonly Dictionary<string, string> Models = new()
    {
        ["AFTMM"] = "Fire TV Stick 4K",
        ["AFTKA"] = "Fire TV Stick 4K Max",
        ["AFTKM"] = "Fire TV Stick 4K (2nd gen)",
        ["AFTSS"] = "Fire TV Stick Lite",
        ["AFTSSS"] = "Fire TV Stick (3rd gen)",
        ["AFTMM2"] = "Fire TV Stick 4K",
        ["AFTT"] = "Fire TV Stick (2nd gen)",
        ["AFTR"] = "Fire TV Cube (2nd gen)",
        ["AFTA"] = "Fire TV Cube (1st gen)",
    };

    public static async Task<DeviceInfo> GetInfoAsync(Adb adb)
    {
        var r = await adb.ShellAsync(
            "getprop ro.product.model; getprop ro.build.version.name; grep MemAvailable /proc/meminfo; grep MemTotal /proc/meminfo; df -h /data");
        var lines = r.Output.Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries);
        string Line(int i) => i < lines.Length ? lines[i].Trim() : "";

        var code = Line(0);
        var model = Models.TryGetValue(code, out var nice) ? $"{nice} ({code})" : code;
        var os = Line(1);
        static long Kb(string s) => long.TryParse(Regex.Match(s, @"\d+").Value, out var v) ? v : 0;
        string Find(string key) => lines.FirstOrDefault(l => l.Contains(key)) ?? "";
        var avail = Kb(Find("MemAvailable")); var total = Kb(Find("MemTotal"));
        var ram = total > 0 ? $"{avail / 1024} MB free of {total / 1024} MB" : "?";
        var dataLine = lines.LastOrDefault(l => l.TrimEnd().EndsWith("/data")) ?? "";
        var df = Regex.Split(dataLine.Trim(), @"\s+");
        var storage = df.Length >= 5 ? $"{df[^3]} free of {df[^5]}" : "?";
        return new DeviceInfo(model, os, ram, storage);
    }

    public static async Task<List<AppInfo>> LoadAppsAsync(Adb adb)
    {
        var r = await adb.ShellAsync(
            "pm list packages -s; echo @@; pm list packages -3; echo @@; pm list packages -d; echo @@; ps; echo @@; dumpsys activity activities | grep mResumedActivity",
            60_000);
        var parts = r.Output.Replace("\r", "").Split("@@");
        if (parts.Length < 5) throw new InvalidOperationException("Unexpected reply from the device: " + r.All);

        static IEnumerable<string> Pkgs(string block) => block.Split('\n')
            .Select(l => l.Trim())
            .Where(l => l.StartsWith("package:"))
            .Select(l => l["package:".Length..]);

        var apps = new Dictionary<string, AppInfo>();
        foreach (var p in Pkgs(parts[0])) apps[p] = new AppInfo { Package = p, System = true };
        foreach (var p in Pkgs(parts[1])) apps[p] = new AppInfo { Package = p, System = false };
        foreach (var p in Pkgs(parts[2])) if (apps.TryGetValue(p, out var a)) a.Disabled = true;

        foreach (var line in parts[3].Split('\n').Skip(1))
        {
            var cols = Regex.Split(line.Trim(), @"\s+");
            if (cols.Length < 2) continue;
            var name = cols[^1].Split(':')[0];
            if (apps.TryGetValue(name, out var a)) a.Running = true;
        }

        var fg = Regex.Match(parts[4], @"u0 ([^/\s]+)/");
        if (fg.Success && apps.TryGetValue(fg.Groups[1].Value, out var f)) f.Foreground = true;

        return apps.Values.OrderBy(a => a.System).ThenBy(a => a.Package).ToList();
    }

    public static async Task<(bool ok, string msg)> DisableAsync(Adb adb, string pkg)
    {
        var r = await adb.ShellAsync($"pm disable-user --user 0 {Checked(pkg)}");
        var ok = r.All.Contains("disabled-user");
        return (ok, ok ? "disabled" : Explain(r.All));
    }

    public static async Task<(bool ok, string msg)> EnableAsync(Adb adb, string pkg)
    {
        var r = await adb.ShellAsync($"pm enable {Checked(pkg)}");
        var ok = r.All.Contains("new state: enabled");
        return (ok, ok ? "enabled" : Explain(r.All));
    }

    public static async Task<(bool ok, string msg)> UninstallAsync(Adb adb, string pkg)
    {
        var r = await adb.RunAsync(new[] { "uninstall", Checked(pkg) }, true, 120_000);
        var ok = r.All.Contains("Success");
        return (ok, ok ? "uninstalled" : Explain(r.All));
    }

    public static async Task ForceStopAsync(Adb adb, string pkg) =>
        await adb.ShellAsync($"am force-stop {Checked(pkg)}");

    public static async Task<(bool ok, string msg)> LaunchAsync(Adb adb, string pkg)
    {
        var p = Checked(pkg);
        var r = await adb.ShellAsync($"monkey -p {p} -c android.intent.category.LEANBACK_LAUNCHER 1");
        if (r.All.Contains("No activities found"))
            r = await adb.ShellAsync($"monkey -p {p} -c android.intent.category.LAUNCHER 1");
        var ok = r.All.Contains("Events injected");
        return (ok, ok ? "launched" : "no launchable screen found");
    }

    public static async Task<(bool ok, string msg)> InstallAsync(Adb adb, string apkPath)
    {
        var r = await adb.RunAsync(new[] { "install", "-r", apkPath }, true, 15 * 60_000);
        var ok = r.All.Contains("Success");
        return (ok, ok ? "installed" : Explain(r.All));
    }

    public static async Task<string> TrimCachesAsync(Adb adb)
    {
        var r = await adb.ShellAsync("pm trim-caches 999G", 120_000);
        return string.IsNullOrWhiteSpace(r.All) ? "done" : r.All;
    }

    static string Explain(string output)
    {
        if (output.Contains("protected package")) return "Fire OS blocked this: Amazon protects this app on your Fire OS version, so nothing was changed";
        if (output.Contains("SecurityException")) return "Fire OS blocked this for that app (" + FirstLine(output) + ")";
        if (output.Contains("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) return "an older copy is signed differently; uninstall it first";
        if (output.Contains("INSTALL_FAILED_INSUFFICIENT_STORAGE")) return "not enough space on the stick";
        if (output.Contains("INSTALL_FAILED_OLDER_SDK")) return "the APK needs a newer Android than Fire OS 6 (Android 7.1)";
        if (output.Contains("INSTALL_FAILED_NO_MATCHING_ABIS")) return "the APK is built for a different CPU";
        if (output.Contains("INSTALL_FAILED_VERSION_DOWNGRADE")) return "a newer version is already installed";
        return FirstLine(output);
    }

    static string FirstLine(string s)
    {
        var line = s.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Trim())
            .FirstOrDefault(l => l.Contains("Failure") || l.Contains("Error") || l.Contains("Exception"))
            ?? s.Split('\n').FirstOrDefault()?.Trim() ?? "";
        return line.Length > 200 ? line[..200] : (line.Length == 0 ? "no reply" : line);
    }
}
