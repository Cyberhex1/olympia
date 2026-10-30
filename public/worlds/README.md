# Worlds

The Settings panel (⚙ Settings, or press S) lists the worlds in `worlds.json`, in two groups:

- **Olympia's island** (`"group": "island"`): Olympus, the Cozy Village and ten looks that restyle the Olympus island
  (Golden Hour, Night Watch, Black-figure Vase, Sea Chart, Diorama Ops, Agora Board, Pocket Olympia, Oracle's Scroll,
  In Elevation, Holo Command).
- **Other worlds** (`"group": "world"`): ten places that dress the same island as somewhere else (Farmers Market,
  Night City, The Office, Bus Lines, Space Station, Pirate Harbor, Theme Park, Restaurant Kitchen, Haunted Cemetery,
  Factory Floor). Same layout and the same live logic; different buildings, ground, residents, sky and UI.

## worlds.json entries

| Field | Meaning |
|---|---|
| `id` | Saved on the device (`localStorage` key `olympia.world`) and accepted as `?world=<id>` |
| `name`, `blurb` | Shown on the card |
| `group` | `island` or `world` |
| `engine` | `olympus` or `village` (built-in islands, `THEMES` in `js/buildings.js`) or `kit` (a world pack, `js/kitworld.js`) |
| `pack` | `true` when `<id>/world.json` exists (every look and world) |
| `preview` | Card image, 640x400 |

Choice order: `?world=` (or the older `?theme=`) in the URL, then this device's choice, then `"theme"` in `olympia.config.json`, then the first world.

## A pack: `<id>/world.json`

Any pack can set:

- `skin`: a stylesheet for the page (CSS variables `--cream --panel --ink --muted --red --soft --soft2 --serif --sans --mono`, plus anything else)
- `tagline`: replaces the line under the title
- `sky`: `hour` (always show this time of day), `clouds: false`, `cloud`, `nightCloud`
- `bloom`: glow multiplier
- `camera`: `pos`, `target`, `fov` for the home view
- `finish`: `mode` (`vase`, `chart` or `holo` redraw the whole picture), `paper`, `ink`, `strength`, `warmth`, `saturation`, `tilt`, `blur`

A look is a pack with `"look": true` and nothing else. A world (`engine: "kit"`) also sets:

- `names`: `[name, lede]` for `summit forge library beacon archive aviary agora hotel`
- `buildings`: a model for each of those plus `projects` (a list; each project gets one by its id).
  A model is `"kit/name"` or `{ "parts": [["kit/name", x, z, rotDeg, scale, y], ...] }` in the kit's own units; the app sizes it to fit
- `ground`: `island` (`IslandTop`, `Mountain`: `[dark, light]` ramps; `IslandSides`: a tint), `path`, `cap`, `stone`, `water`, `islets`, `islet`
- `scatter` (over the island) and `slope` (up the mountain): `{ models, count, size: [minH, maxH], pad }`
- `residents`: character models standing in for the felt animals (animated with their own idle, walk and wave clips)

## Models

Worlds share one folder of models, `_kits/<kit>/<model>.glb`, copied from free CC0 Kenney kits
(kenney.nl; licences in each kit folder) by `node tools/build-worlds.mjs`, which copies only what the packs name.
Run it after editing a pack. Each world is otherwise self-contained in its own folder, so worlds could later ship as optional downloads.
