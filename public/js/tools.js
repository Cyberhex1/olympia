// Which workshop a tool sends the messenger to, and how it's described.
// Shared by the page and the tests, so it has no three.js dependency.

// Matched against the tool's own name first (for MCP tools, the part after the server),
// in this order; the first rule that matches wins.
export const TOOL_MAP = [
  [/(^ask|askuserquestion|clarify)/i, 'aviary', 'Asking you a question', '❓'],
  [/(^send|sendmessage|senduserfile|^reply$|post_message|post_widget|notify|delegate|^agent$|start_thread|message_thread|start_session|^react$)/i, 'aviary', 'Sending a message', '🕊️'],
  [/(memory|skill|todo|toolsearch|recall|session_search|fetch_thread|fetch_messages|fetch_project|timeline|^list_|read_project|get_session|search_session|update_status|update_progress_checklist|mark_chapter|^task)/i, 'archive', 'Looking things up', '🏺'],
  [/(^(terminal|process|execute_code|shell|bash|powershell|run|code_exec|monitor)|start_process|interact_with_process|kill_process|run_in_terminal|preview_(start|stop|logs|list))/i, 'forge', 'Running a command', '⚒️'],
  [/(web|browser|chrome|navigate|^fetch$|http|url|tabs_|read_page|get_page_text|^find$|form_input|javascript)/i, 'beacon', 'Searching the web', '🔭'],
  [/(image|vision|tts|speech|audio|video|comfy|blender|artifact|3d|canva|design|render|screenshot|^look$)/i, 'studio', 'Making something visual', '🎨'],
  [/(read|write|edit|patch|grep|glob|notebook|file|sheet|spreadsheet|values|doc)/i, 'library', 'Working through files', '📜'],
];

// If the tool's name says nothing, the MCP server it belongs to decides.
const SERVER_MAP = [
  [/(browser|chrome)/i, 'beacon', 'Browsing the web', '🔭'],
  [/(hearthbot|slack|gmail|mail|telegram|discord)/i, 'aviary', 'Sending a message', '🕊️'],
  [/(blender|3d-assets|canva|figma|comfy)/i, 'studio', 'Making something visual', '🎨'],
  [/computer-use/i, 'forge', 'Using the computer', '🖱️'],
  [/(drive|docs|sheets|notion|pdf)/i, 'library', 'Working through files', '📜'],
];

// "mcp__claude-in-chrome__navigate" -> "navigate (claude-in-chrome)"
export function toolLabel(tool = '') {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool || '');
  return m ? `${m[2]} (${m[1].replace(/^[0-9a-f-]{20,}$/, 'connector')})` : tool;
}

export function toolInfo(tool = '', studioKey = null) {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool || '');
  const name = m ? m[2] : tool || '';
  const pick = ([, key, verb, badge]) => (key === 'studio' ? { key: studioKey || 'aviary', verb, badge } : { key, verb, badge });
  // browser servers own all their tools (click, find, screenshot...) except dev-server previews
  if (m && /(browser|chrome)/i.test(m[1]) && !/^preview_/i.test(name)) return pick(SERVER_MAP[0]);
  for (const rule of TOOL_MAP) if (rule[0].test(name)) return pick(rule);
  if (m) for (const rule of SERVER_MAP) if (rule[0].test(m[1])) return pick(rule);
  return { key: 'forge', verb: tool ? `Using ${toolLabel(tool)}` : 'Working', badge: '⚙️' };
}
