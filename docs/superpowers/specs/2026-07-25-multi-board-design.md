# Multi-Board Support — Design

## Overview

Personal Kanban currently supports exactly one implicit board per user. This adds true multi-board support — each board is a fully isolated Jira-style project (own columns, key prefix, issue counter, epics, issues) — and uses it to split the existing single board into two: the current board (unchanged) and a new "Career Investment" board, with all DevOps/career-learning content migrated into it.

## Goals

- A user can have multiple boards, each behaving exactly like today's single board (board view, backlog view, filters, epics, columns, drag-and-drop, issue detail — no functional regression).
- Boards are switchable from the sidebar; each is fully isolated data (no shared issue pool, no cross-board filtering).
- One-time migration: move the 6 career/technical epics (and their 33 issues) from the existing board into a new "Career Investment" board, re-keyed CI-1…CI-33.
- Admin CLI (`~/.personal-kanban-admin/`) stays usable for the read-before-write command-centre workflow, now board-aware.

## Non-goals

- No in-app "move issue to another board" action — this migration is a one-time admin-script operation.
- No board deletion UI.
- No cross-device sync of "which board was last active" (same limitation the existing `groupByEpic` preference already has).

## Data model

**Before:**
```
users/{uid}                    { displayName, photoURL, projectName, keyPrefix, issueCounter, columns[] }
users/{uid}/issues/{id}
users/{uid}/epics/{id}
```

**After:**
```
users/{uid}                          { displayName, photoURL }
users/{uid}/boards/{boardId}         { name, keyPrefix, issueCounter, columns[], order, createdAt }
users/{uid}/boards/{boardId}/issues/{id}
users/{uid}/boards/{boardId}/epics/{id}
```

`columns[]`, `keyPrefix`, `issueCounter` move from the user doc onto each board doc — every board has its own. The user doc keeps only account profile fields.

## App state & sync (`js/state.js`, `js/store.js`, `js/main.js`)

- `state.userDoc` is removed. Replaced by:
  - `state.boards` — lightweight list of all boards for the switcher (`{id, name, keyPrefix, order}`), always subscribed once signed in.
  - `state.activeBoardId` — currently selected board id.
  - `state.board` — full active board doc (`name, keyPrefix, issueCounter, columns`), subscribed per-board.
- `columnsSorted()` and `isDoneStatus()` in `state.js` read from `state.board.columns` instead of `state.userDoc.columns`.
- `store.js` gains a `setActiveBoard(boardId)` call (mirrors the existing `initStore(uid)` pattern) that repoints the board-scoped collection/doc refs used internally by `createIssue`, `updateIssue`, `batchUpdateIssues`, `createEpic`, `updateEpic`, `deleteEpic`. Call sites in `board.js`, `backlog.js`, `detail.js`, `columns.js` are unchanged — they don't need a boardId parameter threaded through.
- `store.js` gains: `subscribeBoards(cb)` (the boards list), `subscribeBoard(boardId, cb)` (active board doc), `createBoard(name, keyPrefix)`, `updateBoard(boardId, fields)` (replaces `updateProject`). `subscribeIssues`/`subscribeEpics` take a `boardId` param.
- `main.js` orchestrates board switching:
  1. On sign-in, subscribe to `state.boards` (always active, independent of which board is selected).
  2. Determine the active board: `localStorage.getItem('pk-active-board')` if it still exists in `state.boards`, else the first board by `order`. If `state.boards` is empty (new user), run the onboarding dialog to create the first board.
  3. `switchBoard(boardId)`: unsubscribe the current board-doc/issues/epics listeners (not the boards-list listener), resubscribe scoped to the new boardId, `store.setActiveBoard(boardId)`, persist to `localStorage`, reset `state.filters` and `state.collapsedLanes` (epic filters are board-scoped, so carrying them over would silently show zero results), keep `state.route` and `state.groupByEpic` as-is, rerender.

## UI (`index.html`, new `js/boards.js`, `css/chrome.css`)

