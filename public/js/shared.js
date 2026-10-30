// Layout facts shared by the page (three.js) and the server (Node), so both agree on them.

// Building spots for projects, in degrees around the mountain (90 = towards the camera) and distance
// from the centre. The server hands these out (lib/slots.js) so a project keeps its spot across reloads.
export const PROJECT_SLOTS = [
  { theta: 140, r: 24 }, { theta: 190, r: 24.5 }, { theta: 240, r: 24 }, { theta: 290, r: 24.5 }, { theta: 340, r: 24 },
  { theta: 165, r: 28 }, { theta: 215, r: 28.5 }, { theta: 265, r: 28 }, { theta: 315, r: 28.5 }, { theta: 10, r: 26 },
  { theta: 30, r: 27.5 }, { theta: 125, r: 27.5 }, { theta: 355, r: 27 },
];

// Where a session's character lives: its project's building (the island's own threads too: nobody lives on
// the Acropolis, which only receives finished work), the Hotel for tourists (work outside C:\code), otherwise
// the Agora (a project with no room for a building yet). `realm` is kept for older callers.
export function homeFor(project, hasBuilding, realm = 'Olympia', tourist = false) {
  if (tourist) return 'hotel';
  if (!project) return 'agora';
  return hasBuilding(`p:${project}`) ? `p:${project}` : 'agora';
}
