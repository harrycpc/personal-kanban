# Personal Kanban — Design Spec (JIRA-mirror)

**Date:** 2026-07-15
**Status:** Approved pending user review
**Repo:** `personal-kanban` (new, public, GitHub Pages)
**Supersedes:** the initial single-user/4-column version of this spec (see git history).

## Purpose

A free kanban web app that mirrors the modern Jira Cloud kanban UI and most of its functionality. Anyone with a Google account who visits the URL gets their **own private board** — the owner shares a link, each user's data is isolated. Real-time sync across a user's devices. Hosted entirely on free tiers (GitHub Pages + Firebase Spark).

**Branding:** the app mirrors JIRA's look and interactions but does not present itself as JIRA (no Atlassian name or logo). App name: "Personal Kanban".

## Approach

Vanilla HTML/CSS/JS single-page app with **no build step**:

- **Firebase JS SDK** via CDN ES-module imports (`gstatic.com`): Firebase Auth (Google provider) + Cloud Firestore.
- **SortableJS** via CDN for drag-and-drop.
- Client-side hash routing (`#/board`, `#/backlog`); plain ES modules, no bundler.
- Deployed to **GitHub Pages** from the `main` branch root. Pushing files is the entire deploy.

Rejected alternatives: React + Vite (build/deploy overhead not justified); static-site frameworks (single interactive view, nothing to generate).

## File layout

```
personal-kanban/
├── index.html            # Shell: top nav, sidebar, view containers, modals
├── css/                  # base/chrome/board/backlog/modal styles
├── js/
│   ├── main.js           # boot, hash routing, view switching
│   ├── firebase.js       # SDK init (imports firebase-config.js)
│   ├── auth.js           # sign-in/out, first-run onboarding
│   ├── store.js          # Firestore reads/writes, transactions, batched reorders
│   ├── board.js          # board view, columns, swimlanes, drag-and-drop
│   ├── backlog.js        # backlog view, epic panel
│   ├── detail.js         # issue detail modal
│   ├── filters.js        # filter bar state + client-side filtering
│   ├── columns.js        # column management (add/rename/reorder/delete, WIP)
│   └── ui.js             # shared: toasts, SVG icons, chips, avatars
├── firebase-config.js    # Firebase web config object (public by design)
├── README.md             # One-time Firebase + GitHub Pages setup steps
└── docs/superpowers/specs/
```

## Data model (Firestore)

One project/board per user; all data under the signed-in user's uid. "Issues", not "cards" (JIRA vocabulary).

**`users/{uid}`** — profile + project settings (single doc):

| Field          | Type      | Notes                                                                 |
| -------------- | --------- | --------------------------------------------------------------------- |
| `displayName`, `photoURL` | string | From Google profile, cached for rendering.                 |
| `projectName`  | string    | Set at onboarding; editable later.                                     |
| `keyPrefix`    | string    | e.g. `HG`. Set at onboarding, **immutable afterwards**.                |
| `issueCounter` | number    | Last issued issue number. Starts at 0.                                 |
| `columns`      | array     | `[{id, name, wipLimit, order}]`. `id` is generated (not name-derived) so renames never break issue status. `wipLimit: null` = none. New users get To Do / In Progress / Done. |
| `createdAt`    | timestamp |                                                                        |

**`users/{uid}/epics/{epicId}`**: `name`, `color` (from a fixed JIRA-like epic palette), `createdAt`, `updatedAt`.

**`users/{uid}/issues/{issueId}`**:

