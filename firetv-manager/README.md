# Fire TV Manager

A small Windows app that manages a Fire TV stick over Wi-Fi ADB.

- **Install APKs**: drop `.apk` files anywhere on the window, or click the drop area to pick them.
- **Apps**: every app on the stick (yours, system, disabled and removed), with a filter. Open, force-stop,
  uninstall, disable or enable them.
- **Force remove / Restore**: removes apps Fire OS won't let you uninstall or disable, using
  `pm uninstall -k --user 0` (no root). A copy of the APK is saved to `%APPDATA%\FireTVManagerackups` first,
  and Restore reinstalls it from the stick's system copy or that backup. A factory reset also brings built-in apps back.
- **Running**: see what is running, force-stop selected apps, stop every background app of yours
  (the one on screen is left alone), and clear app caches.
- **Debloat**: three conservative presets (telemetry, ads and promotions, optional Amazon apps).
  Debloat only *disables* apps with `pm disable-user`, so nothing is deleted, and
  "Re-enable everything I disabled" undoes it.

Core Fire TV packages (launcher, settings, input, Wi-Fi, accounts, web view, adb shell, shared libraries)
are on a list in `Safety.cs`; the app refuses to disable, remove or force-stop them. Packages that are safe
to remove but turn off a feature (Appstore, system updates, Alexa voice, casting, sync) are marked Caution
and get a warning first.

## Requirements

- Windows with the .NET 8 Desktop Runtime.
- `adb.exe` from Android platform-tools. The app looks next to itself, in
  `%USERPROFILE%\android-build\sdk\platform-tools`, `ANDROID_HOME`, the default Android SDK folder and `PATH`,
  and asks for it if none is found.
- On the Fire TV: Settings > My Fire TV > Developer options > ADB debugging on. The first time,
  accept the "Allow USB debugging" prompt on the TV.

Settings (IP, adb path, and which apps the app disabled) live in `%APPDATA%\FireTVManager\settings.json`.

## Build

```
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o dist
```

`dist\FireTVManager.exe --selftest <ip> <outfile>` runs a read-only check (connect, device info, app list)
and writes the result to a file.
