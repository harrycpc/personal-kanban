# Journal — Daily Achievement Log — Design

## Overview

A fourth board view (`#/journal`) that records what was achieved each day, as a
dense spreadsheet-style table. Rows are calendar days; most columns are derived
automatically from board activity so there is no double data entry, and the one
typed field is a short free-text note.

The purpose is evidence. The board shows *what is planned*; the timeline shows
*when it is due*; the journal shows *what actually happened, and when* — the
thing that can be shown to a future employer, or read back before an interview.

## Goals

- One row per calendar day, newest first, per board.
- Derived columns (tickets completed, story points, epics touched) come from the
  board itself — completing a ticket is the only action needed to populate them.
- One typed field per day: a short "what I did" note, edited inline.
- Gaps are visible: days with no activity render as empty rows, so consistency
  (or its absence) is legible at a glance.
- Exportable to CSV, so the record can leave the app and go into a spreadsheet.
- Every claim is one click from its evidence: ticket keys in a row open the
  issue detail modal.

## Non-goals

- No charts, streak graphics, or dashboard widgets. A single summary line only.
- No time-spent / hours tracking. It relies on a daily habit that will lapse and
  makes the resulting totals untrustworthy.
- No public sharing, hosting, or LinkedIn/GitHub integration. The log is private;
  CSV export is the escape hatch.
- No retroactive backfill of history that was never recorded (see Limitations).
- No subtask-level entries (see Limitations).

## Data model

### Derived: issue completion dates

A new field on the issue document:

```
users/{uid}/boards/{boardId}/issues/{id}   { ..., completedAt: <epoch ms> | null }
```

`completedAt` is written whenever an issue moves *into* the done column (the last
column, matching the existing `isDoneStatus` rule), and cleared to `null` when it
moves *out*. Both write paths already compute the status change:

- `js/board.js` — `handleDrop`, the drag-and-drop handler.
- `js/detail.js` — the status `<select>` in the detail modal.

Re-completing an issue overwrites `completedAt` with the newer timestamp, so an
issue contributes to at most one day. This is deliberate: the log should say
"CI-2 was completed on 3 Aug", not accumulate a row every time it bounced
between columns.

**Fallback for pre-existing data.** Issues completed before this field existed
have no `completedAt`, but every status move already appended a timestamped
`{ts, text: "Moved to Done"}` entry to `issue.activity`. When an issue is
currently in the done column and has no `completedAt`, the journal falls back to
the timestamp of the last activity entry whose text is
`` `Moved to ${doneColumnName}` ``. This is string-matched and therefore breaks
if the done column is renamed — which is why it is the fallback and not the
primary mechanism.

### Typed: daily notes

A new subcollection, one document per day:

```
users/{uid}/boards/{boardId}/journal/{YYYY-MM-DD}   { note: string, updatedAt }
```

The date *is* the document id. This makes a note write idempotent (`setDoc` with
merge, no read-modify-write, no id generation) and makes the collection sort
correctly by id.

Alternatives rejected:

- *A `journal` map field on the board document* — every keystroke-save would
  rewrite the whole board doc and retrigger `subscribeBoard`, causing a full app
  rerender on each note edit. It would also grow the board doc unboundedly.
- *A general event-log collection, one doc per board action* — the most faithful
  record, and it would support subtask-level and field-level history. But it adds
  a Firestore write to every drag on a single-user board, and nothing in the
  goals needs that granularity. Deferred under YAGNI.

## Pure logic (`js/logic.js`)

New exported functions, all pure and unit-tested — no DOM, no Firestore:

- `completionDate(issue, doneColumnName)` → `YYYY-MM-DD | null`. Applies the
  `completedAt`-then-activity-fallback rule above. Returns null unless the issue
  is currently done.
- `journalDays(issues, notes, doneColumnName, today)` → array of day objects,
  newest first: `{ date, issues[], points, epicIds[], note }`. Spans from the
  earliest dated thing (a completion or a note) through `today`, with empty days
  included. Returns `[]` when there is nothing at all.
- `journalStats(days)` → `{ activeDays, streak, tickets, points, since }`. An
  *active day* is one with at least one completion or a non-empty note. `streak`
  counts consecutive active days ending today or yesterday (so an evening's work
  not yet done doesn't read as a broken streak).
- `toCSV(rows)` → RFC-4180-ish string; quotes fields containing `,`, `"`, or a
  newline, and doubles embedded quotes.

## View (`js/journal.js`, `css/journal.css`)

Header: board name + "journal", a **Show empty days** checkbox (default on,
persisted to `localStorage` under `pk-journal-empty` following the existing
`pk-groupby` / `pk-timeline-zoom` pattern), and an **Export CSV** button.

Summary line, one row of text, not a dashboard:

```
Active days 12 · Streak 3 · Tickets 8 · Points 21 · Since 17 Jul 2026
```

Table columns: **Date** (weekday + `3 Aug`), **Done** (issue-key chips, each
opening `openDetailModal`), **Pts**, **Epics** (colored dot + name, reusing the
existing `.epic-dot` style), **What I did** (the note).

The note cell is a click-to-edit field: renders as text (or a dimmed `—` when
empty), becomes an `<input>` on click, and saves on blur or Enter, Escape
cancels. Empty days get a `.journal-row.empty` class that dims the row.

CSV export builds a Blob client-side and triggers an `<a download>` — no server,
consistent with the app having no build step and no backend beyond Firestore.

## State & wiring

- `js/state.js` — `journal: {}` (a `dateISO → note` map) and
  `journalShowEmpty` from localStorage.
- `js/store.js` — `subscribeJournal(cb)` and `setJournalNote(dateISO, note)`.
- `js/main.js` — `#/journal` added to `applyRoute`, `renderJournal` to
  `renderView`, and `subscribeJournal` pushed into `boardUnsubs` in
  `switchBoard` so it tears down and re-subscribes on board switch like the
  issue and epic subscriptions.
- `index.html` — stylesheet link and a `📓 Journal` nav item.

## Testing

`tests/logic.test.mjs` gains cases for each new pure function: `completionDate`
across the primary/fallback/not-done/renamed-column paths; `journalDays` for
day bucketing, empty-day filling, epic and point aggregation, and the
nothing-recorded case; `journalStats` for streak boundaries (today, yesterday,
broken); `toCSV` for comma, quote, and newline escaping.

The view itself is not unit-tested — consistent with the rest of the app, whose
DOM-building modules are verified by hand in the browser.

## Limitations (stated deliberately)

1. **The past is nearly empty.** The Career Investment board currently holds four
   activity events in total, one of which is a completion. This log begins
   accruing from now; it does not reconstruct history that was never recorded.
   With the roadmap running to March 2027, that still yields ~8 months of record
   by the time applications go out.
2. **Subtasks cannot appear.** Subtasks are stored as `{id, text, done}` with no
   timestamp, and toggling one writes no activity entry, so there is no date to
   file them under. Adding a `doneAt` to the subtask shape would fix this later.
3. **Notes are per-board.** A day worked across two boards has a separate note on
   each. This matches how every other view in the app is scoped.
