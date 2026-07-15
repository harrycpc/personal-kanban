# Personal Kanban Board — Design Spec

**Date:** 2026-07-15
**Status:** Approved pending user review
**Repo:** `personal-kanban` (new, public, GitHub Pages)

## Purpose

A free, single-user kanban board for tracking personal goals and tasks, mimicking the JIRA kanban UI. Syncs across devices in real time. Owned and hosted by the user (GitHub Pages + Firebase free tier) with no paid services.

## Approach

Vanilla HTML/CSS/JS single-page app with **no build step**:

- **Firebase JS SDK** (via CDN `<script type="module">` imports from `gstatic.com`): Firebase Auth for Google sign-in, Cloud Firestore for storage and real-time sync.
- **SortableJS** (via CDN) for drag-and-drop of cards within and across columns.
- Deployed to **GitHub Pages** from the `main` branch root of a public repo. Pushing files is the entire deploy.

Rejected alternatives: React + Vite (build step and deploy workflow overhead not justified for a single-view personal tool); static-site frameworks (no multi-page content to generate).

## File layout

```
personal-kanban/
├── index.html          # Page shell: top bar, board, modals
├── style.css           # JIRA-style theme
├── app.js              # Auth, Firestore, rendering, drag-and-drop
├── firebase-config.js  # Firebase web config object (public by design)
├── README.md           # One-time Firebase + GitHub Pages setup steps
└── docs/superpowers/specs/  # This spec
```

## Data model (Firestore)

One board per user. All data lives under the signed-in user's uid.

**`users/{uid}`** (single doc per user):

| Field         | Type   | Notes                                        |
| ------------- | ------ | -------------------------------------------- |
| `cardCounter` | number | Last issued issue-key number. Starts at 0.   |

**`users/{uid}/cards/{cardId}`** (auto-ID docs):

| Field         | Type      | Notes                                                        |
| ------------- | --------- | ------------------------------------------------------------ |
| `key`         | string    | Issue key, e.g. `PK-12`. Assigned once at creation, immutable. |
| `title`       | string    | Required. Card summary.                                       |
| `description` | string    | Optional, empty string default.                               |
| `tag`         | string    | Optional free-text label (e.g. "Career", "Health").          |
| `dueDate`     | string    | Optional, `YYYY-MM-DD` or empty. Local-date semantics.        |
| `priority`    | string    | `high` \| `medium` \| `low`. Default `medium`.                |
| `column`      | string    | `backlog` \| `todo` \| `inprogress` \| `done`.                |
| `order`       | number    | Integer position within its column (0-based).                 |
| `createdAt`   | timestamp | `serverTimestamp()` at creation.                              |
| `updatedAt`   | timestamp | `serverTimestamp()` on every write.                           |

**Issue keys:** on card creation, a Firestore transaction increments `users/{uid}.cardCounter` and creates the card with `key = "PK-" + newValue`. Keys are never reused or renumbered, including after deletes — matching JIRA behavior.

**Ordering:** on every drop, the client rewrites `order` as clean integers (0, 1, 2, …) for all cards in the affected column(s) using a single batched write. Simple and robust at personal-board scale (tens of cards); no fractional-order edge cases.

**Tag colors:** derived deterministically from a hash of the tag text mapped onto a fixed palette of JIRA-label-like colors. No tag management UI.

## Security

Firestore rules restrict every read/write to the owner. The Firebase web config in `firebase-config.js` is public by design (standard for Firebase web apps); the rules are the security boundary.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /cards/{cardId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

## UI — JIRA kanban mimicry

Light Atlassian-style theme throughout:

- **Board background** light gray (`#F4F5F7`-family), **columns** as soft gray rounded panels, **cards** white with subtle shadow and rounded corners. Atlassian blue (`#0052CC`) for primary actions and focus states. System/Atlassian-like sans-serif font stack.
- **Top bar:** board name ("Personal Kanban"), a search input that live-filters cards client-side (matches against title, description, tag, and key), the user's Google avatar, and a sign-out control.
- **Columns (fixed):** `BACKLOG`, `TO DO`, `IN PROGRESS`, `DONE` — uppercase headers with live card counts (e.g. `TO DO 3`).
- **Cards, top to bottom:** title; tag pill (colored, if set); due-date chip (if set); bottom row with issue key + priority arrow icon on the left and the user's Google avatar on the right. Priority icons are inline SVGs styled like JIRA's (red up-arrow high, orange dash/medium, green down-arrow low).
- **Overdue flag:** cards with `dueDate` in the past (local time) and not in `done` render the due-date chip in red.
- **Create:** a JIRA-style `+ Create` affordance at the bottom of each column opens the card form (modal) pre-targeted to that column. Title required; description, tag, due date, priority optional (priority defaults to medium).
- **Edit/delete:** clicking a card opens the same modal populated for editing, with a Delete button that requires an inline confirm step.
- **Drag and drop:** SortableJS across and within all four columns; drop persists `column` + `order` per the ordering rule above.

## Auth flow

1. Unauthenticated: a centered sign-in screen with a "Sign in with Google" button (Firebase Auth popup; falls back to redirect if the popup is blocked).
2. Authenticated: board loads; a single `onSnapshot` listener on the user's `cards` collection renders and re-renders the board, giving cross-device real-time sync.
3. Sign-out returns to the sign-in screen.

## Error handling & offline

- Sign-in failure → inline error message under the button; no crash.
- Firestore offline persistence enabled; a small "offline" indicator appears in the top bar when disconnected. Edits made offline sync when reconnected.
- Delete requires an explicit confirm step.
- Firestore write failures surface as a transient toast; the `onSnapshot` listener keeps the UI consistent with the server state.

## Deployment & one-time setup (documented in README)

1. Create a free Firebase project (Spark plan): enable **Google** sign-in provider, enable **Cloud Firestore**, paste the security rules above, add the GitHub Pages domain to Auth's authorized domains.
2. Copy the Firebase web config into `firebase-config.js`.
3. Create the public GitHub repo `personal-kanban`, push, enable GitHub Pages (deploy from `main` branch root).

## Verification (manual, browser-driven)

Client-only app with no server code of ours; verified by driving the deployed (or locally served) app:

1. Sign in with Google; sign out; sign back in — data persists.
2. Add a card with all fields; add one with title only. Keys increment (`PK-1`, `PK-2`, …).
3. Edit a card; delete a card (confirm step fires); deleted card's key is not reused.
4. Drag a card through all four columns and reorder within a column; refresh — positions persist.
5. Open a second browser session signed in as the same account; changes propagate live both ways.
6. Set a past due date on a non-Done card — overdue styling shows; move it to Done — styling clears.
7. Search filters cards by title/tag/key; clearing search restores the board.
8. Kill the network briefly — offline indicator shows; an edit made offline syncs on reconnect.

## Out of scope (YAGNI)

Multiple boards, custom columns, sharing/collaborators, comments, attachments, subtasks, sprints/backlog grooming, notifications, dark mode, mobile app. The board is deliberately single-user, single-board.