- Sidebar gets a "Boards" section between the project header and the Board/Backlog nav links: one row per board (name + key prefix), click to switch, active board highlighted — same visual pattern as the epic panel on the Backlog page (`js/backlog.js` `epicPanel()`), plus a "+ Create board" row.
- The top sidebar header (icon/name) keeps showing the *active* board's name and key initial; clicking it still opens rename (name only — key prefix stays permanent), now calling `store.updateBoard(activeBoardId, {name})` instead of `store.updateProject`.
- "+ Create board" opens the same name+key-prefix modal fields as today's onboarding dialog (`js/auth.js` `onboardingDialog`), reused for both first-run onboarding and creating additional boards. New boards start with the default 3 columns (To Do / In Progress / Done), editable afterward via the existing Board Settings (⚙) column editor — no new column-setup UI needed.

## Admin CLI (`~/.personal-kanban-admin/cli.mjs`)

Add board-awareness so the read-before-write command-centre workflow keeps working per board:
- `list-boards` — list all boards (id/name/keyPrefix/order).
- `use-board <boardId>` — persist a selected board id locally (e.g. a small local config file) so subsequent `list`/`create-issue`/`create-epic`/`update-issue`/`update-epic` calls operate on that board without repeating the id every time.
- Existing commands (`list`, `create-epic`, `create-issue`, `update-issue`, `update-epic`) read/write under the currently-selected board's subcollections instead of the flat top-level ones.

## Migration (one-time script, admin-only, not app code)

New script under `~/.personal-kanban-admin/seeds/`, run once:

1. Read the current `users/{uid}` doc (`columns`, `keyPrefix: "HK"`, `issueCounter`, `projectName`, plus all existing `issues`/`epics`).
2. Create `users/{uid}/boards/{id1}` with `name: projectName` (unchanged, per "keep as-is"), the same `columns` (same column IDs — issue `status` values don't need remapping), same `keyPrefix: "HK"`, same `issueCounter`, `order: 0`.
3. Copy all existing issues and epics into `boards/{id1}/issues` and `boards/{id1}/epics` (same doc IDs, unchanged).
4. Create `users/{uid}/boards/{id2}` "Career Investment", fresh default columns (new column IDs via `newId()`), `keyPrefix: "CI"`, `issueCounter: 0` (incremented as issues below are created), `order: 1`.
5. Identify the 6 epics to move: *Build DevOps Portfolio Project*, *Pass RHCSA RHEL 10 Exam*, *AWS & Cloud Certifications*, *Sharpen Interview & System Design Skills*, *Network & Build DevOps Presence*, *Apply for DevOps Roles* — and their 33 issues.
6. Re-create those epics under `boards/{id2}/epics`. Re-create those issues under `boards/{id2}/issues` with fresh sequential keys `CI-1`…`CI-33`, remapping:
   - `status`: match old column by name (To Do/In Progress/Done) to the corresponding new column id on board 2.
   - `epicId`: point at the new epic doc id.
   - `blockedBy`: remap ids that point at another migrated issue to its new id; drop ids that point at an issue *not* in the migrated set (no cross-board blocking).
   - All other fields (title, description, priority, storyPoints, dueDate, labels, subtasks, comments, links, activity, order) copied as-is.
7. Delete the migrated epics/issues from `boards/{id1}` (this is a move, not a copy — no duplicates left behind).
8. Delete the now-unused top-level `columns`, `keyPrefix`, `issueCounter`, `projectName` fields from `users/{uid}` (and the old flat `users/{uid}/issues`, `users/{uid}/epics` subcollections, once step 3 is confirmed).

## Testing plan

- No new pure-logic surface of significant size — most of this is data-plumbing and UI wiring. Existing `tests/logic.test.mjs` suite must still pass unchanged (nothing in `js/logic.js` changes).
- Manual verification in the running app (per house convention — UI changes get exercised in a real browser before being called done):
  - Fresh sign-in with zero boards → onboarding creates the first board correctly.
  - Existing account after migration: board switcher shows both boards, switching correctly swaps columns/issues/epics, filters reset on switch, rename/create-board dialogs work, drag-and-drop and issue detail still work identically on both boards.
  - Admin CLI: `list-boards`, `use-board`, then `list`/`create-issue` against each board confirm correct scoping.
