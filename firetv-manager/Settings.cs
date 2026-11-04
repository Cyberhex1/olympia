using System.Text.Json;

namespace FireTVManager;

/// <summary>Saved in %APPDATA%\FireTVManager\settings.json.</summary>
public sealed class Settings
{
    public string Ip { get; set; } = "192.168.1.178";
    public string? AdbPath { get; set; }

    /// <summary>Packages this app disabled, so they can be re-enabled in one click.</summary>
    public SortedSet<string> DisabledByMe { get; set; } = new();

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
