# Command-centre conventions

Rules Claude follows whenever it creates or edits epics, tickets, or
subtasks on this board on Harry's behalf (via chat request → admin script).
Goal: everything Claude creates looks and feels consistent, regardless of
which session or day it was created in. Harry can override any of these
per-request ("make this a bug", "skip points") — these are defaults, not
hard limits.

## Read-before-write (always)

Before creating or changing anything, fetch current state first: existing
epics, existing issues (titles + keys), and the board's columns. Never
duplicate an epic that already exists in spirit (fuzzy-match on name).
Never blind-overwrite an issue Harry may have edited through the UI since
the last sync — if a field looks like it diverged from what Claude would
have set, ask rather than clobber.

## Epics = goals

One epic per distinct goal or initiative, not per timeframe. Timeframe is
a **label**, not an epic (see Labels below) — this lets the existing
filter bar slice by horizon without multiplying epics.

- **Name**: 2–5 words, outcome-shaped, Title Case. ("Ship Personal Kanban v1",
  not "Kanban project" or "Working on kanban app".)
- **Color**: assign the next unused color from `EPIC_COLORS` (in
  `js/logic.js`) in order; reuse only once all 8 are taken.
- Daily/one-off tasks with no larger goal behind them get **no epic**
  (`epicId: null`) rather than a junk-drawer "Misc" epic.

## Tickets (issues)

- **Type**:
  - `story` — a goal-level outcome inside an epic (the "what success
    looks like" ticket for that epic, usually one per epic).
  - `task` — default for everything else: concrete, actionable work.
  - `bug` — something broken, blocking, or a mistake to correct — rare in
    a personal backlog, used sparingly.
- **Title**: imperative, verb-first, sentence case, no trailing period.
  ("Draft Q3 budget", not "Q3 budget" or "Drafting the Q3 budget.")
- **Description**: optional. Skip it for anything self-explanatory from
  the title. When included: 1–3 plain sentences — context or a "done
  means" line, not a restatement of the title.
- **Priority** (`PRIORITIES` in `js/logic.js`):
  - `highest` — hard deadline this week / actively blocking something else.
  - `high` — important, wanted this week.
  - `medium` — default for normal work.
  - `low` — nice to have, no pressure.
  - `lowest` — someday/maybe.
- **Story points = complexity/effort**, not just size-in-days. Fibonacci
  scale, Claude's own honest estimate:
  - `1` — under 30 minutes.
  - `2` — under 2 hours.
  - `3` — about half a day.
  - `5` — a full day.
  - `8` — multi-day. **If a ticket would be 8, prefer breaking it into
    subtasks (or, if the pieces are independently trackable, separate
    tickets under the same epic) rather than leaving one giant 8.**
- **Labels**: lowercase, hyphenated, drawn from a small fixed set so the
  label filter stays useful instead of sprawling:
  - Timeframe (pick exactly one per ticket): `short-term`, `medium-term`,
    `long-term`, `daily`.
  - Optional extras as needed: `blocked`, `waiting-on-someone`,
    `quick-win`.
  - Don't invent new one-off labels for a single ticket.
- **Due date**: set only when there's a real deadline. Daily tasks get
  today's date; goal-driven tickets only get a date if Harry gave one or
  the epic implies one — don't invent fake urgency.
- **Status**: new tickets from chat land in **Backlog** by default unless
  Harry says he's starting it now (then the board's first column).

## Subtasks

Use subtasks for the literal steps of a ticket, not as a second tier of
tickets. Rule of thumb: if a step is independently prioritizable or could
slip to a different day on its own, it's a sibling ticket, not a subtask.

- 3–7 subtasks per ticket is the sweet spot. Fewer than 3 usually means
  the checklist isn't adding value over the description; more than ~7
  usually means the ticket should split.
- Each subtask: short imperative phrase, no punctuation at the end
  ("Book venue", not "Book the venue for the event.").

## What Claude will never do unprompted

- Won't delete or restructure existing epics/tickets/subtasks without
  being asked — additions are safe by default, destructive changes
  aren't.
- Won't rename an epic or change its color once created, since pills are
  visible everywhere on the board — ask first if a rename seems warranted.
- Won't invent due dates, priorities, or points detached from what Harry
  actually said, beyond the sane defaults above.
