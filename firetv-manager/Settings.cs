using System.Text.Json;

namespace FireTVManager;

public sealed class RemovedApp
{
    public List<string> DevicePaths { get; set; } = new();
    public List<string> Backups { get; set; } = new();
    public bool System { get; set; }
    public DateTime When { get; set; }
}

/// <summary>Saved in %APPDATA%\FireTVManager\settings.json.</summary>
public sealed class Settings
{
    public string Ip { get; set; } = "192.168.1.178";
    public string? AdbPath { get; set; }

    /// <summary>Packages this app disabled, so they can be re-enabled in one click.</summary>
    public SortedSet<string> DisabledByMe { get; set; } = new();

    /// <summary>Packages Fire OS refused to disable ("protected package"), so debloat stops offering them.</summary>
    public SortedSet<string> BlockedByFireOs { get; set; } = new();

    /// <summary>Apps this app force-removed, with where their APK was on the stick and the PC backup.</summary>
    public SortedDictionary<string, RemovedApp> RemovedByMe { get; set; } = new();

    public static string BackupDir => Path.Combine(Dir, "backups");

    static string Dir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FireTVManager");
    static string FilePath => Path.Combine(Dir, "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new Settings();
        }
        catch { }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }
}
