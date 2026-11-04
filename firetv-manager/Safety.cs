namespace FireTVManager;

public sealed record DebloatItem(string Preset, string Package, string Name, string Why);

/// <summary>
/// What the app refuses to touch, and the conservative debloat presets.
/// Debloat only ever uses "disable" (pm disable-user), which is reversible with pm enable.
/// </summary>
public static class Safety
{
    // Packages the stick needs to boot, show the home screen, take remote input, stay signed in,
    // connect to Wi-Fi, install apps, or talk to adb. The app will not disable, uninstall or force-stop these.
    static readonly HashSet<string> ProtectedExact = new()
    {
        "android",
        "com.android.systemui", "com.android.settings", "com.android.shell", "com.android.packageinstaller",
        "com.android.defcontainer", "com.android.externalstorage", "com.android.bluetooth", "com.android.keychain",
        "com.android.location.fused", "com.android.inputdevices", "com.android.certinstaller",
        "com.amazon.tv.launcher", "com.amazon.firehomestarter", "com.amazon.tv.ime", "com.amazon.tv.oobe",
        "com.amazon.tv.keypolicymanager", "com.amazon.tv.intentsupport", "com.amazon.tv.routing",
        "com.amazon.fireinputdevices", "com.amazon.venezia", "com.amazon.android.marketplace",
        "com.amazon.device.software.ota", "com.amazon.device.software.ota.override",
        "com.amazon.uxcontrollerservice", "com.amazon.storage.manager", "com.amazon.device.lowstoragemanager",
        "com.amazon.application.compatibility.enforcer", "com.amazon.ftv.profilepicker", "com.amazon.platform.fdrw",
        "com.amazon.connectivitycontroller", "com.amazon.net.smartconnect", "com.amazon.wifilocker",
        "com.amazon.cardinal", "com.amazon.tv.devicecontrol", "com.amazon.tv.devicecontrolsettings",
        "com.amazon.device.sync", "com.amazon.sync.service", "com.amazon.sync.provider.ipc",
        "com.amazon.aca", "com.amazon.tv.consents", "com.amazon.vizzini", "com.amazon.vizzini.ftvcds",
        "com.amazon.client.metrics", "com.amazon.client.metrics.api", "com.amazon.metrics.api",
        "com.amazon.minerva.client.api", "com.amazon.device.messaging",
    };

    static readonly string[] ProtectedPrefixes =
    {
        "android.", "amazon.", "com.android.providers.", "com.amazon.tv.settings", "com.amazon.device.settings",
        "com.amazon.webview", "com.amazon.dcp", "com.amazon.identity", "com.amazon.tcomm", "com.amazon.ssm",
        "com.amazon.device.blue", "com.amazon.providers", "com.amazon.whisper", "com.mediatek.",
    };

    public static bool IsProtected(string pkg) =>
        ProtectedExact.Contains(pkg) || ProtectedPrefixes.Any(pkg.StartsWith) || pkg.EndsWith(".library") ||
        pkg.Contains(".sdk.");

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
