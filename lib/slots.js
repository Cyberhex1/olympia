// Gives each project a building spot that stays put across reloads and restarts.
// Spots are remembered in olympia.slots.json; a spot is freed when its project disappears
// (for example a Claude-only folder nobody touched for a week).
import fs from 'node:fs';

export class SlotBook {
  constructor(file, count) {
    this.file = file; this.count = count;
    this.map = {};
    try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved && typeof saved === 'object') this.map = saved; } catch {}
  }

  // projects: [{ id, claudeOnly }]. Returns Map id -> slot index or null when the island is full.
  assign(projects) {
    const ids = new Set(projects.map((p) => p.id));
    let changed = false;
    for (const id of Object.keys(this.map)) {
      const n = this.map[id];
      if (!ids.has(id) || !Number.isInteger(n) || n < 0 || n >= this.count) { delete this.map[id]; changed = true; }
    }
    const used = new Set(Object.values(this.map));
    // newcomers in a stable order: code projects first, then other folders, each alphabetical
    const fresh = projects.filter((p) => !(p.id in this.map))
      .sort((a, b) => (a.claudeOnly ? 1 : 0) - (b.claudeOnly ? 1 : 0) || a.id.localeCompare(b.id));
    for (const p of fresh) {
      let n = 0; while (used.has(n) && n < this.count) n++;
      if (n >= this.count) continue; // full: this project gets no building
      this.map[p.id] = n; used.add(n); changed = true;
    }
    if (changed) { try { fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2)); } catch {} }
    return new Map(projects.map((p) => [p.id, p.id in this.map ? this.map[p.id] : null]));
  }
}
