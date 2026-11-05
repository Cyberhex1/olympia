namespace FireTVManager;

public sealed class MainForm : Form
{
    readonly Settings settings = Settings.Load();
    Adb? adb;
    bool connected;
    bool busy;
    List<AppInfo> apps = new();

    // top bar
    readonly TextBox ipBox = new() { Width = 130, Margin = new Padding(3, 5, 3, 3) };
    readonly Button connectBtn = new() { Text = "Connect", AutoSize = true };
    readonly Button disconnectBtn = new() { Text = "Disconnect", AutoSize = true };
    readonly Button refreshBtn = new() { Text = "Refresh", AutoSize = true };
    readonly Label statusLabel = new() { AutoSize = true, Margin = new Padding(10, 8, 3, 3), Text = "Not connected" };

    readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    readonly TextBox log = new()
    {
        Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill,
        Font = new Font("Consolas", 9f), BackColor = SystemColors.Window,
    };

    // install tab
    readonly Label dropZone = new()
    {
        Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, AllowDrop = true,
        BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 13f),
        Text = "Drop .apk files here\r\n\r\nor click to choose files",
        Cursor = Cursors.Hand,
    };

    // apps tab
    readonly TextBox appFilter = new() { Width = 220, PlaceholderText = "Filter by package name", Margin = new Padding(3, 5, 3, 3) };
    readonly ComboBox appKind = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList, Width = 150, Margin = new Padding(3, 5, 3, 3),
    };
    readonly Label appCount = new() { AutoSize = true, Margin = new Padding(8, 8, 3, 3) };
    readonly ListView appsList = MakeList(("Package", 300), ("Name", 130), ("Type", 60), ("State", 75), ("Running", 70), ("Note", 260));

    // running tab
    readonly ListView runningList = MakeList(("Package", 360), ("Type", 70), ("Status", 120));

    // debloat tab
    readonly ListView debloatList = MakeList(("App", 170), ("Package", 250), ("Group", 140), ("Status", 90), ("What it does", 300));

    readonly List<Button> deviceButtons = new();

    public MainForm()
    {
        Text = "Fire TV Manager";
        Width = 960; Height = 680;
        MinimumSize = new Size(760, 520);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9f);
        AllowDrop = true;

        ipBox.Text = settings.Ip;

        var top = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(6), WrapContents = false };
        top.Controls.AddRange(new Control[]
        {
            new Label { Text = "Fire TV IP:", AutoSize = true, Margin = new Padding(3, 8, 3, 3) },
            ipBox, connectBtn, disconnectBtn, refreshBtn, statusLabel,
        });
        connectBtn.Click += async (_, _) => await ConnectAsync();
        disconnectBtn.Click += async (_, _) => await DisconnectAsync();
        refreshBtn.Click += async (_, _) => await Run("Refreshing", RefreshAllAsync);
        ipBox.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await ConnectAsync(); } };

        tabs.TabPages.Add(BuildInstallTab());
        tabs.TabPages.Add(BuildAppsTab());
        tabs.TabPages.Add(BuildRunningTab());
        tabs.TabPages.Add(BuildDebloatTab());

        var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, FixedPanel = FixedPanel.Panel2 };
        split.Panel1.Controls.Add(tabs);
        split.Panel2.Controls.Add(log);

        Controls.Add(top);
        Controls.Add(split);
        split.BringToFront();
        Load += (_, _) => { split.SplitterDistance = Math.Max(200, split.Height - 140); };

        // dropping anywhere on the window installs
        DragEnter += OnDragEnter;
        DragDrop += OnDragDrop;

        UpdateEnabled();
        Shown += async (_, _) =>
        {
            var path = Adb.Find(settings.AdbPath);
            if (path == null)
            {
                Log("adb.exe was not found. Install Android platform-tools, or put adb.exe next to this app.");
                PickAdb();
            }
            else SetAdb(path);
            if (adb != null) await ConnectAsync();
        };
        FormClosing += (_, _) => { settings.Ip = ipBox.Text.Trim(); settings.Save(); };
    }

    // ---------- tabs ----------

    TabPage BuildInstallTab()
    {
        var page = new TabPage("Install APKs") { Padding = new Padding(10) };
        dropZone.DragEnter += OnDragEnter;
        dropZone.DragDrop += OnDragDrop;
        dropZone.Click += async (_, _) =>
        {
            if (!connected) { Log("Connect to the Fire TV first."); return; }
            using var dlg = new OpenFileDialog { Filter = "Android apps (*.apk)|*.apk", Multiselect = true, Title = "Choose APKs to install" };
            if (dlg.ShowDialog(this) == DialogResult.OK) await InstallFilesAsync(dlg.FileNames);
        };
        page.Controls.Add(dropZone);
        return page;
    }

    TabPage BuildAppsTab()
    {
        var page = new TabPage("Apps");
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(4) };
        var launch = Btn("Open", async () => await ForSelected(appsList, "Opening", async p => Report(p, await FireTv.LaunchAsync(adb!, p)), allowProtected: true, allowSystem: true));
        var stop = Btn("Force stop", async () => await ForSelected(appsList, "Force-stopping", async p => { await FireTv.ForceStopAsync(adb!, p); Log($"{p}: stopped"); }, allowSystem: true));
        var uninstall = Btn("Uninstall", UninstallSelectedAsync);
        var disable = Btn("Disable", async () => await DisableAsync(Selected(appsList)));
        var enable = Btn("Enable", async () => await EnableAsync(Selected(appsList)));
        var remove = Btn("Force remove", async () => await ForceRemoveAsync(Selected(appsList)));
        var restore = Btn("Restore", async () => await RestoreAsync(Selected(appsList)));
        var tip = new ToolTip();
        tip.SetToolTip(remove, "Removes apps Fire OS won't let you uninstall, for your profile. A backup copy is saved on this PC first.");
        tip.SetToolTip(restore, "Puts back apps that were force-removed.");
        bar.Controls.AddRange(new Control[] { appFilter, appKind, launch, stop, uninstall, disable, enable, remove, restore, appCount });
        appKind.Items.AddRange(new object[] { "All apps", "Installed by you", "System apps", "Disabled", "Removed" });
        appKind.SelectedIndex = 0;
        appFilter.TextChanged += (_, _) => FillAppsList();
        appKind.SelectedIndexChanged += (_, _) => FillAppsList();
        page.Controls.Add(appsList);
        page.Controls.Add(bar);
        appsList.BringToFront();
        return page;
    }

    TabPage BuildRunningTab()
    {
        var page = new TabPage("Running");
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(4) };
        var stop = Btn("Force stop selected", async () => await ForSelected(runningList, "Force-stopping", async p => { await FireTv.ForceStopAsync(adb!, p); Log($"{p}: stopped"); }, allowSystem: true));
        var stopAll = Btn("Stop all background apps", StopAllBackgroundAsync);
        var cache = Btn("Clear app caches", async () => await Run("Clearing app caches", async () =>
        {
            var before = (await FireTv.GetInfoAsync(adb!)).Storage;
            var msg = await FireTv.TrimCachesAsync(adb!);
            var after = (await FireTv.GetInfoAsync(adb!)).Storage;
            Log($"Cache clear: {msg}. Storage before: {before}, after: {after}");
            await RefreshInfoAsync();
        }));
        bar.Controls.AddRange(new Control[] { stop, stopAll, cache });
        page.Controls.Add(runningList);
        page.Controls.Add(bar);
        runningList.BringToFront();
        return page;
    }

    TabPage BuildDebloatTab()
    {
        var page = new TabPage("Debloat");
        debloatList.CheckBoxes = true;
        var note = new Label
        {
            Dock = DockStyle.Top, AutoSize = false, Height = 58, Padding = new Padding(6, 6, 6, 0),
            Text = "Debloat only disables apps (nothing is deleted) and every change can be undone with \"Re-enable\". " +
                   "Tick a group or single apps, then press \"Disable ticked\". If Fire OS won't allow that, " +
                   "\"Force remove ticked\" removes it instead (a backup is kept on this PC, and \"Restore ticked\" puts it back).",
        };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(4) };
        foreach (var preset in Safety.Presets)
        {
            var b = new Button { Text = "Tick: " + preset, AutoSize = true };
            b.Click += (_, _) =>
            {
                foreach (ListViewItem it in debloatList.Items)
                    if (((DebloatItem)it.Tag!).Preset == preset && it.ForeColor != SystemColors.GrayText) it.Checked = true;
            };
            bar.Controls.Add(b);
        }
        var clear = new Button { Text = "Untick all", AutoSize = true };
        clear.Click += (_, _) => { foreach (ListViewItem it in debloatList.Items) it.Checked = false; };
        bar.Controls.Add(clear);
        bar.Controls.Add(Btn("Disable ticked", async () => await DisableAsync(Ticked())));
        bar.Controls.Add(Btn("Re-enable ticked", async () => await EnableAsync(Ticked())));
        bar.Controls.Add(Btn("Re-enable everything I disabled", async () => await EnableAsync(settings.DisabledByMe.ToList())));
        bar.Controls.Add(Btn("Force remove ticked", async () => await ForceRemoveAsync(Ticked())));
        bar.Controls.Add(Btn("Restore ticked", async () => await RestoreAsync(Ticked())));

        page.Controls.Add(debloatList);
        page.Controls.Add(bar);
        page.Controls.Add(note);
        debloatList.BringToFront();
        return page;
    }

    List<string> Ticked() => debloatList.Items.Cast<ListViewItem>().Where(i => i.Checked)
        .Select(i => ((DebloatItem)i.Tag!).Package).ToList();

    // ---------- connection ----------

    void PickAdb()
    {
        using var dlg = new OpenFileDialog { Filter = "adb.exe|adb.exe", Title = "Where is adb.exe?" };
        if (dlg.ShowDialog(this) == DialogResult.OK) SetAdb(dlg.FileName);
    }

    void SetAdb(string path)
    {
        adb = new Adb(path);
        settings.AdbPath = path;
        settings.Save();
        Log("Using adb: " + path);
    }

    async Task ConnectAsync()
    {
        if (adb == null) { PickAdb(); if (adb == null) return; }
        var ip = ipBox.Text.Trim();
        if (string.IsNullOrEmpty(ip)) return;
        var target = ip.Contains(':') ? ip : ip + ":5555";
        await Run($"Connecting to {target}", async () =>
        {
            var r = await adb!.RunAsync(new[] { "connect", target }, useSerial: false, timeoutMs: 20_000);
            Log(r.All);
            adb.Serial = target;
            var state = (await adb.RunAsync(new[] { "get-state" }, timeoutMs: 10_000)).All;
            if (state.Contains("unauthorized"))
            {
                connected = false;
                statusLabel.Text = "Waiting: accept the \"Allow USB debugging\" prompt on the TV, then press Connect again";
                return;
            }
            if (!state.Trim().EndsWith("device"))
            {
                connected = false;
                statusLabel.Text = "Not connected. Check the IP, and that ADB debugging is on (Settings > My Fire TV > Developer options)";
                Log(state);
                return;
            }
            connected = true;
            settings.Ip = ip;
            settings.Save();
            await RefreshAllAsync();
        });
    }

    async Task DisconnectAsync()
    {
        if (adb?.Serial == null) return;
        await Run("Disconnecting", async () =>
        {
            Log((await adb.RunAsync(new[] { "disconnect", adb.Serial }, useSerial: false)).All);
            connected = false;
            statusLabel.Text = "Not connected";
            apps.Clear();
            FillAll();
        });
    }

    async Task RefreshAllAsync()
    {
        await RefreshInfoAsync();
        apps = await FireTv.LoadAppsAsync(adb!);
        FillAll();
        Log($"Found {apps.Count} apps ({apps.Count(a => !a.System)} installed by you, {apps.Count(a => a.Disabled)} disabled).");
    }

    async Task RefreshInfoAsync()
    {
        var info = await FireTv.GetInfoAsync(adb!);
        statusLabel.Text = $"Connected: {info.Model}, {info.FireOs}  |  RAM {info.FreeRam}  |  Storage {info.Storage}";
    }

    // ---------- lists ----------

    void FillAll() { FillAppsList(); FillRunningList(); FillDebloatList(); }

    void FillAppsList()
    {
        var f = appFilter.Text.Trim();
        appsList.BeginUpdate();
        appsList.Items.Clear();
        var kind = appKind.SelectedIndex;
        foreach (var a in apps)
        {
            var show = kind switch
            {
                1 => !a.System && !a.Removed,
                2 => a.System && !a.Removed,
                3 => a.Disabled && !a.Removed,
                4 => a.Removed,
                _ => true,
            };
            if (!show) continue;
            var name = Safety.NameOf(a.Package) ?? "";
            if (f.Length > 0 && !a.Package.Contains(f, StringComparison.OrdinalIgnoreCase) &&
                !name.Contains(f, StringComparison.OrdinalIgnoreCase)) continue;
            var note = Safety.IsCore(a.Package) ? "Core part of Fire TV, can't be changed here"
                : Safety.Caution(a.Package) is { } why ? "Caution: " + why
                : settings.BlockedByFireOs.Contains(a.Package) && !a.Disabled ? "Fire OS won't disable it; Force remove works instead"
                : "";
            var it = new ListViewItem(new[]
            {
                a.Package, name, a.System ? "System" : "Yours",
                a.Removed ? "Removed" : a.Disabled ? "Disabled" : "Enabled",
                a.Foreground ? "On screen" : a.Running ? "Yes" : "", note,
            }) { Tag = a.Package };
            if (Safety.IsCore(a.Package)) it.ForeColor = SystemColors.GrayText;
            else if (a.Removed || a.Disabled) it.ForeColor = Color.Firebrick;
            appsList.Items.Add(it);
        }
        appsList.EndUpdate();
        appCount.Text = $"{appsList.Items.Count} of {apps.Count} apps";
    }

    void FillRunningList()
    {
        runningList.BeginUpdate();
        runningList.Items.Clear();
        foreach (var a in apps.Where(a => a.Running && !Safety.IsCore(a.Package))
                     .OrderBy(a => a.System).ThenBy(a => a.Package))
        {
            runningList.Items.Add(new ListViewItem(new[]
            {
                a.Package, a.System ? "System" : "Yours", a.Foreground ? "On screen" : "Background",
            }) { Tag = a.Package });
        }
        runningList.EndUpdate();
    }

    void FillDebloatList()
    {
        var byPkg = apps.ToDictionary(a => a.Package);
        debloatList.BeginUpdate();
        debloatList.Items.Clear();
        foreach (var d in Safety.Items)
        {
            var exists = byPkg.TryGetValue(d.Package, out var a);
            var blocked = exists && !a!.Disabled && settings.BlockedByFireOs.Contains(d.Package);
            var status = !exists ? "Not on stick" : a!.Removed ? "Removed" : a.Disabled ? "Disabled" : blocked ? "Fire OS won't allow" : "Enabled";
            var it = new ListViewItem(new[] { d.Name, d.Package, d.Preset, status, d.Why }) { Tag = d };
            if (a == null || blocked) it.ForeColor = SystemColors.GrayText;
            else if (a.Disabled || a.Removed) it.ForeColor = Color.Firebrick;
            debloatList.Items.Add(it);
        }
        debloatList.EndUpdate();
    }

    static List<string> Selected(ListView list) =>
        list.SelectedItems.Cast<ListViewItem>().Select(i => (string)i.Tag!).ToList();

    // ---------- actions ----------

    async Task ForSelected(ListView list, string verb, Func<string, Task> action, bool allowProtected = false, bool allowSystem = false)
    {
        var pkgs = Selected(list);
        if (pkgs.Count == 0) { Log("Select one or more apps first."); return; }
        await Run(verb, async () =>
        {
            foreach (var p in pkgs)
            {
                if (!allowProtected && Safety.IsCore(p)) { Log($"{p}: skipped, the Fire TV needs it"); continue; }
                await action(p);
            }
            await RefreshAllAsync();
        });
    }

    async Task UninstallSelectedAsync()
    {
        var pkgs = Selected(appsList);
        if (pkgs.Count == 0) { Log("Select one or more apps first."); return; }
        var system = pkgs.Where(p => apps.FirstOrDefault(a => a.Package == p)?.System != false).ToList();
        if (system.Count > 0)
            Log("Fire OS won't uninstall system apps. Use Disable, or Force remove: " + string.Join(", ", system));
        var mine = pkgs.Except(system).ToList();
        if (mine.Count == 0) return;
        if (!Confirm($"Uninstall {mine.Count} app(s)? Their data on the stick is deleted too.\n\n" + string.Join("\n", mine))) return;
        await Run("Uninstalling", async () =>
        {
            foreach (var p in mine) Report(p, await FireTv.UninstallAsync(adb!, p));
            await RefreshAllAsync();
        });
    }

    async Task DisableAsync(List<string> pkgs)
    {
        if (pkgs.Count == 0) { Log("Select or tick apps first."); return; }
        var blocked = pkgs.Where(Safety.IsCore).ToList();
        foreach (var p in blocked) Log($"{p}: skipped, the Fire TV needs it");
        var todo = pkgs.Except(blocked).ToList();
        if (todo.Count == 0) return;
        if (!Confirm($"Disable {todo.Count} app(s)? They stop running and disappear from the menus. " +
                     "You can turn them back on any time with Enable / Re-enable.\n\n" + Describe(todo))) return;
        await Run("Disabling", async () =>
        {
            foreach (var p in todo)
            {
                var r = await FireTv.DisableAsync(adb!, p);
                Report(p, r);
                if (r.ok) settings.DisabledByMe.Add(p);
                else if (r.msg.Contains("Fire OS blocked")) settings.BlockedByFireOs.Add(p);
            }
            settings.Save();
            await RefreshAllAsync();
        });
    }

    static string Describe(IEnumerable<string> pkgs) => string.Join("\n", pkgs.Select(p =>
        Safety.Caution(p) is { } why ? $"{p}   (CAUTION: {why})" : p));

    AppInfo? Find(string pkg) => apps.FirstOrDefault(a => a.Package == pkg);

    async Task ForceRemoveAsync(List<string> pkgs)
    {
        if (pkgs.Count == 0) { Log("Select or tick apps first."); return; }
        var core = pkgs.Where(Safety.IsCore).ToList();
        foreach (var p in core) Log($"{p}: skipped, it's a core part of Fire TV and removing it could stop the stick working");
        var todo = pkgs.Except(core).Where(p => Find(p) is { Removed: false }).ToList();
        foreach (var p in pkgs.Except(core).Except(todo)) Log($"{p}: already removed or not on the stick");
        if (todo.Count == 0) return;
        var cautions = todo.Count(p => Safety.Caution(p) != null);
        var text = $"Force remove {todo.Count} app(s)?\n\n" +
                   "This removes them for your profile even when Fire OS won't let you uninstall them. " +
                   "A copy of each app is saved on this PC first, and \"Restore\" puts it back. " +
                   "If a restore ever fails, a factory reset brings every built-in app back.\n\n" +
                   (cautions > 0 ? $"{cautions} of these are marked CAUTION: the stick keeps working, but the feature named stops.\n\n" : "") +
                   Describe(todo);
        if (MessageBox.Show(this, text, "Fire TV Manager", MessageBoxButtons.OKCancel,
                cautions > 0 ? MessageBoxIcon.Warning : MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.OK) return;
        await Run("Force-removing", async () =>
        {
            foreach (var p in todo)
            {
                var app = Find(p)!;
                if (!app.System)
                {
                    Report(p, await FireTv.UninstallAsync(adb!, p));
                    continue;
                }
                var paths = await FireTv.GetApkPathsAsync(adb!, p);
                var backups = await FireTv.BackupApksAsync(adb!, paths, Path.Combine(Settings.BackupDir, p));
                if (paths.Count == 0 || backups.Count != paths.Count)
                {
                    Log($"{p}: skipped, couldn't save a backup copy to this PC first");
                    continue;
                }
                var r = await FireTv.ForceRemoveAsync(adb!, p);
                Report(p, r);
                if (r.ok)
                {
                    settings.RemovedByMe[p] = new RemovedApp { DevicePaths = paths, Backups = backups, System = true, When = DateTime.Now };
                    settings.DisabledByMe.Remove(p);
                    settings.Save();
                }
            }
            await RefreshAllAsync();
        });
    }

    async Task RestoreAsync(List<string> pkgs)
    {
        var todo = pkgs.Where(p => Find(p) is { Removed: true }).ToList();
        if (todo.Count == 0) { Log("Pick apps whose state is \"Removed\" to restore them."); return; }
        await Run("Restoring", async () =>
        {
            foreach (var p in todo)
            {
                settings.RemovedByMe.TryGetValue(p, out var rec);
                var paths = rec?.DevicePaths ?? new List<string>();
                var backups = rec?.Backups ?? new List<string>();
                if (paths.Count == 0) paths = await FireTv.GetApkPathsAsync(adb!, p);
                var r = await FireTv.RestoreAsync(adb!, p, paths, backups);
                Report(p, r);
                if (r.ok) { settings.RemovedByMe.Remove(p); settings.Save(); }
            }
            await RefreshAllAsync();
        });
    }

    async Task EnableAsync(List<string> pkgs)
    {
        if (pkgs.Count == 0) { Log("Nothing to re-enable."); return; }
        await Run("Enabling", async () =>
        {
            foreach (var p in pkgs)
            {
                var r = await FireTv.EnableAsync(adb!, p);
                Report(p, r);
                if (r.ok) settings.DisabledByMe.Remove(p);
            }
            settings.Save();
            await RefreshAllAsync();
        });
    }

    async Task StopAllBackgroundAsync()
    {
        var targets = apps.Where(a => a.Running && !a.Foreground && !a.System && !Safety.IsCore(a.Package))
            .Select(a => a.Package).ToList();
        if (targets.Count == 0) { Log("No apps of yours are running in the background."); return; }
        if (!Confirm($"Force-stop {targets.Count} background app(s)? The app on screen is left alone.\n\n" + string.Join("\n", targets))) return;
        await Run("Stopping background apps", async () =>
        {
            foreach (var p in targets) { await FireTv.ForceStopAsync(adb!, p); Log($"{p}: stopped"); }
            await RefreshAllAsync();
        });
    }

    async Task InstallFilesAsync(IEnumerable<string> files)
    {
        var apks = files.Where(f => f.EndsWith(".apk", StringComparison.OrdinalIgnoreCase) && File.Exists(f)).ToList();
        var other = files.Except(apks).ToList();
        foreach (var f in other) Log($"{Path.GetFileName(f)}: skipped, only .apk files can be installed");
        if (apks.Count == 0) return;
        if (!connected) { Log("Connect to the Fire TV first."); return; }
        tabs.SelectedIndex = 0;
        await Run("Installing", async () =>
        {
            var i = 0;
            foreach (var f in apks)
            {
                i++;
                var mb = new FileInfo(f).Length / 1024d / 1024d;
                dropZone.Text = $"Installing {i} of {apks.Count}\r\n{Path.GetFileName(f)} ({mb:0.0} MB)";
                Log($"Installing {Path.GetFileName(f)} ({mb:0.0} MB)...");
                Report(Path.GetFileName(f), await FireTv.InstallAsync(adb!, f));
            }
            await RefreshAllAsync();
        });
        dropZone.Text = "Drop .apk files here\r\n\r\nor click to choose files";
    }

    void OnDragEnter(object? sender, DragEventArgs e)
    {
        e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true && !busy ? DragDropEffects.Copy : DragDropEffects.None;
    }

    async void OnDragDrop(object? sender, DragEventArgs e)
    {
        if (e.Data?.GetData(DataFormats.FileDrop) is string[] files) await InstallFilesAsync(files);
    }

    // ---------- helpers ----------

    async Task Run(string what, Func<Task> work)
    {
        if (busy) { Log("Still working on the last step, one moment."); return; }
        if (adb == null) { Log("adb.exe isn't set up yet."); return; }
        busy = true;
        UpdateEnabled();
        UseWaitCursor = true;
        Log(what + "...");
        try { await work(); }
        catch (Exception ex) { Log("Error: " + ex.Message); }
        finally
        {
            busy = false;
            UseWaitCursor = false;
            UpdateEnabled();
        }
    }

    void UpdateEnabled()
    {
        connectBtn.Enabled = !busy;
        disconnectBtn.Enabled = !busy && connected;
        refreshBtn.Enabled = !busy && connected;
        foreach (var b in deviceButtons) b.Enabled = !busy && connected;
    }

    Button Btn(string text, Func<Task> onClick)
    {
        var b = new Button { Text = text, AutoSize = true };
        b.Click += async (_, _) => { if (connected && !busy) await onClick(); };
        deviceButtons.Add(b);
        return b;
    }

    void Report(string what, (bool ok, string msg) r) => Log($"{what}: {(r.ok ? "" : "FAILED, ")}{r.msg}");

    bool Confirm(string text) =>
        MessageBox.Show(this, text, "Fire TV Manager", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK;

    void Log(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        log.AppendText($"[{DateTime.Now:HH:mm:ss}] {line.Trim()}\r\n");
    }

    static ListView MakeList(params (string name, int width)[] cols)
    {
        var lv = new ListView { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HideSelection = false, GridLines = false };
        foreach (var (name, width) in cols) lv.Columns.Add(name, width);
        return lv;
    }
}
