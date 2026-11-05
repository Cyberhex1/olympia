using System.Diagnostics;
using System.Text;

namespace FireTVManager;

public sealed record AdbResult(int ExitCode, string Output, string Error)
{
    public string All => (Output + "\n" + Error).Replace("\r", "").Trim();
}

/// <summary>Thin wrapper around adb.exe. Arguments go through ArgumentList, never a joined string.</summary>
public sealed class Adb
{
    public string ExePath { get; }
    public string? Serial { get; set; }

    public Adb(string exePath) => ExePath = exePath;

    /// <summary>Find adb.exe: saved path, next to the app, the usual SDK folders, then PATH.</summary>
    public static string? Find(string? configured)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(configured)) candidates.Add(configured);
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "adb.exe"));
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "platform-tools", "adb.exe"));
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        candidates.Add(Path.Combine(home, "android-build", "sdk", "platform-tools", "adb.exe"));
        foreach (var name in new[] { "ANDROID_HOME", "ANDROID_SDK_ROOT" })
        {
            var v = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrEmpty(v)) candidates.Add(Path.Combine(v, "platform-tools", "adb.exe"));
        }
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        candidates.Add(Path.Combine(local, "Android", "Sdk", "platform-tools", "adb.exe"));
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            try { candidates.Add(Path.Combine(dir.Trim('"'), "adb.exe")); } catch (ArgumentException) { }
        }
        return candidates.FirstOrDefault(File.Exists);
    }

    public async Task<AdbResult> RunAsync(IEnumerable<string> args, bool useSerial = true, int timeoutMs = 60_000)
    {
        var psi = new ProcessStartInfo(ExePath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (useSerial && Serial != null) { psi.ArgumentList.Add("-s"); psi.ArgumentList.Add(Serial); }
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var p = Process.Start(psi) ?? throw new InvalidOperationException("Could not start adb.");
        var outTask = p.StandardOutput.ReadToEndAsync();
        var errTask = p.StandardError.ReadToEndAsync();
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            await p.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            try { p.Kill(true); } catch { }
            return new AdbResult(-1, "", $"adb timed out after {timeoutMs / 1000}s");
        }
        return new AdbResult(p.ExitCode, await outTask, await errTask);
    }

    /// <summary>Run a shell command on the device. Callers must only interpolate validated package names.</summary>
    public Task<AdbResult> ShellAsync(string command, int timeoutMs = 30_000) =>
        RunAsync(new[] { "shell", command }, true, timeoutMs);
}
