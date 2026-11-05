using System.Text.RegularExpressions;

namespace FireTVManager;

public sealed class AppInfo
{
    public required string Package { get; init; }
    public bool System { get; set; }
    public bool Disabled { get; set; }
    public bool Running { get; set; }
    public bool Foreground { get; set; }
    /// <summary>Removed for user 0 (pm uninstall -k --user 0); the APK may still be on the stick.</summary>
    public bool Removed { get; set; }
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
            "pm list packages -s; echo @@; pm list packages -3; echo @@; pm list packages -d; echo @@; ps; echo @@; dumpsys activity activities | grep mResumedActivity; echo @@; pm list packages -u -s; echo @@; pm list packages -u -3",
            60_000);
        var parts = r.Output.Replace("\r", "").Split("@@");
        if (parts.Length < 7) throw new InvalidOperationException("Unexpected reply from the device: " + r.All);

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

        // in the "-u" lists but not the normal ones = removed for this user
        foreach (var (block, system) in new[] { (parts[5], true), (parts[6], false) })
            foreach (var p in Pkgs(block))
                if (!apps.ContainsKey(p)) apps[p] = new AppInfo { Package = p, System = system, Removed = true };

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

    static readonly Regex ApkPathRx = new(@"^/[A-Za-z0-9_./~=+-]+\.apk$", RegexOptions.Compiled);

    /// <summary>Where the app's APK(s) live on the stick, e.g. /system/priv-app/x/x.apk.</summary>
    public static async Task<List<string>> GetApkPathsAsync(Adb adb, string pkg)
    {
        var r = await adb.ShellAsync($"pm path {Checked(pkg)}");
        return r.Output.Replace("\r", "").Split('\n').Select(l => l.Trim())
            .Where(l => l.StartsWith("package:")).Select(l => l["package:".Length..])
            .Where(p => ApkPathRx.IsMatch(p)).ToList();
    }

    /// <summary>Copy APKs from the stick to a PC folder. Returns the local files that arrived.</summary>
    public static async Task<List<string>> BackupApksAsync(Adb adb, IEnumerable<string> devicePaths, string folder)
    {
        Directory.CreateDirectory(folder);
        var saved = new List<string>();
        foreach (var dp in devicePaths)
        {
            var local = Path.Combine(folder, Path.GetFileName(dp));
            await adb.RunAsync(new[] { "pull", dp, local }, true, 10 * 60_000);
            if (File.Exists(local) && new FileInfo(local).Length > 0) saved.Add(local);
        }
        return saved;
    }

    /// <summary>
    /// Remove an app for the main profile, including system apps Fire OS won't let you uninstall.
    /// -k keeps its data. A system app's APK stays on the system partition (no root needed or used).
    /// </summary>
    public static async Task<(bool ok, string msg)> ForceRemoveAsync(Adb adb, string pkg)
    {
        var r = await adb.ShellAsync($"pm uninstall -k --user 0 {Checked(pkg)}", 120_000);
        var ok = r.All.Contains("Success");
        return (ok, ok ? "removed" : Explain(r.All));
    }

    /// <summary>Put a removed app back: first from the copy still on the stick, then from the PC backup.</summary>
    public static async Task<(bool ok, string msg)> RestoreAsync(Adb adb, string pkg, IReadOnlyList<string> devicePaths, IReadOnlyList<string> backups)
    {
        Checked(pkg);
        var last = "no copy of the app was found";
        if (devicePaths.Count == 1 && ApkPathRx.IsMatch(devicePaths[0]))
        {
            var r = await adb.ShellAsync($"pm install -r -d '{devicePaths[0]}'", 10 * 60_000);
            if (r.All.Contains("Success")) return (true, "restored from the copy on the stick");
            last = Explain(r.All);
        }
        var files = backups.Where(File.Exists).ToList();
        if (files.Count > 0)
        {
            var args = new List<string> { files.Count == 1 ? "install" : "install-multiple", "-r", "-d" };
            args.AddRange(files);
            var r = await adb.RunAsync(args, true, 15 * 60_000);
            if (r.All.Contains("Success")) return (true, "restored from the backup on this PC");
            last = Explain(r.All);
        }
        return (false, last);
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
        if (output.Contains("DELETE_FAILED")) return "Fire OS refused to remove it (" + FirstLine(output) + ")";
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