| Field         | Type      | Notes                                                                  |
| ------------- | --------- | ----------------------------------------------------------------------- |
| `key`         | string    | e.g. `HG-12`. Assigned once at creation, immutable, never reused.        |
| `type`        | string    | `task` \| `story` \| `bug` (JIRA icons: blue check / green bookmark / red dot). |
| `title`       | string    | Required.                                                                |
| `description` | string    | Optional.                                                                |
| `epicId`      | string    | Optional; references an epic doc.                                        |
| `labels`      | string[]  | Multiple labels; entry field suggests existing labels (derived client-side). |
| `storyPoints` | number    | Optional.                                                                |
| `priority`    | string    | JIRA's five: `highest` \| `high` \| `medium` (default) \| `low` \| `lowest`, with matching arrow icons. |
| `dueDate`     | string    | Optional `YYYY-MM-DD`, local-date semantics.                             |
| `status`      | string    | `backlog` or a column `id`.                                              |
| `order`       | number    | Integer position within its status list (0-based).                       |
| `subtasks`    | array     | `[{id, text, done}]`.                                                    |
| `comments`    | array     | `[{id, text, createdAt}]`.                                               |
| `links`       | array     | `[{id, url, title}]` — URL attachments (free-tier substitute for file uploads). |
| `activity`    | array     | `[{ts, text}]` auto-log, capped at the most recent 100 entries.          |
| `createdAt`, `updatedAt` | timestamp | Server timestamps on the doc itself.                          |

**Embedded arrays** (subtasks/comments/links/activity) keep each issue to one doc: atomic updates, fewer reads, well under Firestore's 1 MiB doc limit at personal scale. **Constraint:** Firestore forbids `serverTimestamp()` inside array elements, so embedded entries use client `Date.now()` timestamps; doc-level `createdAt`/`updatedAt` remain server timestamps.

**Issue keys:** creation runs a Firestore transaction that increments `issueCounter` and writes the issue with `key = keyPrefix + "-" + n`. Keys are never renumbered or reused, including after deletes.

**Ordering:** on every drop, the client rewrites `order` as clean integers for all issues in the affected status list(s) in one batched write. Simple and robust at personal-board scale.

**Activity logging:** status moves, and changes to priority, points, epic, type, and due date append an entry.

## Security

Rules restrict everything to the owner. The Firebase web config in `firebase-config.js` is public by design; the rules are the security boundary.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

## Access model

Anyone with a Google account can sign in and gets their own empty board (their `users/{uid}` doc is created at onboarding). No admin work for the owner. Firestore free tier (50K reads / 20K writes per day) comfortably covers dozens of casual users; an email allowlist can be added later without redesign if ever needed.

## Auth & onboarding

1. Unauthenticated: centered sign-in screen, "Sign in with Google" (popup, redirect fallback if blocked).
2. **First sign-in:** JIRA-like "Name your project" dialog — project name (default "My Kanban") and a key prefix auto-suggested from the name (e.g. "Harry's Goals" → `HG`), editable in the dialog only. Confirming creates `users/{uid}` with default columns.
3. Authenticated: `onSnapshot` listeners on the user doc, epics, and issues drive all rendering — cross-device real-time sync.
4. Sign-out returns to the sign-in screen.

## UI — JIRA Cloud mirror

Light Atlassian-style theme: gray board background (`#F4F5F7` family), white cards with subtle shadow, Atlassian blue (`#0052CC`) actions, Atlassian-like sans-serif stack. All icons (types, priorities, etc.) are inline SVGs drawn to match JIRA's.

### App shell
- **Top nav:** app logo + name, global **Create** button (blue), user avatar with sign-out menu, offline indicator when disconnected.
- **Left sidebar (collapsible):** project icon + name, **Board** and **Backlog** nav items (hash routes).

### Board (`#/board`)
- **Board header:** title, filter bar — text search (matches title/description/labels/key), Type / Epic / Label dropdowns, an **Overdue** chip, clear-filters — and a **Group by: None / Epic** swimlane toggle (persisted per device in localStorage). Settings gear opens column management.
- **Columns:** user-defined; uppercase headers with live counts. **WIP limits:** header shows `count/limit` and highlights when exceeded, like JIRA's column constraints.
- **Column management:** add, rename, reorder, delete columns; set/clear WIP limits. Deleting a column containing issues prompts for a destination column (JIRA behavior).
- **Swimlanes:** when grouping by epic — one collapsible lane per epic plus "Everything else"; drag-and-drop works within lanes.
- **Cards, top to bottom:** epic pill (colored, if assigned) → title → label chips (neutral gray, JIRA-style) → due-date chip (red when overdue) + subtask progress (e.g. `2/5`) → bottom row: type icon + key + priority icon on the left, story-points badge + user avatar on the right.
- **Done semantics:** the rightmost column is treated as "done" — issue keys render struck-through there and overdue styling is suppressed (JIRA behavior).
- **Create:** per-column inline `+ Create` (title + type, defaults applied) and the global Create modal (all fields, status defaults to Backlog).
- **Drag and drop:** SortableJS within/across columns; drop persists `status` + `order`.

