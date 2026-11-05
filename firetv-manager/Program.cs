namespace FireTVManager;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        // FireTVManager.exe --selftest <ip> <outfile> : read-only check (connect, info, app list), no changes made.
        if (args.Length >= 3 && args[0] == "--selftest")
            return SelfTest(args[1], args[2]).GetAwaiter().GetResult();

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
        return 0;
    }

    static async Task<int> SelfTest(string ip, string outFile)
    {
        var lines = new List<string>();
        try
        {
            var path = Adb.Find(null) ?? throw new Exception("adb.exe not found");
            var adb = new Adb(path);
            lines.Add("adb: " + path);
            var target = ip.Contains(':') ? ip : ip + ":5555";
            lines.Add("connect: " + (await adb.RunAsync(new[] { "connect", target }, false)).All);
            adb.Serial = target;
            lines.Add("state: " + (await adb.RunAsync(new[] { "get-state" })).All);
            var info = await FireTv.GetInfoAsync(adb);
            lines.Add($"info: {info.Model} | {info.FireOs} | RAM {info.FreeRam} | Storage {info.Storage}");
            var apps = await FireTv.LoadAppsAsync(adb);
            lines.Add($"apps: {apps.Count} total, {apps.Count(a => !a.System)} user, {apps.Count(a => a.Disabled)} disabled, {apps.Count(a => a.Running)} running");
            lines.Add("foreground: " + string.Join(",", apps.Where(a => a.Foreground).Select(a => a.Package)));
            lines.Add("user apps: " + string.Join(", ", apps.Where(a => !a.System).Select(a => a.Package + (a.Running ? "*" : ""))));
            lines.Add("running (not core): " + string.Join(", ", apps.Where(a => a.Running && !Safety.IsCore(a.Package)).Select(a => a.Package)));
            lines.Add($"removed: {apps.Count(a => a.Removed)}; core: {apps.Count(a => Safety.IsCore(a.Package))}; caution: {apps.Count(a => Safety.Caution(a.Package) != null)}");
            // backup check: copies one APK to the PC, changes nothing on the stick
            var probe = "com.amazon.ftvads.deeplinking";
            var paths = await FireTv.GetApkPathsAsync(adb, probe);
            var saved = await FireTv.BackupApksAsync(adb, paths, Path.Combine(Path.GetTempPath(), "ftvm-backup-test"));
            lines.Add($"backup test {probe}: paths={string.Join(",", paths)} saved={string.Join(",", saved.Select(s => $"{s} ({new FileInfo(s).Length} bytes)"))}");
            var present = apps.Select(a => a.Package).ToHashSet();
            foreach (var d in Safety.Items)
                lines.Add($"debloat {(present.Contains(d.Package) ? "present" : "missing")}: {d.Package}{(Safety.IsCore(d.Package) ? " CORE?!" : "")}");
            return 0;
        }
        catch (Exception ex) { lines.Add("ERROR " + ex); return 1; }
        finally { File.WriteAllLines(outFile, lines); }
    }
}
