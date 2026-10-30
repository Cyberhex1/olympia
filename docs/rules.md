# Olympia's rules

How Olympia turns what happens on this PC into what you see on the island. This is the whole app's behaviour; the code follows it, and when one changes the other should too. Last reviewed 2026-10-26.

## Where the information comes from

| Source | What Olympia reads | How often |
|---|---|---|
| Claude Code transcripts (`~/.claude/projects`) | For each session: its folder, its last prompt / reply / tool call and when, its checklist title and how many items are done, how many steps its current turn has taken, whether it marked its project thread resolved, its helper agents. Never message text. Sessions untouched for 7 days are ignored. | every 3 s |
| Claude Code's live status files (`~/.claude/sessions`) | For each running session: busy, idle or waiting, and what it waits for. Files left by closed processes are ignored. | every 3 s |
| Your projects (`C:\code\*`) | Git: last commit, branch, uncommitted files. File changes as they happen. What the project is (name, package.json, README, CLAUDE.md), to pick its station. | every 20 s, and live (station: hourly) |
| Docker, CPU, memory | Containers, load. | 20 s / 2 s |
| Usage | Tokens from transcripts; plan percent only if the status line script shares it (older than 30 min is not shown). | every 20 s |

The page gets a full snapshot every 3 seconds plus events (a thread started, switched tool, needs you, finished; a commit; work started in a project) as they happen.

## Who lives where

- Every Claude Code session on this PC (Code tab, terminal, project threads over Remote Control) is a **character**.
- A project thread is **one** character, however many sessions it ran in (it went offline and came back, or was restarted). Only its newest session counts; older ones are history, along with any prompt they were still showing.
- A session started in `C:\code\<name>` lives at the **<name> building**, on the ground. Olympia's own threads too: they have an Olympia building like any other project.
- **Nobody lives on the Acropolis.** It's the messenger's home and where finished work goes: on the classic map a thread carries its finished piece up the mountain path (see **Project stations**); on other maps, when a thread finishes a turn, a glowing scroll flies up from it to the Acropolis, which lights up as it lands. The daily recap is kept there.
- A session started anywhere else is a **tourist** at the **Hotel**.
- A project with no free building spot (13 spots) sends its characters to the **Agora**; its building card says "no room yet".
- Helper agents a thread starts are small **roosters** that trail it.
- Olympia follows at most 24 threads (plus their helpers). Threads that need you or are working always make the cut, then the most recently active. At most 20 characters are drawn: needs-you first, then working, then most recent.
- A thread's name is, in order: a name you gave it, the title of its newest status checklist ("Olympia: whole-app logic"), or the first thing you asked it.

## What state a thread is in