### Backlog (`#/backlog`)
Mirrors JIRA's kanban backlog:
- **Two ranked sections:** the Backlog list, and a section for the board's **first column** — drag between them to promote/demote issues onto/off the board. Reordering within each persists rank.
- **Epic panel (left, collapsible):** lists epics with colors; create/edit/delete epics (delete unassigns its issues); click an epic to filter both sections.
- Rows show type icon, key, title, epic pill, labels, points, priority — JIRA backlog row anatomy.

### Issue detail modal
JIRA's two-column dialog, opened by clicking any card/row:
- **Left:** title (inline edit), description (inline edit), **link attachments** (add/remove URLs with titles), **subtasks** checklist with add/toggle/delete and a progress bar (also reflected on the card), and **Comments / Activity** tabs (comments: add/delete with timestamps; activity: auto-logged trail, newest first).
- **Right sidebar:** status dropdown, priority, story points, labels editor, epic picker, due date, created/updated timestamps.
- **Delete** under a "⋯" menu with an explicit confirm step.

## Error handling & offline

- Sign-in failure → inline error under the button.
- Firestore offline persistence enabled; top-nav offline indicator; offline edits sync on reconnect.
- Write failures surface as a transient toast; `onSnapshot` keeps UI consistent with server state.
- Destructive actions (issue delete, epic delete, column delete) require explicit confirmation.

## Deployment & one-time setup (documented in README)

1. Create a free Firebase project (Spark plan): enable the **Google** sign-in provider, enable **Cloud Firestore**, paste the security rules above, add the GitHub Pages domain to Auth's authorized domains.
2. Copy the Firebase web config into `firebase-config.js`.
3. Create the public GitHub repo `personal-kanban`, push, enable GitHub Pages (deploy from `main` branch root).

## Implementation phasing (guidance for the plan)

Each phase ships a working app:

1. **Core:** auth + onboarding, app shell, default columns, issue CRUD (type/title/description/priority/due/labels/points), board rendering, drag-and-drop, real-time sync, deploy.
2. **Backlog & epics:** backlog page with promotion drag, epic panel/CRUD, epic pills, swimlanes.
3. **Detail depth:** comments, activity log, subtasks, link attachments.
4. **Board power features & fidelity pass:** filter bar, WIP limits, column management, done-column semantics, visual polish against real JIRA.

## Verification (manual, browser-driven)

1. Sign in with Google → onboarding names the project → empty board with default columns. Sign out/in — data persists.
2. **Second Google account** signs in → gets its own onboarding and empty board; neither account can see the other's data.
3. Create issues of each type from both the column `+ Create` and the global Create modal; keys increment with the chosen prefix and are never reused after deletes.
4. Drag issues within/across columns and refresh — positions persist; a second browser session signed in as the same account sees changes live both ways.
5. Backlog: reorder ranks, drag between Backlog and first-column sections; board reflects promotions.
6. Epics: create with color, assign to issues (pill shows), swimlane grouping on/off, epic filter, delete epic (issues unassigned, not deleted).
7. Detail modal: edit every field; add/toggle/delete subtasks (card progress updates); add/delete comments; activity trail records moves and field changes; add/remove link attachments.
8. Columns: add/rename/reorder; set a WIP limit and exceed it (highlight shows); delete a column with issues (destination prompt fires, issues move).
9. Overdue chip shows for past-due issues, suppressed in the rightmost column; key strikethrough in the rightmost column.
10. Filters: text search, type/epic/label dropdowns, overdue chip, clear-all — all combine correctly.
11. Kill the network — offline indicator shows; offline edits sync on reconnect.

## Out of scope (YAGNI)

Real file uploads (needs paid Firebase Storage — link attachments instead), shared/collaborative boards, multiple projects per user, sprints/scrum features, notifications, dark mode, keyboard shortcuts, mobile app. The data model (per-uid isolation) leaves room for an allowlist or sharing later without migration.
