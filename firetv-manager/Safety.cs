namespace FireTVManager;

public sealed record DebloatItem(string Preset, string Package, string Name, string Why);

/// <summary>
/// What the app refuses to touch, what it warns about, and the conservative debloat presets.
/// Debloat uses "disable" (pm disable-user), which is reversible with pm enable.
/// </summary>
public static class Safety
{
    // Core packages: without these the stick won't boot, show the home screen, take remote or keyboard
    // input, connect to Wi-Fi, stay signed in, install apps or talk to adb. Never disabled, removed or stopped.
    static readonly HashSet<string> CoreExact = new()
    {
        "android",
        "com.android.systemui", "com.android.settings", "com.android.shell", "com.android.packageinstaller",
        "com.android.defcontainer", "com.android.externalstorage", "com.android.bluetooth", "com.android.keychain",
        "com.android.location.fused", "com.android.inputdevices", "com.android.certinstaller",
        "com.amazon.tv.launcher", "com.amazon.firehomestarter", "com.amazon.tv.ime", "com.amazon.tv.oobe",
        "com.amazon.tv.keypolicymanager", "com.amazon.tv.intentsupport", "com.amazon.tv.routing",
        "com.amazon.fireinputdevices", "com.amazon.uxcontrollerservice",
        "com.amazon.application.compatibility.enforcer",
        "com.amazon.connectivitycontroller", "com.amazon.net.smartconnect", "com.amazon.wifilocker",
        "com.amazon.client.metrics", "com.amazon.client.metrics.api", "com.amazon.metrics.api",
        "com.amazon.minerva.client.api",
    };

    static readonly string[] CorePrefixes =
    {
        "android.", "amazon.", "com.android.providers.", "com.amazon.tv.settings", "com.amazon.device.settings",
        "com.amazon.webview", "com.amazon.dcp", "com.amazon.identity", "com.amazon.tcomm", "com.amazon.ssm",
        "com.amazon.device.blue", "com.amazon.providers", "com.mediatek.",
    };

    // Caution packages: the stick still works without them, but something you may want breaks
    // (Appstore and app updates, system updates, profiles, Alexa voice, casting, sync). Allowed with a warning.
    static readonly Dictionary<string, string> CautionExact = new()
    {
        ["com.amazon.venezia"] = "Appstore: you can't install or update Amazon apps without it",
        ["com.amazon.android.marketplace"] = "Appstore services: in-app purchases and app updates",
        ["com.amazon.device.software.ota"] = "System updates",
        ["com.amazon.device.software.ota.override"] = "System updates",
        ["com.amazon.storage.manager"] = "Storage manager",
        ["com.amazon.device.lowstoragemanager"] = "Low-storage warnings",
        ["com.amazon.ftv.profilepicker"] = "Profile picker at start-up",
        ["com.amazon.platform.fdrw"] = "Platform service",
        ["com.amazon.cardinal"] = "Platform service",
        ["com.amazon.tv.devicecontrol"] = "TV and soundbar control from the remote",
        ["com.amazon.tv.devicecontrolsettings"] = "TV and soundbar control settings",
        ["com.amazon.device.sync"] = "Account sync",
        ["com.amazon.sync.service"] = "Account sync",
        ["com.amazon.sync.provider.ipc"] = "Account sync",
        ["com.amazon.aca"] = "Platform service",
        ["com.amazon.tv.consents"] = "Privacy consent screens",
        ["com.amazon.vizzini"] = "Alexa voice search on the remote",
        ["com.amazon.vizzini.ftvcds"] = "Alexa voice search on the remote",
        ["com.amazon.device.messaging"] = "Push messages that many apps rely on",
    };

    public static bool IsCore(string pkg) =>
        CoreExact.Contains(pkg) || CorePrefixes.Any(pkg.StartsWith) || pkg.EndsWith(".library") || pkg.Contains(".sdk.");

    /// <summary>Why removing this one could break something, or null when it's not a known risky package.</summary>
    public static string? Caution(string pkg) =>
        CautionExact.TryGetValue(pkg, out var why) ? why : pkg.StartsWith("com.amazon.whisper") ? "Casting and device discovery" : null;

    public static string? NameOf(string pkg) => Items.FirstOrDefault(i => i.Package == pkg)?.Name;

    public static readonly string[] Presets = { "Telemetry & logging", "Ads & promotions", "Optional Amazon apps" };

    public static readonly DebloatItem[] Items =
    {
        new(Presets[0], "com.amazon.device.crashmanager", "Crash reporter", "Uploads crash reports to Amazon."),
        new(Presets[0], "com.amazon.device.logmanager", "Log manager", "Collects and uploads system logs."),
        new(Presets[0], "com.amazon.dp.logger", "Device logger", "Background usage logging."),
        new(Presets[0], "com.amazon.tv.fw.metrics", "Framework metrics", "Sends usage metrics."),
        new(Presets[0], "com.amazon.wirelessmetrics.service", "Wireless metrics", "Sends Wi-Fi statistics."),
        new(Presets[0], "com.amazon.perfcollection", "Performance collection", "Collects performance data."),
        new(Presets[0], "com.amazon.device.metrics", "Device metrics", "Device statistics reporting."),

        new(Presets[1], "com.amazon.sneakpeek", "Sneak Peek", "Auto-playing previews on the home screen."),
        new(Presets[1], "com.amazon.kso.blackbird", "Sponsored content", "Sponsored rows and banners on the home screen."),
        new(Presets[1], "com.amazon.hybridadidservice", "Advertising ID", "Ad-tracking ID service."),
        new(Presets[1], "com.amazon.ftvads.deeplinking", "Ad deep links", "Opens apps from sponsored tiles."),
        new(Presets[1], "com.amazon.shoptv.client", "Shop on TV", "Amazon shopping on the TV."),
        new(Presets[1], "com.amazon.shoptv.firetv.client", "Shop on TV (Fire TV)", "Amazon shopping on the TV."),

        new(Presets[2], "com.amazon.imdb.tv.android.app", "Freevee", "Amazon's free streaming app."),
        new(Presets[2], "com.imdb.livingroom.firetv", "IMDb", "IMDb app."),
        new(Presets[2], "com.amazon.minitv.android.app", "miniTV", "Amazon miniTV."),
        new(Presets[2], "com.amazon.gamehub", "Games hub", "Amazon games storefront."),
        new(Presets[2], "com.amazon.bueller.photos", "Amazon Photos", "Photos app and photo screensaver source."),
        new(Presets[2], "com.amazon.bueller.music", "Amazon Music", "Built-in music player."),
        new(Presets[2], "com.amazon.cloud9", "Silk Browser", "Amazon's web browser."),
        new(Presets[2], "com.amazon.tahoe", "Amazon Kids", "Kids profiles (FreeTime)."),
        new(Presets[2], "com.amazon.tmm.tutorial", "Tutorial", "First-run tutorial."),
        new(Presets[2], "com.amazon.storm.lightning.tutorial", "Tutorial videos", "Help and tutorial videos."),
        new(Presets[2], "com.amazon.tv.releasenotes", "Release notes", "\"What's new\" pop-ups after updates."),
    };
}