| State | When | Ends when |
|---|---|---|
| **Working** | The process says it is busy, or the transcript shows a turn in progress: a tool call less than 10 min old, or a prompt or tool result less than 3 min old. A live "busy" counts even when a long tool hasn't written anything. | The turn ends, the live status says idle, or the process is gone for a minute. |
| **Needs you** | Claude Code says the session is waiting on you (permission prompt, question), or it asked a question or a plan approval that is still open while its process runs (or for an hour after). | You answer, its process exits, or the prompt is gone: the session moved on after the prompt appeared (a new reply, or a new prompt from you; one tool of the same reply finishing doesn't count, since another may still be waiting for your permission), the thread moved on to a newer session, or 12 hours passed (`"needsYouHours"`). A gone prompt just disappears; the thread shows as finished. |
| **Stuck?** | The process is busy and one tool call has had no result for 20 min. Never for tools meant to run long (helper agents, Monitor, waits), and never while one of its helpers did something in the last 10 min. | The tool returns, or 12 hours pass. |
| **Finished** (idle) | The turn ended, or was stopped or closed mid-turn. | It starts working again, or 24 h pass. |
| **Resting** / **Inside** | No activity for 24 h. (Classic map: see **Project stations**: resolved threads go inside at once, others stay out in town for 3 days.) Each building's latest 3 threads stay outside **resting**: they stroll slowly near the door with long pauses and say when they last worked, so the island never looks deserted after a quiet day or two. Older ones go indoors and aren't drawn. | It starts working again. |

## When "needs you" alerts

- The red "!" over the head, the "N threads need you" strip, the face's "N waiting on you", the tab title count and the phone's "Needs you" section all show the same threads. **Stuck?** is amber, listed after them and not counted.
- The strip and the phone list oldest first. Press N to fly to each in turn.
- A browser notification (once you turn on the bell) fires once, when a thread **enters** Needs you. Not for Stuck?, not when only the reason changes, not when Olympia restarts.

## How characters move

- **Home spot:** each character has its own spot in front of its building (the lowest one free when it arrived), so housemates don't stand on each other. It keeps that spot while it's out.
- On the classic map, a working thread with a station works at its bench instead (see **Project stations** below). Elsewhere, and for threads with no station:
- **Working** threads walk to the workshop for their current tool: Forge (commands), Library (files), Archive (looking things up, checklists), Beacon (web), Aviary (messages and questions), Studio (images, Blender, designs). Thinking without a tool: they bounce at home.
- A working thread always finishes its trip, then stays at least 8 seconds before heading to the next workshop, so quick tool switches don't make it turn back halfway or ping-pong. A trip that somehow never arrives is given up after 30 seconds. Setting off from home is never held back.
- Threads at the same workshop line up side by side along its front.
- Errands take at most 8 seconds (7 when heading home because it needs you): a character crossing the island hurries instead of taking half a minute. Paths curve around the mountain, and a trip around the island from or to somewhere past the ring road follows the road (out to it, along it, back in), so nobody wades through the pond or walks through a building.
- **Needs you:** walks back to its own home spot, then hops and waves under the "!".
- **Finished:** potters within a few steps of home on open ground (not inside buildings, the pond or the mountain's flanks), never picking a spot someone else stands on or is heading to, and pauses 4 to 12 seconds between strolls.
- **Resting** threads (each building's latest 3 after a quiet day) and resting tourists (not yet checked out) potter slowly around home with long pauses (15 to 40 seconds).
- **Helpers** appear beside their thread, follow a step behind it, and fade away where they stand 90 seconds after they finish.
- **Arriving and leaving:** a thread that turns up while the island is open steps out of its building's door and grows to full size. One that goes inside (a day without work, and no longer among its building's latest 3) or checks out walks to its door and disappears through it. Characters already out when you open the island are simply there.

## Project stations (classic map)

On the classic Olympus island (and its looks), every project has a **station**: a workbench beside its building where its threads do that project's job. Other maps and worlds keep the older rules above for now (a plan for each is to come). `?nostations` turns stations off.

**Which job.** Olympia picks the job from what the project actually is (its name, package.json, README, CLAUDE.md, the kinds of files in it, the folder's path), so a new project gets a fitting one by itself. `"station"` under the project in olympia.config.json overrides it.

| Job | Station | Its threads make | The 4 stages | Picked for |
|---|---|---|---|---|
| smithy | Smithy | a sword | Heating the bar, Hammering the blade, Quenching, Polishing the hilt | Olympia, engines, CLIs, toolkits |
| library | Reading tables | a discovery (a glowing scroll) | Pulling books, Reading, Taking notes, Onto something | research, search, markets, lists |
| bakery | Bakery | a loaf of bread | Mixing the dough, Kneading, Proofing, Baking | food, recipes, cooking |
| lyre | Lyre maker's bench | a lyre | Carving the frame, Stringing, Tuning, Playing it through | speech, voice, audio, music |
| observatory | Telescope | a star chart | Aiming the telescope, Watching, Charting, Marking a find | system monitors, dashboards, stats |
| scribe | Scribe's desk | a sealed letter | Drafting, Inking, Sealing, Rolling it up | resumes, letters, email, writing |
| potter | Potter's wheel | an amphora | Throwing the clay, Shaping, Glazing, Firing | catalogs, marketplaces, websites, deploys |
| easel | Painter's easel | a painting | Sketching, Blocking in colour, Adding detail, Varnishing | design, frontends, images |
| lamps | Lamp maker's bench | a lit lamp | Shaping the clay, Filling the oil, Trimming the wick, Lighting it | launchers, ports, dev servers |
| masks | Mask maker's bench | a theatre mask | Carving, Painting, Tying the ribbons, Trying it on | games, mods, stories |
| sculptor | Sculptor's block | a statue | Roughing out, Carving, Detailing, Polishing | Blender and 3D work |
| carpenter | Carpenter's bench | a wooden chest | Measuring, Sawing, Joining, Sanding | anything that fits nothing else (tests) |
| postcards | Terrace desk | a postcard | Sketching the view, Writing, Stamping, Addressing it | a tourist whose work says nothing about itself |

**Where.** Beside the building's door, on open ground; further back for buildings near the edge. Tourists' projects get theirs by the Hotel (up to 4, one per project that has a guest out). Strollers keep off stations.

**Working.** A working thread walks to its station and works at its own place on the bench (3 places; more stand at the ends), with its piece in front of it and the job's motion (hammering, reading, kneading...). It stays there for the whole turn, whatever tool it is using; the messenger still flies to the workshops for the tools.

**The 4 stages** come from the thread's newest checklist (its status checklist or todo list): done items out of all, split into 4 (0-1 of 8 done = stage 1, 2-3 = 2, 4-5 = 3, 6-7 = 4). A checklist that was already all done before the latest prompt belongs to an earlier piece and doesn't count. Without one, the steps the current turn has taken: under 4 = stage 1, under 12 = 2, under 30 = 3, then 4. When a piece moves on to its next stage the thread says so ("Quenching (3/4)").

**Finishing a turn.**
- The piece is **finished** when the thread is resolved, its checklist is all done, or (no checklist) its turn ended. It carries the piece over its head to the foot of the mountain, up the spiral ledge path to the Acropolis, delivers it (the Acropolis lights up, sparkles), walks back down and goes home. The chronicle says what it finished and when it was delivered.
- Otherwise the piece stays **on the bench** at its stage, and the thread goes about town. The bench shows its working threads' pieces first, then half-made ones.
- Called back to work on the way, it drops the delivery and goes to its bench.

**Resolved.** A project thread is resolved when it marked its thread resolved and nothing has come in since (a new message reopens it). Any other session is resolved when its checklist is all done and its turn has ended. A resolved thread delivers, walks home and goes inside, and only comes out when it is called again. Olympia can't see a thread you resolved yourself in the app.

**In town.** A thread that isn't resolved stays out for 3 days after its last work (each building's latest 3 longer), and spends its time going from place to place and doing what each place is for: fishing at the pond, reading the Agora's notice board, looking round a workshop, watching another project's station (busy ones more often), chatting on the Hotel's terrace, taking in the view from the edge, or pottering at home. It never does the same kind of thing twice running or goes where someone already is. Threads quiet for a day or more move slower, stay longer and prefer the pond, the view and home. Nothing is said while doing these: hovering shows where it is ("fishing at the pond", "Smithy: Quenching (3/4)").

## The messenger

- Lives at the Acropolis and mirrors the busiest Claude thread: it flies to the workshop for that thread's current tool, and stays with that thread while it is still working.
- When nothing is working it flies home "delivering the reply" for 6 seconds, then rests.
- Its bubble names the step and whose it is ("Library · for Fix the login bug: Working through files: header.js").

## What characters say

Everything a character says comes from a real session; nothing is made up.

- A thread starting, switching tool, needing you or finishing gets a bubble and a line in the chronicle (needs-you only once, not for a changed reason).
- Helpers say their steps in bubbles but stay out of the chronicle, and when one finishes it says it's handing back to its thread, not that it's waiting for you.
- Every 4.5 seconds one working thread says its current step.
- Every 20 seconds one finished or resting thread says when it finished ("Finished 5 min ago. Waiting for you.", or "Last worked 4 h ago" after 3 hours).
- Name tags show for threads that are working or need you, and for whoever the pointer is over.

## Buildings

- A project building is **busy** (lit, chimney smoke) while one of its threads or helpers is working, or a file in it changed in the last 5 minutes. It goes to sleep after 30 days with no commit or change.
- "Work started in X" is said when files change after 90 quiet seconds. A new commit sets off fireworks and "X shipped".
- Workshops light up while the messenger works there.
- The Forge shakes and smokes when the CPU is at 90% or more for two readings in a row, and calms down under 70%.
- Each project keeps its building spot across restarts (remembered in olympia.slots.json); a spot is freed when its project disappears.
- Docker containers are stalls around the Agora (up to 8), lit while running.

## When tourists leave

- Tourists follow the same states, but at the Hotel.
- They check out **48 hours** after their last activity (the Hotel card counts down). A tourist that is working or needs you never checks out.

## What the face and lists count

- Face title: "N working now · M waiting on you · K may be stuck" (threads, never helpers), or "all quiet".
- "N projects being worked on": buildings with a working thread right now.
- "M threads open": threads with activity in the last 24 hours (Olympia can't see whether you closed a thread).
- The phone list: Needs you, Working now, Today (the recap), and threads that finished in the last 24 hours.

## Daily recap and usage

- The recap (Acropolis, D key) lists each day per place: threads, what their checklists marked done, files changed, commits. A thread that ran in several sessions is listed once, under its newest name, with everything each session finished.
- The usage meter shows your plan's 5-hour and weekly percent when Claude Code shares it, otherwise tokens used on this PC (input + output + cache writes) in the last 5 hours and today.

## Demo mode

- Only when there are no Claude sessions at all in the last 7 days (or `?demo`): made-up residents and a messenger running pretend tasks, clearly labelled DEMO.
