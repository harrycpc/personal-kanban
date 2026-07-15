# Personal Kanban (JIRA-mirror) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, no-build-step web app mirroring the Jira Cloud kanban UI where anyone with a Google account gets their own private board, per the spec at `docs/superpowers/specs/2026-07-15-personal-kanban-design.md`.

**Architecture:** Vanilla ES-module SPA (hash routing `#/board` / `#/backlog`) served from GitHub Pages. Firebase Auth (Google) + Firestore (per-uid data, real-time `onSnapshot`, offline persistence). All rendering is plain DOM built through a tiny `el()` helper; SortableJS provides drag-and-drop. Pure logic lives in `js/logic.js` and is unit-tested with Node's built-in test runner; everything touching DOM/Firebase is verified manually in the browser per task.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Firebase JS SDK 10.12.2 (CDN, modular), SortableJS 1.15.2 (CDN), Node ≥18 (`node --test`, tests only — zero npm dependencies).

## Global Constraints

- **No build step, no npm.** All libraries via pinned CDN URLs: Firebase `https://www.gstatic.com/firebasejs/10.12.2/...`, SortableJS `https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js`.
- **Local dev server required** (ES modules break on `file://`): `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000`.
- App name is **"Personal Kanban"** — it must never present itself as JIRA/Atlassian (no Atlassian name or logo).
- Free tier only: Firebase **Spark** plan, GitHub Pages on the public repo `personal-kanban` (GitHub user `harrycpc`).
- Theme tokens (from spec): board gray `#F4F5F7`, action blue `#0052CC`, text `#172B4D`, card white with Atlassian shadow.
- **Firestore forbids `serverTimestamp()` inside array elements** — embedded entries (comments/activity/subtasks/links) use client `Date.now()`; doc-level `createdAt`/`updatedAt` use `serverTimestamp()`.
- `keyPrefix` is immutable after onboarding; issue keys are never renumbered or reused. Column `id`s are generated (never derived from names).
- Rightmost column (highest `order`) carries "done" semantics: struck-through keys, overdue styling suppressed.
- Destructive actions (issue delete, epic delete, column delete) always confirm first.
- Repo root: `~/Documents/personal-kanban` (git repo already initialized, branch `main`).

## File map (final state)

```
personal-kanban/
├── index.html            # Static shell: sign-in screen, chrome, view container, modal/toast roots
├── css/base.css          # Tokens, reset, buttons, inputs, chips, toast, dropdown, modal overlay
├── css/chrome.css        # Sign-in screen, top nav, sidebar, view frame
├── css/board.css         # Board header/columns/cards/swimlanes, filter bar
├── css/backlog.css       # Backlog sections/rows, epic panel
├── css/modal.css         # Create + detail modal, tabs, subtasks, comments, activity
├── js/logic.js           # Pure functions (unit-tested): ids, key prefix, dates, activity, labels, filters
├── js/state.js           # In-memory app state + rerender dispatcher + derived helpers
├── js/firebase.js        # SDK init (app, auth, db with offline persistence)
├── js/auth.js            # Sign-in screen, sign-out, onboarding dialog
├── js/store.js           # All Firestore reads/writes (transactions, batches, subscriptions)
├── js/ui.js              # el() DOM helper, SVG icons, toast, modal stack, confirm, select helper
├── js/main.js            # Boot, auth flow, routing, chrome wiring, subscriptions
├── js/board.js           # Board view: columns, cards, inline create, dnd, swimlanes
├── js/backlog.js         # Backlog view: two ranked sections, rows, epic panel
├── js/detail.js          # Create modal + issue detail modal (fields, subtasks, comments, links)
├── js/columns.js         # Column management modal (add/rename/reorder/delete, WIP limits)
├── js/filters.js         # Filter bar UI (search, type/epic/label, overdue, clear)
├── tests/logic.test.mjs  # node --test unit tests for js/logic.js
├── firebase-config.js    # Firebase web config (public by design; real values in Task 3)
├── README.md             # Setup: Firebase console, local dev, deploy
└── .gitignore
```

## Phases

- **Phase 1 (Tasks 1–10):** deployable core — auth, onboarding, shell, board, issue CRUD, drag-and-drop, live deploy.
- **Phase 2 (Tasks 11–13):** backlog page, epics, swimlanes.
- **Phase 3 (Tasks 14–16):** subtasks, comments + activity, link attachments.
- **Phase 4 (Tasks 17–19):** filter bar, column management, full verification pass.

---

### Task 1: Scaffold — static shell, all CSS, README

**Files:**
- Create: `index.html`, `css/base.css`, `css/chrome.css`, `css/board.css`, `css/backlog.css`, `css/modal.css`, `js/main.js` (stub), `firebase-config.js` (template), `README.md`, `.gitignore`

**Interfaces:**
- Produces: every DOM id later tasks rely on: `#signin`, `#btn-signin`, `#signin-error`, `#app`, `#topnav`, `#btn-sidebar-toggle`, `#btn-create`, `#offline-badge`, `#nav-avatar`, `#avatar-menu`, `#menu-email`, `#btn-signout`, `#sidebar`, `#project-icon`, `#project-name`, `.nav-item[data-route]`, `#view`, `#modal-root`, `#toast-root`. All CSS classes referenced by later tasks ship complete here.

- [ ] **Step 1: Check prerequisites**

Run: `node --version && python3 --version && git -C ~/Documents/personal-kanban status`
Expected: Node ≥ v18, any python3, clean git tree on `main`.

- [ ] **Step 2: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Personal Kanban</title>
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/chrome.css">
<link rel="stylesheet" href="css/board.css">
<link rel="stylesheet" href="css/backlog.css">
<link rel="stylesheet" href="css/modal.css">
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
</head>
<body>
  <div id="signin" hidden>
    <div class="signin-card">
      <h1>Personal Kanban</h1>
      <p>Track your goals on your own JIRA-style board.</p>
      <button id="btn-signin" class="btn btn-primary">Sign in with Google</button>
      <p id="signin-error" class="form-error" hidden></p>
    </div>
  </div>

  <div id="app" hidden>
    <header id="topnav">
      <button id="btn-sidebar-toggle" class="icon-btn" title="Toggle sidebar">☰</button>
      <div class="brand"><span class="brand-mark"></span>Personal Kanban</div>
      <button id="btn-create" class="btn btn-primary">Create</button>
      <div class="topnav-right">
        <span id="offline-badge" hidden>Offline</span>
        <div class="avatar-wrap">
          <img id="nav-avatar" class="avatar" alt="Your avatar" referrerpolicy="no-referrer">
          <div id="avatar-menu" class="dropdown" hidden>
            <div id="menu-email" class="dropdown-label"></div>
            <button id="btn-signout" class="dropdown-item">Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div id="app-body">
      <nav id="sidebar">
        <div class="project">
          <div class="project-icon" id="project-icon"></div>
          <div>
            <div class="project-name" id="project-name"></div>
            <div class="project-sub">Kanban project</div>
          </div>
        </div>
        <a href="#/board" class="nav-item" data-route="board"><span class="nav-icon">▦</span> Board</a>
        <a href="#/backlog" class="nav-item" data-route="backlog"><span class="nav-icon">☰</span> Backlog</a>
      </nav>
      <main id="view"></main>
    </div>
  </div>

  <div id="modal-root"></div>
  <div id="toast-root"></div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `css/base.css`**

```css
:root{
  --board-bg:#F4F5F7; --card-bg:#FFFFFF;
  --line:#DFE1E6; --text:#172B4D; --text-subtle:#5E6C84; --text-faint:#6B778C;
  --blue:#0052CC; --blue-hover:#0065FF; --blue-light:#DEEBFF;
  --red:#DE350B; --red-light:#FFEBE6; --yellow-light:#FFF7D6; --orange:#FF991F;
  --radius:3px; --shadow:0 1px 2px rgba(9,30,66,.25),0 0 1px rgba(9,30,66,.31);
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);color:var(--text);background:#fff;font-size:14px}
button{font-family:inherit;cursor:pointer;color:var(--text)}
a{color:var(--blue)}
input,select,textarea{font-family:inherit;font-size:14px;color:var(--text);
  border:2px solid var(--line);border-radius:var(--radius);padding:6px 8px;background:#FAFBFC;width:100%}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);background:#fff}
input[type=checkbox]{width:auto}
.btn{border:none;border-radius:var(--radius);padding:6px 12px;font-weight:500;font-size:14px;background:#F4F5F7}
.btn:hover{background:#EBECF0}
.btn-primary{background:var(--blue);color:#fff}
.btn-primary:hover{background:var(--blue-hover)}
.btn-danger{background:var(--red);color:#fff}
.icon-btn{background:none;border:none;border-radius:var(--radius);padding:4px 8px;color:var(--text-subtle);font-size:14px}
.icon-btn:hover{background:#EBECF0}
.avatar{width:28px;height:28px;border-radius:50%;background:#EBECF0}
.form-error{color:var(--red);font-size:13px;margin-top:12px}
.chip{display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;background:#EBECF0;color:var(--text-subtle)}
.chip-x{border:none;background:none;font-size:12px;margin-left:4px;color:inherit;padding:0}
.chip-due.overdue{background:var(--red-light);color:var(--red)}
.points-badge{background:#EBECF0;border-radius:10px;font-size:11px;font-weight:600;padding:1px 8px;color:var(--text-subtle)}
.epic-pill{display:inline-block;font-size:11px;font-weight:600;color:#fff;padding:1px 8px;border-radius:3px;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;align-self:flex-start}
.icon{display:inline-flex;flex-shrink:0}
.icon svg{width:16px;height:16px;display:block}
#toast-root{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:300;display:flex;flex-direction:column;gap:8px}
.toast{background:#172B4D;color:#fff;padding:10px 16px;border-radius:var(--radius);box-shadow:var(--shadow);animation:toast-in .2s ease}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
.dropdown{position:absolute;top:36px;right:0;background:#fff;border-radius:var(--radius);
  box-shadow:0 4px 8px rgba(9,30,66,.25),0 0 1px rgba(9,30,66,.31);min-width:180px;padding:4px 0;z-index:250}
.dropdown-label{padding:8px 16px;font-size:12px;color:var(--text-faint)}
.dropdown-item{display:block;width:100%;text-align:left;background:none;border:none;padding:8px 16px;font-size:14px}
.dropdown-item:hover{background:#F4F5F7}
.modal-overlay{position:fixed;inset:0;background:rgba(9,30,66,.54);display:flex;align-items:flex-start;
  justify-content:center;padding:48px 16px;z-index:200;overflow-y:auto}
```

- [ ] **Step 4: Write `css/chrome.css`**

```css
#signin{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--board-bg)}
#signin[hidden]{display:none}
.signin-card{background:#fff;padding:48px;border-radius:var(--radius);box-shadow:var(--shadow);text-align:center;max-width:400px}
.signin-card h1{font-size:24px;margin-bottom:8px}
.signin-card p{color:var(--text-subtle);margin-bottom:24px}
#topnav{display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:16px}
.brand-mark{width:24px;height:24px;border-radius:4px;background:var(--blue);display:inline-block}
.topnav-right{margin-left:auto;display:flex;align-items:center;gap:12px}
#offline-badge{background:var(--yellow-light);color:#974F0C;font-size:12px;font-weight:600;padding:2px 8px;border-radius:3px}
.avatar-wrap{position:relative}
#app-body{display:flex;height:calc(100vh - 57px)}
#sidebar{width:240px;border-right:1px solid var(--line);padding:16px 8px;flex-shrink:0}
#sidebar.collapsed{display:none}
.project{display:flex;gap:8px;align-items:center;padding:8px;margin-bottom:16px;border-radius:var(--radius);cursor:pointer}
.project:hover{background:#EBECF0}
.project-icon{width:32px;height:32px;border-radius:4px;background:var(--orange);color:#fff;font-weight:700;
  display:flex;align-items:center;justify-content:center}
.project-name{font-weight:600;font-size:14px}
.project-sub{font-size:11px;color:var(--text-faint)}
.nav-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius);
  color:var(--text);text-decoration:none;font-size:14px}
.nav-item:hover{background:#EBECF0}
.nav-item.active{background:var(--blue-light);color:var(--blue);font-weight:500}
.nav-icon{width:16px;text-align:center}
#view{flex:1;overflow:auto;padding:24px}
```

- [ ] **Step 5: Write `css/board.css`**

```css
.board-header{margin-bottom:16px}
.board-title{font-size:24px;font-weight:500;margin-bottom:12px}
.board-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.board-controls .spacer{flex:1}
.filter-search{max-width:200px;width:200px}
.filter-select{width:auto}
.filter-chip{border:none;background:#F4F5F7;border-radius:var(--radius);padding:6px 10px;font-size:14px}
.filter-chip.active{background:var(--blue-light);color:var(--blue)}
.board{display:flex;gap:8px;align-items:flex-start}
.column{background:var(--board-bg);border-radius:5px;width:270px;flex-shrink:0;padding:8px;
  display:flex;flex-direction:column}
.column-header{display:flex;align-items:center;gap:6px;padding:4px 8px 10px;font-size:12px;font-weight:600;
  color:var(--text-subtle);text-transform:uppercase;letter-spacing:.5px}
.column-header .count{font-weight:400}
.column-header.over-wip{color:var(--red)}
.column-header.over-wip .count{background:var(--red-light);color:var(--red);border-radius:3px;padding:0 4px}
.column-list{display:flex;flex-direction:column;gap:6px;min-height:8px}
.card{background:var(--card-bg);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px;
  cursor:pointer;display:flex;flex-direction:column;gap:6px}
.card:hover{background:#FAFBFC}
.card.ghost{opacity:.4}
.card-title{font-size:14px;line-height:1.35}
.card-labels{display:flex;flex-wrap:wrap;gap:4px}
.card-meta{display:flex;gap:6px;align-items:center}
.card-footer{display:flex;align-items:center;gap:6px}
.card-footer .key{font-size:12px;color:var(--text-subtle);font-weight:500}
.card-footer .key.done{text-decoration:line-through}
.card-footer .right{margin-left:auto;display:flex;align-items:center;gap:6px}
.card-footer .avatar{width:20px;height:20px}
.col-add{border:none;background:none;text-align:left;padding:8px;border-radius:var(--radius);
  color:var(--text-subtle);font-size:14px;margin-top:4px;width:100%}
.col-add:hover{background:#EBECF0}
.empty-hint{color:var(--text-faint);font-size:13px;padding:20px 8px;text-align:center}
.swimlane{margin-bottom:16px}
.swimlane-header{display:flex;align-items:center;gap:8px;padding:6px 4px;font-weight:600;cursor:pointer;font-size:14px}
.swimlane-header .caret{transition:transform .15s;display:inline-block}
.swimlane.collapsed .caret{transform:rotate(-90deg)}
.swimlane.collapsed .board{display:none}
```

- [ ] **Step 6: Write `css/backlog.css`**

```css
.backlog-layout{display:flex;gap:16px;min-height:100%}
.epic-panel{width:220px;flex-shrink:0;border-right:1px solid var(--line);padding-right:12px}
.epic-panel h3{font-size:12px;text-transform:uppercase;color:var(--text-subtle);margin-bottom:8px}
.epic-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--radius);
  cursor:pointer;font-size:13px}
.epic-item:hover{background:#EBECF0}
.epic-item.active{background:var(--blue-light)}
.epic-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
.epic-item .edit{margin-left:auto;visibility:hidden;padding:0 4px}
.epic-item:hover .edit{visibility:visible}
.epic-swatches{display:flex;gap:6px;flex-wrap:wrap}
.epic-swatch{width:24px;height:24px;border-radius:4px;border:2px solid transparent;cursor:pointer}
.epic-swatch.selected{border-color:var(--text)}
.backlog-main{flex:1;min-width:0}
.backlog-section{margin-bottom:24px}
.backlog-section h3{font-size:13px;font-weight:600;margin-bottom:8px}
.backlog-section h3 .count{color:var(--text-faint);font-weight:400}
.backlog-list{border:2px dashed transparent;border-radius:var(--radius);min-height:40px}
.backlog-list:empty{border-color:var(--line)}
.backlog-row{display:flex;align-items:center;gap:8px;background:#fff;border-bottom:1px solid var(--line);
  padding:8px;cursor:pointer;font-size:13px}
.backlog-row:hover{background:#FAFBFC}
.backlog-row .key{color:var(--text-subtle);flex-shrink:0}
.backlog-row .title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

- [ ] **Step 7: Write `css/modal.css`**

```css
.modal{background:#fff;border-radius:var(--radius);box-shadow:0 8px 16px rgba(9,30,66,.25);
  width:100%;max-width:560px;padding:24px}
.modal h2{font-size:20px;margin-bottom:16px}
.modal .field{margin-bottom:12px;display:flex;flex-direction:column;gap:4px}
.modal .field label{font-size:12px;font-weight:600;color:var(--text-subtle)}
.modal .field .static{font-size:13px;color:var(--text-subtle)}
.modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.modal-detail{max-width:920px}
.detail-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.detail-header .key{color:var(--text-subtle);font-weight:500}
.detail-header .right{margin-left:auto;display:flex;gap:4px;position:relative}
.detail-grid{display:grid;grid-template-columns:1fr 280px;gap:24px}
.detail-main{min-width:0}
.detail-title{font-size:20px;font-weight:500;border-color:transparent;background:transparent;padding:4px}
.detail-title:hover{background:#EBECF0}
.detail-section{margin:16px 0}
.detail-section>h4{font-size:12px;text-transform:uppercase;color:var(--text-subtle);margin-bottom:8px}
.subtask-row{display:flex;align-items:center;gap:8px;padding:4px 0}
.subtask-row.done .subtask-text{text-decoration:line-through;color:var(--text-faint)}
.subtask-row .subtask-text{flex:1}
.progress{height:6px;background:#EBECF0;border-radius:3px;overflow:hidden;margin:6px 0}
.progress>div{height:100%;background:var(--blue)}
.tabs{display:flex;gap:4px;border-bottom:2px solid var(--line);margin-bottom:8px}
.tab{border:none;background:none;padding:8px 12px;font-weight:500;color:var(--text-subtle)}
.tab.active{color:var(--blue);box-shadow:0 2px 0 var(--blue)}
.comment{padding:8px 0;border-bottom:1px solid var(--line)}
.comment .meta{font-size:12px;color:var(--text-faint);margin-bottom:2px;display:flex;gap:8px;align-items:center}
.comment .meta button{margin-left:auto}
.activity-item{font-size:13px;padding:6px 0;color:var(--text-subtle);border-bottom:1px solid var(--line)}
.activity-item .ts{color:var(--text-faint);font-size:12px;margin-left:6px}
.link-row{display:flex;align-items:center;gap:8px;padding:4px 0}
.link-row a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.inline-two{display:flex;gap:8px}
.inline-two input{flex:1}
```

- [ ] **Step 8: Write stub `js/main.js`** (replaced in Task 4)

```js
// Temporary boot stub — Task 4 replaces this with the real auth flow.
document.getElementById('signin').hidden = false;
```

- [ ] **Step 9: Write `firebase-config.js` template** (real values pasted in Task 3)

```js
// Firebase web app config. These values are PUBLIC by design (the security
// boundary is Firestore rules, not this file). Real values are filled in
// during the Firebase setup step — see README.md.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};
```

- [ ] **Step 10: Write `.gitignore`**

```
.DS_Store
```

- [ ] **Step 11: Write `README.md`**

```markdown
# Personal Kanban

A free, JIRA-style kanban board. Anyone with a Google account who opens the
app gets their own private board. Vanilla JS + Firebase, no build step.

## One-time Firebase setup (owner only)

1. Go to https://console.firebase.google.com → **Add project** → name it
   `personal-kanban` → disable Google Analytics → Create.
2. **Authentication** → Get started → Sign-in method → enable **Google**
   → set a support email → Save.
3. **Firestore Database** → Create database → Start in **production mode**
   → pick a region close to you (e.g. `australia-southeast1`) → Enable.
4. Firestore → **Rules** → replace with:

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

   → Publish.
5. Project overview → **Add app** → Web (</>) → nickname `personal-kanban`
   → don't tick hosting → Register. Copy the `firebaseConfig` values into
   `firebase-config.js` in this repo.
6. After deploying to GitHub Pages: Authentication → Settings →
   **Authorized domains** → Add domain → `harrycpc.github.io`.

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(`localhost` is already an authorized domain for Google sign-in.)

## Tests

```sh
node --test tests/
```

## Deploy

Push to `main` on GitHub; the site is served by GitHub Pages from the
branch root at https://harrycpc.github.io/personal-kanban/.
```

- [ ] **Step 12: Verify in browser**

Run: `cd ~/Documents/personal-kanban && python3 -m http.server 8000` (background), open `http://localhost:8000`.
Expected: centered white sign-in card on gray background, "Personal Kanban" heading, blue "Sign in with Google" button (inert). No console errors except none — Sortable loads from CDN.

- [ ] **Step 13: Commit**

```bash
cd ~/Documents/personal-kanban
git add -A
git commit -m "feat: scaffold static shell, full JIRA-style CSS, README"
```

---

### Task 2: Pure logic module (TDD)

**Files:**
- Create: `js/logic.js`
- Test: `tests/logic.test.mjs`

**Interfaces:**
- Produces (all consumed by later tasks):
  - `newId(): string` — collision-safe random id for columns/subtasks/comments/links.
  - `suggestKeyPrefix(name: string): string` — uppercase key suggestion, falls back `'PK'`.
  - `todayLocalISO(d?: Date): string` — local `YYYY-MM-DD`.
  - `isOverdue(dueDate: string, today?: string): boolean`.
  - `appendActivity(activity: Array<{ts,text}>|undefined, text: string, ts?: number): Array` — returns new array capped at 100.
  - `allLabels(issues: Array<{labels?: string[]}>): string[]` — unique, sorted.
  - `formatDue(dueDate: string): string` — `"2026-07-15"` → `"15 Jul"`.
  - `EPIC_COLORS: string[]` — 8 hex colors.
  - `PRIORITIES: Array<[value, label]>` — the five JIRA priorities in order.
  - `TYPES: Array<[value, label]>` — task/story/bug.

- [ ] **Step 1: Write the failing tests — `tests/logic.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, suggestKeyPrefix, todayLocalISO, isOverdue,
  appendActivity, allLabels, formatDue, EPIC_COLORS, PRIORITIES, TYPES,
} from '../js/logic.js';

test('newId returns distinct non-empty strings', () => {
  const a = newId(), b = newId();
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

test('suggestKeyPrefix: multi-word takes initials', () => {
  assert.equal(suggestKeyPrefix("Harry's Goals"), 'HG');
  assert.equal(suggestKeyPrefix('My Kanban'), 'MK');
  assert.equal(suggestKeyPrefix('a b c d e'), 'ABCD');
});

test('suggestKeyPrefix: single word takes first three letters', () => {
  assert.equal(suggestKeyPrefix('Goals'), 'GOA');
});

test('suggestKeyPrefix: empty or letterless input falls back to PK', () => {
  assert.equal(suggestKeyPrefix(''), 'PK');
  assert.equal(suggestKeyPrefix('123'), 'PK');
});

test('todayLocalISO formats a known date', () => {
  assert.equal(todayLocalISO(new Date(2026, 6, 15)), '2026-07-15');
});

test('isOverdue is strict past-date comparison', () => {
  assert.equal(isOverdue('2026-07-14', '2026-07-15'), true);
  assert.equal(isOverdue('2026-07-15', '2026-07-15'), false);
  assert.equal(isOverdue('', '2026-07-15'), false);
  assert.equal(isOverdue(undefined, '2026-07-15'), false);
});

test('appendActivity appends and caps at 100', () => {
  let a = appendActivity(undefined, 'first', 1);
  assert.deepEqual(a, [{ ts: 1, text: 'first' }]);
  for (let i = 0; i < 104; i++) a = appendActivity(a, 'e' + i, i + 2);
  assert.equal(a.length, 100);
  assert.equal(a[99].text, 'e103');
  assert.equal(a[0].text, 'e4');
});

test('allLabels: unique and sorted, tolerates missing labels', () => {
  assert.deepEqual(
    allLabels([{ labels: ['b', 'a'] }, { labels: ['a', 'c'] }, {}]),
    ['a', 'b', 'c'],
  );
});

test('formatDue renders day + short month', () => {
  assert.equal(formatDue('2026-07-15'), '15 Jul');
  assert.equal(formatDue('2026-01-03'), '3 Jan');
});

test('constants are well-formed', () => {
  assert.equal(EPIC_COLORS.length, 8);
  assert.deepEqual(PRIORITIES.map(p => p[0]), ['highest', 'high', 'medium', 'low', 'lowest']);
  assert.deepEqual(TYPES.map(t => t[0]), ['task', 'story', 'bug']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/personal-kanban && node --test tests/`
Expected: FAIL — `Cannot find module .../js/logic.js`.

- [ ] **Step 3: Write `js/logic.js`**

```js
export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function suggestKeyPrefix(name) {
  const cleaned = (name || '').replace(/['’]/g, '').toUpperCase();
  const words = cleaned.split(/[^A-Z0-9]+/).filter(Boolean);
  if (!words.length) return 'PK';
  const raw = words.length === 1 ? words[0].slice(0, 3) : words.map(w => w[0]).join('').slice(0, 4);
  const prefix = raw.replace(/[^A-Z]/g, '');
  return prefix || 'PK';
}

export function todayLocalISO(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isOverdue(dueDate, today = todayLocalISO()) {
  return !!dueDate && dueDate < today;
}

export function appendActivity(activity, text, ts = Date.now()) {
  return [...(activity || []), { ts, text }].slice(-100);
}

export function allLabels(issues) {
  return [...new Set(issues.flatMap(i => i.labels || []))].sort();
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function formatDue(dueDate) {
  const [, m, d] = dueDate.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export const EPIC_COLORS = ['#8777D9','#2684FF','#57D9A3','#00C7E6','#FFC400','#FF7452','#6554C0','#00875A'];

export const PRIORITIES = [
  ['highest', 'Highest'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['lowest', 'Lowest'],
];

export const TYPES = [['task', 'Task'], ['story', 'Story'], ['bug', 'Bug']];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all tests pass (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.mjs
git commit -m "feat: pure logic module with unit tests"
```

---

### Task 3: USER SETUP GATE — Firebase project + real config

**This task requires the user (Harry) at the Firebase console. The executor cannot do steps 1–2 alone.**

**Files:**
- Modify: `firebase-config.js` (replace REPLACE_ME values)

**Interfaces:**
- Produces: a working Firebase project with Google auth + Firestore + published rules, and a real `firebaseConfig` export consumed by `js/firebase.js` (Task 4).

- [ ] **Step 1: USER — create the Firebase project**

Follow README "One-time Firebase setup" steps 1–4 exactly (project `personal-kanban`, enable Google sign-in provider, create Firestore in production mode, publish the security rules from the README).

- [ ] **Step 2: USER — register the web app and provide the config**

README step 5: Project overview → Add app → Web. Paste the `firebaseConfig` object values into the chat (or edit `firebase-config.js` directly). These values are public by design.

- [ ] **Step 3: Update `firebase-config.js` with the real values**

Same shape as the template — replace every `REPLACE_ME` with the real value. Keep the explanatory comment.

- [ ] **Step 4: Verify**

Run: `grep -c REPLACE_ME firebase-config.js`
Expected: `0`. Also: Firebase console shows Authentication (Google enabled) and Firestore (rules published).

- [ ] **Step 5: Commit**

```bash
git add firebase-config.js
git commit -m "chore: add real Firebase web config"
```

---

### Task 4: Firebase init + Google sign-in/out

**Files:**
- Create: `js/firebase.js`, `js/auth.js`
- Modify: `js/main.js` (replace stub)

**Interfaces:**
- Consumes: `firebaseConfig` from `firebase-config.js` (Task 3).
- Produces:
  - `js/firebase.js`: `app`, `auth`, `db` (Firestore with offline persistence), `googleProvider`.
  - `js/auth.js`: `initSignin(): void` (wires #btn-signin with popup→redirect fallback + inline error), `wireSignout(): void` (wires #btn-signout).
  - `js/main.js`: `onAuthStateChanged` boot that toggles `#signin`/`#app` — extended in Task 5.

- [ ] **Step 1: Write `js/firebase.js`**

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const googleProvider = new GoogleAuthProvider();
```

- [ ] **Step 2: Write `js/auth.js`**

```js
import { auth, googleProvider } from './firebase.js';
import {
  signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export function initSignin() {
  const btn = document.getElementById('btn-signin');
  const err = document.getElementById('signin-error');
  btn.addEventListener('click', async () => {
    err.hidden = true;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      if (e.code === 'auth/popup-closed-by-user') return;
      err.textContent = 'Sign-in failed: ' + (e.message || e.code);
      err.hidden = false;
    }
  });
}

export function wireSignout() {
  document.getElementById('btn-signout').addEventListener('click', () => signOut(auth));
}
```

- [ ] **Step 3: Replace `js/main.js`**

```js
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initSignin, wireSignout } from './auth.js';

const signinEl = document.getElementById('signin');
const appEl = document.getElementById('app');

initSignin();
wireSignout();

onAuthStateChanged(auth, user => {
  if (!user) {
    appEl.hidden = true;
    signinEl.hidden = false;
    return;
  }
  document.getElementById('nav-avatar').src = user.photoURL || '';
  document.getElementById('menu-email').textContent = user.email || '';
  signinEl.hidden = true;
  appEl.hidden = false;
});
```

- [ ] **Step 4: Verify in browser**

Serve `http://localhost:8000`. Click "Sign in with Google" → Google popup → pick account → app chrome appears (top nav with your avatar, empty sidebar project, empty view). Reload → still signed in. The avatar-menu *toggle* is wired in Task 6; to test sign-out now, temporarily remove the `hidden` attribute from `#avatar-menu` in DevTools and click Sign out → sign-in screen returns. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add js/firebase.js js/auth.js js/main.js
git commit -m "feat: Firebase init and Google sign-in flow"
```

---

### Task 5: UI helpers, state, store base, onboarding

**Files:**
- Create: `js/ui.js`, `js/state.js`, `js/store.js`
- Modify: `js/auth.js` (add `onboardingDialog`), `js/main.js` (onboarding + subscriptions)

**Interfaces:**
- Consumes: `suggestKeyPrefix`, `newId` from `js/logic.js`; `db` from `js/firebase.js`.
- Produces (exact signatures later tasks rely on):
  - `js/ui.js`:
    - `el(tag, attrs = {}, ...children): HTMLElement` — `class`, `dataset`, `onXxx` listeners, other attrs; children may be nodes/strings/arrays/null.
    - `openModal(node, { dismissable = true } = {}): HTMLElement` — appends a `.modal-overlay` wrapper to `#modal-root` (stackable), returns the overlay; backdrop click removes it when dismissable.
    - `closeTopModal(): void`
    - `toast(msg: string): void` — 4s auto-dismiss.
    - `confirmDialog({ title, message, confirmLabel = 'Delete' }): Promise<boolean>`
    - `selectEl(options: Array<[value,label]>, value): HTMLSelectElement`
    - `iconEl(svgHtml: string, title = ''): HTMLElement`
    - `typeIconHtml(type): string`, `priorityIconHtml(priority): string`
  - `js/state.js`:
    - `state` — `{ user, userDoc, issues, epics, route, filters:{text,type,epicId,label,overdue}, groupByEpic, collapsedLanes:Set }`
    - `setRenderer(fn)`, `rerender()`
    - `columnsSorted(): Column[]`, `isDoneStatus(status): boolean`, `issuesByStatus(status): Issue[]` (sorted by `order`), `findEpic(id): Epic|undefined`, `statusName(status): string`
  - `js/store.js` (this task's slice):
    - `initStore(uid)`, `getUserDoc(): Promise<object|null>`, `createUserDoc(profile, projectName, keyPrefix)`, `updateProject(fields)`, `subscribeUser(cb): unsub`, `subscribeIssues(cb): unsub`, `subscribeEpics(cb): unsub`
  - `js/auth.js`: `onboardingDialog(defaultName): Promise<{projectName, keyPrefix}>`

- [ ] **Step 1: Write `js/ui.js`**

```js
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : String(c));
  }
  return node;
}

const modalRoot = () => document.getElementById('modal-root');

export function openModal(node, { dismissable = true } = {}) {
  const overlay = el('div', { class: 'modal-overlay' }, node);
  if (dismissable) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  modalRoot().append(overlay);
  return overlay;
}

export function closeTopModal() {
  modalRoot().lastElementChild?.remove();
}

export function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  document.getElementById('toast-root').append(t);
  setTimeout(() => t.remove(), 4000);
}

export function confirmDialog({ title, message, confirmLabel = 'Delete' }) {
  return new Promise(resolve => {
    const done = v => { overlay.remove(); resolve(v); };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, title),
      el('p', {}, message),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onclick: () => done(true) }, confirmLabel),
      )), { dismissable: false });
  });
}

export function selectEl(options, value) {
  return el('select', {},
    options.map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
}

export function iconEl(svgHtml, title = '') {
  const s = el('span', { class: 'icon', title });
  s.innerHTML = svgHtml;
  return s;
}

const TYPE_SVGS = {
  task: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4BADE8"/><path d="M6.7 11.2 3.8 8.3l1-1 1.9 1.9 4.5-4.5 1 1z" fill="#fff"/></svg>',
  story: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#63BA3C"/><path d="M5 3h6v10L8 10.6 5 13z" fill="#fff"/></svg>',
  bug: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E5493A"/><circle cx="8" cy="8" r="3.5" fill="#fff"/></svg>',
};
export function typeIconHtml(type) { return TYPE_SVGS[type] || TYPE_SVGS.task; }

const PRIO_SVGS = {
  highest: ['#CD1316', 'M8 2.5l5.5 5.5H10v5.5H6V8H2.5z'],
  high: ['#E9494A', 'M8 3.5l5.5 6h-11z'],
  medium: ['#EA7D24', 'M3 5.5h10v2H3zm0 3.5h10v2H3z'],
  low: ['#2D8738', 'M8 12.5l-5.5-6h11z'],
  lowest: ['#57A55A', 'M8 13.5L2.5 8H6V2.5h4V8h3.5z'],
};
export function priorityIconHtml(priority) {
  const [color, d] = PRIO_SVGS[priority] || PRIO_SVGS.medium;
  return `<svg viewBox="0 0 16 16" aria-label="${priority}"><path d="${d}" fill="${color}"/></svg>`;
}
```

- [ ] **Step 2: Write `js/state.js`**

```js
export const state = {
  user: null,
  userDoc: null,
  issues: [],
  epics: [],
  route: 'board',
  filters: { text: '', type: '', epicId: '', label: '', overdue: false },
  groupByEpic: localStorage.getItem('pk-groupby') === 'epic',
  collapsedLanes: new Set(),
};

let renderFn = () => {};
export function setRenderer(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

export function columnsSorted() {
  return [...(state.userDoc?.columns || [])].sort((a, b) => a.order - b.order);
}

export function isDoneStatus(status) {
  const cols = columnsSorted();
  return cols.length > 0 && status === cols[cols.length - 1].id;
}

export function issuesByStatus(status) {
  return state.issues.filter(i => i.status === status).sort((a, b) => a.order - b.order);
}

export function findEpic(id) {
  return state.epics.find(e => e.id === id);
}

export function statusName(status) {
  if (status === 'backlog') return 'Backlog';
  return columnsSorted().find(c => c.id === status)?.name || status;
}
```

- [ ] **Step 3: Write `js/store.js`**

```js
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { newId } from './logic.js';

let uid = null;
export function initStore(userId) { uid = userId; }

const userRef = () => doc(db, 'users', uid);
const issuesCol = () => collection(db, 'users', uid, 'issues');
const issueRef = id => doc(db, 'users', uid, 'issues', id);
const epicsCol = () => collection(db, 'users', uid, 'epics');
const epicRef = id => doc(db, 'users', uid, 'epics', id);

export async function getUserDoc() {
  const snap = await getDoc(userRef());
  return snap.exists() ? snap.data() : null;
}

export async function createUserDoc(profile, projectName, keyPrefix) {
  await setDoc(userRef(), {
    displayName: profile.displayName || '',
    photoURL: profile.photoURL || '',
    projectName,
    keyPrefix,
    issueCounter: 0,
    columns: ['To Do', 'In Progress', 'Done'].map((name, i) => ({
      id: newId(), name, wipLimit: null, order: i,
    })),
    createdAt: serverTimestamp(),
  });
}

export async function updateProject(fields) {
  await updateDoc(userRef(), fields);
}

export function subscribeUser(cb) {
  return onSnapshot(userRef(), s => cb(s.exists() ? s.data() : null));
}

export function subscribeIssues(cb) {
  return onSnapshot(issuesCol(), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function subscribeEpics(cb) {
  return onSnapshot(epicsCol(), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
```

(`runTransaction`, `writeBatch`, `deleteDoc`, `issueRef`, `epicsCol`, `epicRef` are imported/defined now; the functions using them arrive in Tasks 7–12.)

- [ ] **Step 4: Add `onboardingDialog` to `js/auth.js`**

Append to `js/auth.js`:

```js
import { el, openModal } from './ui.js';
import { suggestKeyPrefix } from './logic.js';

export function onboardingDialog(defaultName = 'My Kanban') {
  return new Promise(resolve => {
    let prefixTouched = false;
    const name = el('input', { value: defaultName });
    const prefix = el('input', { value: suggestKeyPrefix(defaultName), maxlength: '5' });
    const errEl = el('p', { class: 'form-error', hidden: true });
    prefix.addEventListener('input', () => { prefixTouched = true; prefix.value = prefix.value.toUpperCase(); });
    name.addEventListener('input', () => { if (!prefixTouched) prefix.value = suggestKeyPrefix(name.value); });
    const submit = () => {
      const n = name.value.trim() || 'My Kanban';
      const p = prefix.value.trim();
      if (!/^[A-Z][A-Z0-9]{0,4}$/.test(p)) {
        errEl.textContent = 'Key must be 1–5 characters, start with a letter, A–Z / 0–9 only.';
        errEl.hidden = false;
        return;
      }
      overlay.remove();
      resolve({ projectName: n, keyPrefix: p });
    };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, 'Name your project'),
      el('div', { class: 'field' }, el('label', {}, 'Project name'), name),
      el('div', { class: 'field' },
        el('label', {}, 'Key — used for issue IDs like HG-1. Permanent.'), prefix),
      errEl,
      el('div', { class: 'actions' },
        el('button', { class: 'btn btn-primary', onclick: submit }, 'Create project')),
    ), { dismissable: false });
  });
}
```

(Move the two new imports to the top of the file with the existing ones.)

- [ ] **Step 5: Replace `js/main.js`**

```js
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initSignin, wireSignout, onboardingDialog } from './auth.js';
import * as store from './store.js';
import { state, setRenderer, rerender } from './state.js';
import { el } from './ui.js';

const signinEl = document.getElementById('signin');
const appEl = document.getElementById('app');
let unsubs = [];

initSignin();
wireSignout();

setRenderer(renderApp);

function renderApp() {
  if (!state.userDoc) return;
  document.getElementById('project-name').textContent = state.userDoc.projectName;
  document.getElementById('project-icon').textContent = state.userDoc.keyPrefix[0];
  renderView();
}

function renderView() {
  const view = document.getElementById('view');
  if (state.route === 'backlog') {
    view.replaceChildren(el('div', { class: 'board-title' }, 'Backlog'));
  } else {
    view.replaceChildren(el('div', { class: 'board-title' }, 'Board'));
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    unsubs.forEach(u => u());
    unsubs = [];
    Object.assign(state, { user: null, userDoc: null, issues: [], epics: [] });
    appEl.hidden = true;
    signinEl.hidden = false;
    return;
  }
  state.user = user;
  store.initStore(user.uid);
  const existing = await store.getUserDoc();
  if (!existing) {
    const first = (user.displayName || '').split(' ')[0];
    const { projectName, keyPrefix } = await onboardingDialog(first ? `${first}'s Kanban` : 'My Kanban');
    await store.createUserDoc(user, projectName, keyPrefix);
  }
  document.getElementById('nav-avatar').src = user.photoURL || '';
  document.getElementById('menu-email').textContent = user.email || '';
  signinEl.hidden = true;
  appEl.hidden = false;
  unsubs = [
    store.subscribeUser(data => { state.userDoc = data; rerender(); }),
    store.subscribeIssues(list => { state.issues = list; rerender(); }),
    store.subscribeEpics(list => { state.epics = list; rerender(); }),
  ];
});
```

- [ ] **Step 6: Verify in browser**

Serve and open `http://localhost:8000` in a **fresh profile or after deleting the user doc** (first run: there is no doc). Sign in → "Name your project" dialog appears with a suggested name/key; typing a name updates the key until you edit the key manually; an invalid key (e.g. `9X`) shows the inline error; confirming shows the sidebar with project name + icon letter. Firebase console → Firestore → `users/{uid}` doc exists with `projectName`, `keyPrefix`, `issueCounter: 0`, and a 3-element `columns` array with distinct generated `id`s. Sign out (unhide `#avatar-menu` in DevTools if needed — Task 6 wires the toggle) → sign-in screen. Sign back in → **no** onboarding dialog (doc exists).

- [ ] **Step 7: Commit**

```bash
git add js/ui.js js/state.js js/store.js js/auth.js js/main.js
git commit -m "feat: ui/state/store foundations and project onboarding"
```

---

### Task 6: Chrome behaviors — routing, sidebar, menus, offline, rename

**Files:**
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `updateProject` (store), `openModal`/`el`/`toast` (ui), `state`/`rerender` (state).
- Produces: hash routing that sets `state.route` (`'board'` | `'backlog'`) and marks the active `.nav-item`; sidebar collapse toggle; avatar dropdown toggle; `#offline-badge` driven by online/offline events; project rename dialog on `.project` click. Later tasks only replace the two branches inside `renderView()`.

- [ ] **Step 1: Add chrome wiring to `js/main.js`**

Add below `wireSignout();`:

```js
function applyRoute() {
  state.route = location.hash.startsWith('#/backlog') ? 'backlog' : 'board';
  document.querySelectorAll('.nav-item').forEach(a =>
    a.classList.toggle('active', a.dataset.route === state.route));
  rerender();
}
window.addEventListener('hashchange', applyRoute);

document.getElementById('btn-sidebar-toggle').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('collapsed'));

const avatarMenu = document.getElementById('avatar-menu');
document.getElementById('nav-avatar').addEventListener('click', e => {
  e.stopPropagation();
  avatarMenu.hidden = !avatarMenu.hidden;
});
document.addEventListener('click', () => { avatarMenu.hidden = true; });

const offlineBadge = document.getElementById('offline-badge');
const paintOnline = () => { offlineBadge.hidden = navigator.onLine; };
window.addEventListener('online', paintOnline);
window.addEventListener('offline', paintOnline);
paintOnline();

document.querySelector('#sidebar .project').addEventListener('click', () => {
  if (!state.userDoc) return;
  const input = el('input', { value: state.userDoc.projectName });
  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Rename project'),
    el('div', { class: 'field' }, el('label', {}, 'Project name'), input),
    el('div', { class: 'field' },
      el('label', {}, 'Key'),
      el('span', { class: 'static' }, `${state.userDoc.keyPrefix} (permanent)`)),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          const v = input.value.trim();
          if (!v) return;
          try { await store.updateProject({ projectName: v }); }
          catch (err) { toast('Rename failed: ' + err.message); }
          overlay.remove();
        },
      }, 'Save')),
  ));
});
```

Add `openModal` and `toast` to the ui import in `js/main.js`:

```js
import { el, openModal, toast } from './ui.js';
```

And inside `onAuthStateChanged`'s signed-in branch, replace the final line `rerender();`-less subscription block ending with a call to route once:

```js
  applyRoute();
```

(placed after the `unsubs = [...]` assignment, so the first render uses the current hash.)

- [ ] **Step 2: Verify in browser**

Signed in: clicking Board/Backlog in the sidebar switches the placeholder title and highlights the active item; browser back/forward works (hash). ☰ hides/shows the sidebar. Avatar click opens the dropdown with your email; clicking elsewhere closes it; Sign out works and returns to the sign-in card. DevTools → Network → Offline: the yellow "Offline" badge appears; back Online: it disappears. Click the project name → rename dialog → save a new name → sidebar updates live (snapshot), Firestore doc shows the new `projectName`, and the key row shows the prefix as permanent text (not editable).

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: routing, sidebar, avatar menu, offline badge, project rename"
```

---

### Task 7: Issue creation + board rendering

**Files:**
- Create: `js/detail.js` (create modal + shared field helpers; detail modal arrives in Task 9), `js/board.js`
- Modify: `js/store.js` (issue writes), `js/main.js` (wire Create button + board view)

**Interfaces:**
- Consumes: Task 5's store/state/ui exports; `PRIORITIES`, `TYPES`, `allLabels`, `isOverdue`, `formatDue` from logic.
- Produces:
  - `js/store.js`: `createIssue(data): Promise<string /*key*/>` (transaction: increments `issueCounter`, stamps `key`), `updateIssue(id, fields): Promise<void>`, `deleteIssue(id): Promise<void>`, `batchUpdateIssues(updates: Array<{id, ...fields}>): Promise<void>`.
  - `js/detail.js`: `openCreateModal(defaults?: {status?, type?, epicId?})`, `fieldWrap(label, node)`, `labelsInput(initial, onChange): {node, get()}`. Also a stub `openDetailModal(issueId)` (real one in Task 9) so `board.js` can import it.
  - `js/board.js`: `renderBoard(view: HTMLElement)`, `issueCard(issue): HTMLElement` (reused by swimlanes in Task 13).

- [ ] **Step 1: Add issue write functions to `js/store.js`**

Append:

```js
export async function createIssue(data) {
  const ref = doc(issuesCol());
  let key;
  await runTransaction(db, async tx => {
    const snap = await tx.get(userRef());
    const u = snap.data();
    const n = (u.issueCounter || 0) + 1;
    key = `${u.keyPrefix}-${n}`;
    tx.update(userRef(), { issueCounter: n });
    tx.set(ref, { ...data, key, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return key;
}

export async function updateIssue(id, fields) {
  await updateDoc(issueRef(id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteIssue(id) {
  await deleteDoc(issueRef(id));
}

export async function batchUpdateIssues(updates) {
  const batch = writeBatch(db);
  for (const { id, ...fields } of updates) {
    batch.update(issueRef(id), { ...fields, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
```

Note: `createIssue` is a transaction and therefore requires connectivity; callers surface failure via toast (offline edits to *existing* issues still queue fine).

- [ ] **Step 2: Write `js/detail.js` (create modal + helpers + detail stub)**

```js
import { state, columnsSorted, issuesByStatus, statusName, findEpic } from './state.js';
import {
  el, openModal, toast, selectEl, iconEl, typeIconHtml, priorityIconHtml, confirmDialog,
} from './ui.js';
import * as store from './store.js';
import { allLabels, appendActivity, newId, PRIORITIES, TYPES } from './logic.js';

export function fieldWrap(label, node) {
  return el('div', { class: 'field' }, el('label', {}, label), node);
}

export function labelsInput(initial, onChange) {
  let labels = [...(initial || [])];
  const chips = el('div', { class: 'card-labels' });
  const input = el('input', { list: 'labels-datalist', placeholder: 'Add label…' });
  const dl = el('datalist', { id: 'labels-datalist' },
    allLabels(state.issues).map(l => el('option', { value: l })));
  const paint = () => chips.replaceChildren(...labels.map(l =>
    el('span', { class: 'chip' }, l,
      el('button', {
        class: 'chip-x',
        onclick: () => { labels = labels.filter(x => x !== l); paint(); onChange?.(labels); },
      }, '×'))));
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v && !labels.includes(v)) { labels.push(v); paint(); onChange?.(labels); }
    input.value = '';
  });
  paint();
  return { node: el('div', {}, chips, input, dl), get: () => labels };
}

export function openCreateModal(defaults = {}) {
  const cols = columnsSorted();
  const typeSel = selectEl(TYPES, defaults.type || 'task');
  const title = el('input', { placeholder: 'What needs to be done?' });
  const desc = el('textarea', { rows: '3', placeholder: 'Add a description…' });
  const statusSel = selectEl([['backlog', 'Backlog'], ...cols.map(c => [c.id, c.name])],
    defaults.status || 'backlog');
  const prioSel = selectEl(PRIORITIES, 'medium');
  const points = el('input', { type: 'number', min: '0', placeholder: 'None' });
  const due = el('input', { type: 'date' });
  const epicSel = selectEl([['', 'No epic'], ...state.epics.map(e => [e.id, e.name])],
    defaults.epicId || '');
  const labels = labelsInput([], null);

  async function create() {
    const t = title.value.trim();
    if (!t) { toast('Summary is required'); return; }
    const status = statusSel.value;
    try {
      const key = await store.createIssue({
        type: typeSel.value, title: t, description: desc.value, status,
        priority: prioSel.value,
        storyPoints: points.value === '' ? null : Number(points.value),
        dueDate: due.value, epicId: epicSel.value || null, labels: labels.get(),
        order: issuesByStatus(status).length,
        subtasks: [], comments: [], links: [], activity: [],
      });
      toast(`${key} created`);
      overlay.remove();
    } catch (e) { toast('Could not create issue: ' + e.message); }
  }

  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Create issue'),
    fieldWrap('Issue type', typeSel),
    fieldWrap('Summary', title),
    fieldWrap('Description', desc),
    fieldWrap('Status', statusSel),
    fieldWrap('Priority', prioSel),
    fieldWrap('Story points', points),
    fieldWrap('Due date', due),
    fieldWrap('Epic', epicSel),
    fieldWrap('Labels', labels.node),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: create }, 'Create'))));
  title.focus();
}

// Real implementation in Task 9.
export function openDetailModal(issueId) {
  toast('Issue detail arrives in Task 9');
}
```

- [ ] **Step 3: Write `js/board.js`**

```js
import { state, columnsSorted, issuesByStatus, isDoneStatus, findEpic } from './state.js';
import { el, iconEl, typeIconHtml, priorityIconHtml, toast } from './ui.js';
import * as store from './store.js';
import { isOverdue, formatDue } from './logic.js';
import { openCreateModal, openDetailModal } from './detail.js';

let suppressClick = false;

export function renderBoard(view) {
  view.replaceChildren(
    el('div', { class: 'board-header' },
      el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`)),
    el('div', { class: 'board' }, columnsSorted().map(col => columnEl(col))),
  );
}

function columnEl(col) {
  const issues = issuesByStatus(col.id);
  const over = col.wipLimit != null && issues.length > col.wipLimit;
  return el('div', { class: 'column' },
    el('div', { class: 'column-header' + (over ? ' over-wip' : '') },
      col.name,
      el('span', { class: 'count' },
        col.wipLimit != null ? `${issues.length}/${col.wipLimit}` : String(issues.length))),
    el('div', { class: 'column-list', dataset: { status: col.id } }, issues.map(issueCard)),
    inlineCreate(col));
}

function inlineCreate(col) {
  const btn = el('button', { class: 'col-add' }, '+ Create');
  btn.addEventListener('click', () => {
    const input = el('input', { placeholder: 'What needs to be done?' });
    const form = el('form', {}, input);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      try {
        await store.createIssue({
          type: 'task', title, description: '', status: col.id,
          priority: 'medium', storyPoints: null, dueDate: '', epicId: null, labels: [],
          order: issuesByStatus(col.id).length,
          subtasks: [], comments: [], links: [], activity: [],
        });
      } catch (err) { toast('Could not create issue: ' + err.message); }
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) form.replaceWith(btn); });
    btn.replaceWith(form);
    input.focus();
  });
  return btn;
}

export function issueCard(issue) {
  const done = isDoneStatus(issue.status);
  const epic = issue.epicId ? findEpic(issue.epicId) : null;
  const overdue = !done && isOverdue(issue.dueDate);
  const subTotal = (issue.subtasks || []).length;
  const subDone = (issue.subtasks || []).filter(s => s.done).length;
  const card = el('div', { class: 'card', dataset: { id: issue.id } },
    epic && el('span', { class: 'epic-pill', style: `background:${epic.color}` }, epic.name),
    el('div', { class: 'card-title' }, issue.title),
    (issue.labels || []).length > 0 &&
      el('div', { class: 'card-labels' }, issue.labels.map(l => el('span', { class: 'chip' }, l))),
    (issue.dueDate || subTotal > 0) &&
      el('div', { class: 'card-meta' },
        issue.dueDate && el('span', { class: 'chip chip-due' + (overdue ? ' overdue' : '') },
          formatDue(issue.dueDate)),
        subTotal > 0 && el('span', { class: 'chip' }, `${subDone}/${subTotal}`)),
    el('div', { class: 'card-footer' },
      iconEl(typeIconHtml(issue.type), issue.type),
      el('span', { class: 'key' + (done ? ' done' : '') }, issue.key),
      iconEl(priorityIconHtml(issue.priority), issue.priority),
      el('div', { class: 'right' },
        issue.storyPoints != null && el('span', { class: 'points-badge' }, String(issue.storyPoints)),
        el('img', {
          class: 'avatar', src: state.user?.photoURL || '', alt: '', referrerpolicy: 'no-referrer',
        }))));
  card.addEventListener('click', () => { if (!suppressClick) openDetailModal(issue.id); });
  return card;
}

export function setSuppressClick() {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
}
```

- [ ] **Step 4: Wire into `js/main.js`**

Add imports:

```js
import { renderBoard } from './board.js';
import { openCreateModal } from './detail.js';
```

Add next to the other chrome wiring:

```js
document.getElementById('btn-create').addEventListener('click', () => openCreateModal());
```

Replace the board branch of `renderView()`:

```js
function renderView() {
  const view = document.getElementById('view');
  if (state.route === 'backlog') {
    view.replaceChildren(el('div', { class: 'board-title' }, 'Backlog'));
  } else {
    renderBoard(view);
  }
}
```

- [ ] **Step 5: Verify in browser**

Board shows To Do / In Progress / Done gray columns with counts. Top-nav **Create** opens the modal; creating an issue with all fields lands it in the chosen column with JIRA anatomy: type icon, key (`HG-1`-style), priority arrow, points badge, labels, due chip, your avatar. Column-bottom **+ Create** adds a task-type issue inline to that column. Keys increment across both create paths. Open a second tab — new issues appear there live. Create an issue with a past due date in To Do → red due chip; the same issue imagined in Done comes in Task 8 via drag (rightmost column semantics already active: manually setting is not yet possible — acceptable until Task 8/9). Firestore shows the issue docs with all fields.

- [ ] **Step 6: Commit**

```bash
git add js/store.js js/detail.js js/board.js js/main.js
git commit -m "feat: issue creation (transactional keys) and JIRA-style board rendering"
```

---

### Task 8: Drag-and-drop between and within columns

**Files:**
- Modify: `js/board.js`

**Interfaces:**
- Consumes: global `Sortable` (CDN script from index.html), `batchUpdateIssues` (Task 7), `setSuppressClick` (Task 7).
- Produces: `initSortables(root: HTMLElement)` and `handleDrop(evt)` in `board.js` — Task 13 reuses both for swimlanes; Task 15 extends `handleDrop` with activity logging.

- [ ] **Step 1: Add Sortable wiring to `js/board.js`**

Append:

```js
export function initSortables(root) {
  root.querySelectorAll('.column-list').forEach(listEl => {
    new Sortable(listEl, {
      group: listEl.dataset.group || 'board',
      animation: 150,
      ghostClass: 'ghost',
      onEnd: handleDrop,
    });
  });
}

async function handleDrop(evt) {
  setSuppressClick();
  const lists = evt.from === evt.to ? [evt.to] : [evt.from, evt.to];
  const updates = [];
  for (const listEl of lists) {
    const status = listEl.dataset.status;
    [...listEl.querySelectorAll('.card')].forEach((cardEl, i) => {
      updates.push({ id: cardEl.dataset.id, status, order: i });
    });
  }
  try { await store.batchUpdateIssues(updates); }
  catch (e) { toast('Reorder failed: ' + e.message); }
}
```

Then update `renderBoard` to activate it — replace the function with:

```js
export function renderBoard(view) {
  const boardEl = el('div', { class: 'board' }, columnsSorted().map(col => columnEl(col)));
  view.replaceChildren(
    el('div', { class: 'board-header' },
      el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`)),
    boardEl,
  );
  initSortables(boardEl);
}
```

- [ ] **Step 2: Verify in browser**

Drag a card within a column → order changes and survives refresh. Drag across all four… three columns → status changes persist (check Firestore `status` + resequenced integer `order` values 0,1,2…). Drop into Done (rightmost) → key gets struck through and a past-due chip loses its red overdue styling. Drag with a second tab open → the other tab reflects the move in-place. Clicking immediately after a drop does NOT open the detail stub toast (click suppression works); a normal click does.

- [ ] **Step 3: Commit**

```bash
git add js/board.js
git commit -m "feat: drag-and-drop with batched order persistence"
```

---

### Task 9: Issue detail modal — edit everything, delete

**Files:**
- Modify: `js/detail.js` (replace the `openDetailModal` stub)

**Interfaces:**
- Consumes: `updateIssue`, `deleteIssue` (store); `appendActivity` (logic); `fieldWrap`, `labelsInput` (Task 7); `confirmDialog`, `selectEl`, `iconEl` (ui).
- Produces: `openDetailModal(issueId)` — full two-column JIRA dialog. Internal contract Tasks 14–16 build on: a local mutable `issue` copy + `save(fields, activityText?)` closure, and a `detailMain` element they append sections to (marked below).

- [ ] **Step 1: Replace the `openDetailModal` stub in `js/detail.js`**

```js
export function openDetailModal(issueId) {
  const src = state.issues.find(i => i.id === issueId);
  if (!src) return;
  const issue = { ...src };
  const cols = columnsSorted();

  const save = async (fields, activityText) => {
    if (activityText) {
      issue.activity = appendActivity(issue.activity, activityText);
      fields = { ...fields, activity: issue.activity };
    }
    Object.assign(issue, fields);
    try { await store.updateIssue(issue.id, fields); }
    catch (e) { toast('Save failed: ' + e.message); }
  };

  const fmtTs = ts => (ts?.toDate ? ts.toDate().toLocaleString() : '—');

  // --- header ---
  const moreMenu = el('div', { class: 'dropdown', hidden: true },
    el('button', {
      class: 'dropdown-item',
      onclick: async () => {
        moreMenu.hidden = true;
        const ok = await confirmDialog({
          title: `Delete ${issue.key}?`,
          message: 'This permanently deletes the issue, including its comments and subtasks.',
        });
        if (!ok) return;
        try {
          await store.deleteIssue(issue.id);
          toast(`${issue.key} deleted`);
          overlay.remove();
        } catch (e) { toast('Delete failed: ' + e.message); }
      },
    }, 'Delete'));
  const header = el('div', { class: 'detail-header' },
    iconEl(typeIconHtml(issue.type), issue.type),
    el('span', { class: 'key' }, issue.key),
    el('div', { class: 'right' },
      el('button', {
        class: 'icon-btn',
        onclick: e => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; },
      }, '⋯'),
      el('button', { class: 'icon-btn', onclick: () => overlay.remove() }, '✕'),
      moreMenu));

  // --- left column ---
  const title = el('input', { class: 'detail-title', value: issue.title });
  title.addEventListener('change', () => {
    const t = title.value.trim();
    if (t && t !== issue.title) save({ title: t });
    else title.value = issue.title;
  });
  const desc = el('textarea', { rows: '4', placeholder: 'Add a description…' }, issue.description || '');
  desc.addEventListener('change', () => save({ description: desc.value }));
  const detailMain = el('div', { class: 'detail-main' },
    title,
    el('div', { class: 'detail-section' }, el('h4', {}, 'Description'), desc),
    // Task 14 appends subtasksSection(issue, save) here.
    // Task 16 appends linksSection(issue, save) here.
    // Task 15 appends commentsActivitySection(issue, save) here (always last).
  );

  // --- right sidebar ---
  const statusSel = selectEl([['backlog', 'Backlog'], ...cols.map(c => [c.id, c.name])], issue.status);
  statusSel.addEventListener('change', () => {
    const status = statusSel.value;
    const order = state.issues.filter(i => i.status === status && i.id !== issue.id).length;
    save({ status, order }, `Moved to ${statusName(status)}`);
  });
  const typeSel = selectEl(TYPES, issue.type);
  typeSel.addEventListener('change', () =>
    save({ type: typeSel.value }, `Type changed to ${typeSel.selectedOptions[0].textContent}`));
  const prioSel = selectEl(PRIORITIES, issue.priority);
  prioSel.addEventListener('change', () =>
    save({ priority: prioSel.value }, `Priority set to ${prioSel.selectedOptions[0].textContent}`));
  const points = el('input', { type: 'number', min: '0', value: issue.storyPoints ?? '' });
  points.addEventListener('change', () => {
    const v = points.value === '' ? null : Number(points.value);
    save({ storyPoints: v }, v === null ? 'Story points cleared' : `Story points set to ${v}`);
  });
  const labels = labelsInput(issue.labels, ls => save({ labels: ls }));
  const epicSel = selectEl([['', 'No epic'], ...state.epics.map(e => [e.id, e.name])],
    issue.epicId || '');
  epicSel.addEventListener('change', () => {
    const v = epicSel.value || null;
    save({ epicId: v }, v ? `Epic set to ${findEpic(v)?.name ?? v}` : 'Epic removed');
  });
  const due = el('input', { type: 'date', value: issue.dueDate || '' });
  due.addEventListener('change', () =>
    save({ dueDate: due.value }, due.value ? `Due date set to ${due.value}` : 'Due date cleared'));

  const side = el('div', { class: 'detail-side' },
    fieldWrap('Status', statusSel),
    fieldWrap('Issue type', typeSel),
    fieldWrap('Priority', prioSel),
    fieldWrap('Story points', points),
    fieldWrap('Labels', labels.node),
    fieldWrap('Epic', epicSel),
    fieldWrap('Due date', due),
    el('div', { class: 'field' }, el('label', {}, 'Created'),
      el('span', { class: 'static' }, fmtTs(issue.createdAt))),
    el('div', { class: 'field' }, el('label', {}, 'Updated'),
      el('span', { class: 'static' }, fmtTs(issue.updatedAt))));

  const overlay = openModal(el('div', { class: 'modal modal-detail' },
    header,
    el('div', { class: 'detail-grid' }, detailMain, side)));
}
```

- [ ] **Step 2: Verify in browser**

Click a card → detail dialog opens: type icon + key header, big title, description, full right sidebar. Change every field one at a time; each persists immediately (watch the card behind update live via snapshot: title, priority arrow, labels, points, due chip; status move re-columns the card). Status change from the modal appends correct `order` (card lands at the bottom of the target column). Firestore `activity` array grows with entries like `Moved to In Progress`, `Priority set to High` (client `ts` numbers, not server timestamps — Global Constraints). ⋯ → Delete → confirm dialog → issue disappears everywhere; keys are not reused by the next created issue. ✕ and backdrop click close the modal.

- [ ] **Step 3: Commit**

```bash
git add js/detail.js
git commit -m "feat: JIRA-style issue detail modal with inline saves and delete"
```

---

### Task 10: Deploy — GitHub repo, Pages, authorized domain

**Partially a USER GATE: step 3 needs the Firebase console.**

**Files:** none created; repo goes public.

**Interfaces:**
- Produces: live site at `https://harrycpc.github.io/personal-kanban/` that later phases re-deploy to by pushing `main`.

- [ ] **Step 1: Create the GitHub repo and push**

Run:

```bash
cd ~/Documents/personal-kanban
gh repo create personal-kanban --public --source=. --remote=origin --push
```

Expected: repo created at `https://github.com/harrycpc/personal-kanban`, `main` pushed. (If `gh` is missing: create the empty public repo in the GitHub UI, then `git remote add origin https://github.com/harrycpc/personal-kanban.git && git push -u origin main`.)

- [ ] **Step 2: Enable GitHub Pages from main branch root**

Run:

```bash
gh api -X POST repos/harrycpc/personal-kanban/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Expected: HTTP 201. (UI fallback: repo → Settings → Pages → Deploy from a branch → `main` / `/ (root)`.) Wait ~1 minute, then `curl -sI https://harrycpc.github.io/personal-kanban/ | head -1` → `HTTP/2 200`.

- [ ] **Step 3: USER — authorize the Pages domain in Firebase**

Firebase console → Authentication → Settings → Authorized domains → **Add domain** → `harrycpc.github.io` (README step 6).

- [ ] **Step 4: Verify live**

Open `https://harrycpc.github.io/personal-kanban/` → sign in with Google (popup works because the domain is authorized) → your board loads with the issues created locally (same Firebase project). Open it on a phone as a second device → live sync both ways. This completes spec verification item "second browser session… changes propagate live".

- [ ] **Step 5: Commit** (only if anything changed locally)

```bash
git status --short   # expect empty; nothing to commit for deploy itself
```

---

### Task 11: Backlog page — two ranked sections + promotion drag

**Files:**
- Create: `js/backlog.js`
- Modify: `js/main.js` (backlog view branch)

**Interfaces:**
- Consumes: `issuesByStatus`, `columnsSorted`, `findEpic` (state); `batchUpdateIssues` (store); `openDetailModal` (detail); `iconEl`/`typeIconHtml`/`priorityIconHtml` (ui); global `Sortable`.
- Produces: `renderBacklog(view: HTMLElement)`; internal `backlogRow(issue)` and `handleBacklogDrop(evt)`. Task 12 wraps this view with the epic panel — it replaces `renderBacklog`'s outer layout line only.

- [ ] **Step 1: Write `js/backlog.js`**

```js
import { state, columnsSorted, issuesByStatus, findEpic } from './state.js';
import { el, iconEl, typeIconHtml, priorityIconHtml, toast } from './ui.js';
import * as store from './store.js';
import { openDetailModal } from './detail.js';

let suppressClick = false;

export function renderBacklog(view) {
  const first = columnsSorted()[0];
  const main = el('div', { class: 'backlog-main' },
    el('div', { class: 'board-title' }, 'Backlog'),
    section(first.name, first.id),
    section('Backlog', 'backlog'));
  view.replaceChildren(el('div', { class: 'backlog-layout' }, main));
  main.querySelectorAll('.backlog-list').forEach(listEl => {
    new Sortable(listEl, { group: 'backlog', animation: 150, onEnd: handleBacklogDrop });
  });
}

function section(title, status) {
  const issues = filteredByEpic(issuesByStatus(status));
  return el('div', { class: 'backlog-section' },
    el('h3', {}, title, ' ', el('span', { class: 'count' }, `(${issues.length} issues)`)),
    el('div', { class: 'backlog-list', dataset: { status } }, issues.map(backlogRow)));
}

function filteredByEpic(issues) {
  if (!state.filters.epicId) return issues;
  return issues.filter(i => i.epicId === state.filters.epicId);
}

function backlogRow(issue) {
  const epic = issue.epicId ? findEpic(issue.epicId) : null;
  const row = el('div', { class: 'backlog-row', dataset: { id: issue.id } },
    iconEl(typeIconHtml(issue.type), issue.type),
    el('span', { class: 'key' }, issue.key),
    el('span', { class: 'title' }, issue.title),
    epic && el('span', { class: 'epic-pill', style: `background:${epic.color}` }, epic.name),
    (issue.labels || []).map(l => el('span', { class: 'chip' }, l)),
    issue.storyPoints != null && el('span', { class: 'points-badge' }, String(issue.storyPoints)),
    iconEl(priorityIconHtml(issue.priority), issue.priority));
  row.addEventListener('click', () => { if (!suppressClick) openDetailModal(issue.id); });
  return row;
}

async function handleBacklogDrop(evt) {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const lists = evt.from === evt.to ? [evt.to] : [evt.from, evt.to];
  const updates = [];
  for (const listEl of lists) {
    const status = listEl.dataset.status;
    [...listEl.querySelectorAll('.backlog-row')].forEach((rowEl, i) => {
      updates.push({ id: rowEl.dataset.id, status, order: i });
    });
  }
  try { await store.batchUpdateIssues(updates); }
  catch (e) { toast('Reorder failed: ' + e.message); }
}
```

**Caveat for the epic-filter case:** when an epic filter hides some rows, reindexing only the *visible* rows (0..n) means hidden issues keep their old `order` values and may interleave with the reindexed ones. Accepted per the spec's "simple and robust at personal-board scale" ordering rule; do not add fractional ordering.

- [ ] **Step 2: Wire the backlog view in `js/main.js`**

Add import:

```js
import { renderBacklog } from './backlog.js';
```

Replace `renderView()`:

```js
function renderView() {
  const view = document.getElementById('view');
  if (state.route === 'backlog') renderBacklog(view);
  else renderBoard(view);
}
```

- [ ] **Step 3: Verify in browser**

Sidebar → Backlog: two sections — the first board column (e.g. "To Do") on top, "Backlog" below, with JIRA-style rows (type icon, key, title, labels, points, priority). Issues created with status Backlog appear only here, not on the board. Drag a backlog row into the To Do section → it appears on the board's To Do column (check via Board nav). Drag a To Do row down into Backlog → it disappears from the board. Reorder within Backlog → rank persists after refresh. Row click opens the detail modal.

- [ ] **Step 4: Commit**

```bash
git add js/backlog.js js/main.js
git commit -m "feat: JIRA-style backlog page with board promotion drag"
```

---

### Task 12: Epics — CRUD panel, pills, pickers, filter

**Files:**
- Modify: `js/store.js` (epic writes), `js/backlog.js` (epic panel + dialog)

**Interfaces:**
- Consumes: `EPIC_COLORS` (logic); `subscribeEpics` already live since Task 5 (`state.epics` fills automatically); the epic select fields in `detail.js` and the pills on cards/rows already render from `state.epics` — they light up with zero changes.
- Produces:
  - `js/store.js`: `createEpic(data): Promise<string>`, `updateEpic(id, fields)`, `deleteEpic(id, issueIdsToUnassign: string[])` (batch: delete epic + set `epicId: null` on the given issues).
  - `js/backlog.js`: `epicPanel(): HTMLElement`, `openEpicDialog(epic|null)`.

- [ ] **Step 1: Add epic writes to `js/store.js`**

Append:

```js
export async function createEpic(data) {
  const ref = doc(epicsCol());
  await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateEpic(id, fields) {
  await updateDoc(epicRef(id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteEpic(id, issueIdsToUnassign) {
  const batch = writeBatch(db);
  batch.delete(epicRef(id));
  for (const iid of issueIdsToUnassign) {
    batch.update(issueRef(iid), { epicId: null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
```

- [ ] **Step 2: Add the epic panel to `js/backlog.js`**

Extend imports: add `rerender` to the `./state.js` import; add `openModal`, `confirmDialog` to the `./ui.js` import; add `import { EPIC_COLORS } from './logic.js';`.

In `renderBacklog`, replace the `view.replaceChildren(...)` line with:

```js
  view.replaceChildren(el('div', { class: 'backlog-layout' }, epicPanel(), main));
```

Append:

```js
function epicPanel() {
  return el('div', { class: 'epic-panel' },
    el('h3', {}, 'Epics'),
    state.epics.map(epic => {
      const active = state.filters.epicId === epic.id;
      const row = el('div', { class: 'epic-item' + (active ? ' active' : '') },
        el('span', { class: 'epic-dot', style: `background:${epic.color}` }),
        epic.name,
        el('button', {
          class: 'icon-btn edit',
          onclick: e => { e.stopPropagation(); openEpicDialog(epic); },
        }, '✎'));
      row.addEventListener('click', () => {
        state.filters.epicId = active ? '' : epic.id;
        rerender();
      });
      return row;
    }),
    el('button', { class: 'col-add', onclick: () => openEpicDialog(null) }, '+ Create epic'));
}

function openEpicDialog(epic) {
  let color = epic?.color || EPIC_COLORS[0];
  const name = el('input', { value: epic?.name || '', placeholder: 'Epic name' });
  const swatches = el('div', { class: 'epic-swatches' }, EPIC_COLORS.map(c => {
    const sw = el('button', {
      class: 'epic-swatch' + (c === color ? ' selected' : ''),
      style: `background:${c}`,
      onclick: () => {
        color = c;
        swatches.querySelectorAll('.epic-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      },
    });
    return sw;
  }));
  const saveBtn = el('button', {
    class: 'btn btn-primary',
    onclick: async () => {
      const n = name.value.trim();
      if (!n) { toast('Epic name is required'); return; }
      try {
        if (epic) await store.updateEpic(epic.id, { name: n, color });
        else await store.createEpic({ name: n, color });
        overlay.remove();
      } catch (e) { toast('Save failed: ' + e.message); }
    },
  }, epic ? 'Save' : 'Create');
  const deleteBtn = epic && el('button', {
    class: 'btn btn-danger',
    onclick: async () => {
      const affected = state.issues.filter(i => i.epicId === epic.id).map(i => i.id);
      const ok = await confirmDialog({
        title: `Delete epic "${epic.name}"?`,
        message: `${affected.length} issue(s) will be unassigned from it (not deleted).`,
      });
      if (!ok) return;
      try {
        await store.deleteEpic(epic.id, affected);
        if (state.filters.epicId === epic.id) state.filters.epicId = '';
        overlay.remove();
      } catch (e) { toast('Delete failed: ' + e.message); }
    },
  }, 'Delete');
  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, epic ? 'Edit epic' : 'Create epic'),
    el('div', { class: 'field' }, el('label', {}, 'Name'), name),
    el('div', { class: 'field' }, el('label', {}, 'Color'), swatches),
    el('div', { class: 'actions' },
      deleteBtn,
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      saveBtn)));
  name.focus();
}
```

- [ ] **Step 3: Verify in browser**

Backlog → + Create epic → name + JIRA-palette color → appears in the panel. Assign issues to it via the detail modal's Epic select (options now populated) and the Create modal → colored epic pills appear on board cards and backlog rows. Click the epic in the panel → both backlog sections filter to its issues; click again → clears. ✎ → change color → pills update live everywhere. Delete the epic → confirm names the affected issue count → issues remain, pills gone, filter cleared. Firestore: `users/{uid}/epics` docs exist; affected issues show `epicId: null`.

- [ ] **Step 4: Commit**

```bash
git add js/store.js js/backlog.js
git commit -m "feat: epics with panel CRUD, color palette, pills, and filtering"
```

---

### Task 13: Swimlanes — group board by epic

**Files:**
- Modify: `js/board.js`

**Interfaces:**
- Consumes: `state.groupByEpic`, `state.collapsedLanes` (Task 5), `issueCard`, `initSortables` (Task 8 — already reads `listEl.dataset.group`).
- Produces: `boardHeader()` (Task 17 extends it with the filter bar; Task 18 adds the settings gear) and lane-scoped rendering. Drag is allowed **within a lane only** (across its columns), matching JIRA — Sortable `group` is namespaced per lane.

- [ ] **Step 1: Refactor `js/board.js` for lanes**

Add `rerender` to the state import:

```js
import { state, columnsSorted, issuesByStatus, isDoneStatus, findEpic, rerender } from './state.js';
```

Replace `renderBoard` and `columnEl` with:

```js
export function renderBoard(view) {
  view.replaceChildren(boardHeader(), boardBody());
}

function boardHeader() {
  const gb = el('button', {
    class: 'filter-chip' + (state.groupByEpic ? ' active' : ''),
    onclick: () => {
      state.groupByEpic = !state.groupByEpic;
      localStorage.setItem('pk-groupby', state.groupByEpic ? 'epic' : 'none');
      rerender();
    },
  }, `Group by: ${state.groupByEpic ? 'Epic' : 'None'}`);
  return el('div', { class: 'board-header' },
    el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`),
    el('div', { class: 'board-controls' }, el('div', { class: 'spacer' }), gb));
}

function boardBody() {
  if (!state.groupByEpic) {
    const boardEl = el('div', { class: 'board' },
      columnsSorted().map(col => columnEl(col, undefined, 'board')));
    queueMicrotask(() => initSortables(boardEl));
    return boardEl;
  }
  const lanes = [
    ...state.epics.map(e => ({ id: e.id, name: e.name, color: e.color })),
    { id: null, name: 'Everything else', color: '#6B778C' },
  ];
  return el('div', {}, lanes.map(lane => {
    const laneKey = lane.id ?? 'none';
    const collapsed = state.collapsedLanes.has(laneKey);
    const laneBoard = el('div', { class: 'board' },
      columnsSorted().map(col => columnEl(col, lane.id, `board-${laneKey}`)));
    if (!collapsed) queueMicrotask(() => initSortables(laneBoard));
    return el('div', { class: 'swimlane' + (collapsed ? ' collapsed' : '') },
      el('div', {
        class: 'swimlane-header',
        onclick: () => {
          collapsed ? state.collapsedLanes.delete(laneKey) : state.collapsedLanes.add(laneKey);
          rerender();
        },
      },
        el('span', { class: 'caret' }, '▾'),
        el('span', { class: 'epic-dot', style: `background:${lane.color}` }),
        lane.name),
      laneBoard);
  }));
}

function columnEl(col, laneEpicId, group) {
  let issues = issuesByStatus(col.id);
  if (laneEpicId !== undefined) {
    issues = issues.filter(i => (i.epicId || null) === laneEpicId);
  }
  const allInCol = issuesByStatus(col.id);
  const over = col.wipLimit != null && allInCol.length > col.wipLimit;
  return el('div', { class: 'column' },
    el('div', { class: 'column-header' + (over ? ' over-wip' : '') },
      col.name,
      el('span', { class: 'count' },
        col.wipLimit != null ? `${allInCol.length}/${col.wipLimit}` : String(issues.length))),
    el('div', { class: 'column-list', dataset: { status: col.id, group } }, issues.map(issueCard)),
    inlineCreate(col));
}
```

**Note on lane drops:** cross-lane drops are impossible (distinct Sortable groups), so `handleDrop`'s DOM reindex stays correct: within a lane it enumerates only that lane's `.card`s, giving visible-subset reindexing with the same accepted semantics as the backlog's epic-filter caveat (issues in other lanes keep their old `order`).

- [ ] **Step 2: Verify in browser**

Board → "Group by: Epic" → one swimlane per epic plus "Everything else", each with the full column set; the toggle persists across reloads (localStorage). Lane header click collapses/expands with a rotating caret. Drag works within a lane across its columns; cards cannot be dropped into another lane; dropping keeps the issue's epic. "Group by: None" restores the flat board with cross-column drag. The board still renders with zero epics (single "Everything else" lane).

- [ ] **Step 3: Commit**

```bash
git add js/board.js
git commit -m "feat: collapsible epic swimlanes with lane-scoped drag"
```

---

### Task 14: Subtasks — checklist with progress

**Files:**
- Modify: `js/detail.js`

**Interfaces:**
- Consumes: the `issue` local copy + `save(fields, activityText?)` closure and the `detailMain` insertion point from Task 9; `newId` (logic).
- Produces: `subtasksSection(issue, save): HTMLElement`. Card/backlog progress chips already render from `issue.subtasks` (Task 7) — no board changes needed.

- [ ] **Step 1: Add `subtasksSection` to `js/detail.js`**

Append at module level:

```js
function subtasksSection(issue, save) {
  const wrap = el('div', { class: 'detail-section' });
  const addInput = el('input', { placeholder: 'Add subtask…' });
  const addForm = el('form', {}, addInput);
  addForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = addInput.value.trim();
    if (!text) return;
    issue.subtasks = [...(issue.subtasks || []), { id: newId(), text, done: false }];
    save({ subtasks: issue.subtasks });
    addInput.value = '';
    paint();
  });
  function paint() {
    const subs = issue.subtasks || [];
    const done = subs.filter(s => s.done).length;
    wrap.replaceChildren(
      el('h4', {}, subs.length ? `Subtasks (${done}/${subs.length})` : 'Subtasks'),
      subs.length > 0 && el('div', { class: 'progress' },
        el('div', { style: `width:${Math.round(100 * done / subs.length)}%` })),
      subs.map(s => el('div', { class: 'subtask-row' + (s.done ? ' done' : '') },
        el('input', {
          type: 'checkbox', checked: s.done,
          onchange: () => {
            issue.subtasks = issue.subtasks.map(x => x.id === s.id ? { ...x, done: !s.done } : x);
            save({ subtasks: issue.subtasks });
            paint();
          },
        }),
        el('span', { class: 'subtask-text' }, s.text),
        el('button', {
          class: 'icon-btn',
          onclick: () => {
            issue.subtasks = issue.subtasks.filter(x => x.id !== s.id);
            save({ subtasks: issue.subtasks });
            paint();
          },
        }, '×'))),
      addForm);
  }
  paint();
  return wrap;
}
```

In `openDetailModal`, replace the comment line `// Task 14 appends subtasksSection(issue, save) here.` inside the `detailMain` construction with:

```js
    subtasksSection(issue, save),
```

- [ ] **Step 2: Verify in browser**

Open an issue → add three subtasks → checklist renders; check one → strikethrough + progress bar at 33% + header `(1/3)`. The card on the board behind shows a `1/3` chip (via snapshot). Delete a subtask → progress recalculates. Refresh → everything persists. Firestore `subtasks` array holds `{id, text, done}` objects.

- [ ] **Step 3: Commit**

```bash
git add js/detail.js
git commit -m "feat: subtask checklist with progress bar and card chip"
```

---

### Task 15: Comments + Activity tabs; move logging from drag

**Files:**
- Modify: `js/detail.js` (tabs section), `js/board.js` and `js/backlog.js` (log cross-list moves)

**Interfaces:**
- Consumes: `appendActivity` (logic — already wired into `save`); `state.issues` lookups in drop handlers; `statusName` (state).
- Produces: `commentsActivitySection(issue, save): HTMLElement`. Drop handlers now attach an `activity` field to the moved issue's update when it changes lists.

- [ ] **Step 1: Add `commentsActivitySection` to `js/detail.js`**

Append at module level:

```js
function commentsActivitySection(issue, save) {
  let tab = 'comments';
  const wrap = el('div', { class: 'detail-section' });
  const input = el('textarea', { rows: '2', placeholder: 'Add a comment…' });
  const form = el('form', {}, input,
    el('div', { class: 'actions' },
      el('button', { class: 'btn btn-primary', type: 'submit' }, 'Save')));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    issue.comments = [...(issue.comments || []), { id: newId(), text, createdAt: Date.now() }];
    save({ comments: issue.comments });
    input.value = '';
    paint();
  });
  function paint() {
    const tabBtn = (id, label) => el('button', {
      class: 'tab' + (tab === id ? ' active' : ''),
      onclick: () => { tab = id; paint(); },
    }, label);
    const body = tab === 'comments'
      ? el('div', {},
          form,
          [...(issue.comments || [])].reverse().map(c => el('div', { class: 'comment' },
            el('div', { class: 'meta' },
              state.user?.displayName || 'You', ' · ', new Date(c.createdAt).toLocaleString(),
              el('button', {
                class: 'icon-btn',
                onclick: () => {
                  issue.comments = issue.comments.filter(x => x.id !== c.id);
                  save({ comments: issue.comments });
                  paint();
                },
              }, '×')),
            el('div', {}, c.text))))
      : el('div', {},
          [...(issue.activity || [])].reverse().map(a => el('div', { class: 'activity-item' },
            a.text, el('span', { class: 'ts' }, new Date(a.ts).toLocaleString()))));
    wrap.replaceChildren(
      el('h4', {}, 'Activity'),
      el('div', { class: 'tabs' }, tabBtn('comments', 'Comments'), tabBtn('activity', 'History')),
      body);
  }
  paint();
  return wrap;
}
```

In `openDetailModal`, replace the comment line `// Task 15 appends commentsActivitySection(issue, save) here (always last).` with:

```js
    commentsActivitySection(issue, save),
```

- [ ] **Step 2: Log cross-column moves in `js/board.js`**

Add imports to `board.js`: `statusName` (extend the `./state.js` import) and `import { appendActivity } from './logic.js';` (extend the existing logic import line to `import { isOverdue, formatDue, appendActivity } from './logic.js';`).

In `handleDrop`, after the `updates` loop and before the `try`, add:

```js
  if (evt.from !== evt.to) {
    const movedId = evt.item.dataset.id;
    const moved = updates.find(u => u.id === movedId);
    const src = state.issues.find(i => i.id === movedId);
    if (moved && src) {
      moved.activity = appendActivity(src.activity, `Moved to ${statusName(moved.status)}`);
    }
  }
```

- [ ] **Step 3: Same logging in `js/backlog.js`**

Extend imports: add `statusName` to the `./state.js` import; add `import { appendActivity } from './logic.js';`.

In `handleBacklogDrop`, after the `updates` loop and before the `try`, insert the identical block from Step 2 verbatim (it operates on `evt` and `updates` the same way).

- [ ] **Step 4: Verify in browser**

Open an issue → Comments tab: add two comments → newest first with your name + timestamp; × removes one. History tab: shows prior field changes from Task 9 (e.g. `Priority set to High`) with timestamps, newest first. Drag the issue to another column → reopen → History shows `Moved to <column>`. Drag between Backlog sections → same. Comment timestamps are client epoch millis in Firestore (Global Constraints). Cap: `activity` never exceeds 100 entries.

- [ ] **Step 5: Commit**

```bash
git add js/detail.js js/board.js js/backlog.js
git commit -m "feat: comments and activity history with drag move logging"
```

---

### Task 16: Link attachments

**Files:**
- Modify: `js/detail.js`

**Interfaces:**
- Consumes: `issue` + `save` closure, `detailMain` insertion point, `newId` (logic).
- Produces: `linksSection(issue, save): HTMLElement`.

- [ ] **Step 1: Add `linksSection` to `js/detail.js`**

Append at module level:

```js
function linksSection(issue, save) {
  const wrap = el('div', { class: 'detail-section' });
  const urlInput = el('input', { type: 'url', placeholder: 'https://…' });
  const titleInput = el('input', { placeholder: 'Title (optional)' });
  const addForm = el('form', {},
    el('div', { class: 'inline-two' }, urlInput, titleInput,
      el('button', { class: 'btn', type: 'submit' }, 'Add')));
  addForm.addEventListener('submit', e => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    let parsed;
    try { parsed = new URL(url); } catch { toast('Enter a valid URL (https://…)'); return; }
    if (!/^https?:$/.test(parsed.protocol)) { toast('Only http(s) links are allowed'); return; }
    issue.links = [...(issue.links || []), { id: newId(), url, title: titleInput.value.trim() }];
    save({ links: issue.links });
    urlInput.value = '';
    titleInput.value = '';
    paint();
  });
  function paint() {
    const links = issue.links || [];
    wrap.replaceChildren(
      el('h4', {}, 'Links'),
      links.map(l => el('div', { class: 'link-row' },
        '🔗',
        el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title || l.url),
        el('button', {
          class: 'icon-btn',
          onclick: () => {
            issue.links = issue.links.filter(x => x.id !== l.id);
            save({ links: issue.links });
            paint();
          },
        }, '×'))),
      addForm);
  }
  paint();
  return wrap;
}
```

In `openDetailModal`, replace the comment line `// Task 16 appends linksSection(issue, save) here.` with:

```js
    linksSection(issue, save),
```

- [ ] **Step 2: Verify in browser**

Open an issue → Links section between Subtasks and Activity. Add a URL with a title → renders as a clickable link opening in a new tab; add one without a title → the URL itself is the text. A malformed URL (`not a url`) and an `ftp://` URL are rejected with a toast. × removes a link. Refresh → links persist.

- [ ] **Step 3: Commit**

```bash
git add js/detail.js
git commit -m "feat: URL link attachments on issues"
```

---

### Task 17: Filter bar — search, type/epic/label, overdue (TDD)

**Files:**
- Modify: `js/logic.js` (add `matchesFilters`), `tests/logic.test.mjs`, `js/board.js` (filter bar + filtered rendering), `js/backlog.js` (handle `'none'` epic filter)
- Create: `js/filters.js`

**Interfaces:**
- Consumes: `state.filters` (Task 5 shape: `{text, type, epicId, label, overdue}`), `allLabels`, `TYPES`, `isOverdue`, `todayLocalISO` (logic).
- Produces:
  - `js/logic.js`: `matchesFilters(issue, f): boolean` where `f = {text?, type?, epicId?, label?, overdue?, today?, doneStatus?}`; `epicId: 'none'` means "issues with no epic"; `overdue` excludes issues whose `status === f.doneStatus`.
  - `js/filters.js`: `filterBar(onChange: () => void): HTMLElement[]` — controls that mutate `state.filters` and call `onChange`.
- **Board drag caveat while filtered:** reindexing visible cards only — same accepted semantics as the Task 11/13 caveats.

- [ ] **Step 1: Write the failing tests — append to `tests/logic.test.mjs`**

Add `matchesFilters` to the import list at the top, then append:

```js
const issue = {
  title: 'Fix login flow', description: 'OAuth redirect bug', key: 'HG-7',
  labels: ['auth', 'web'], type: 'bug', epicId: 'e1',
  dueDate: '2026-07-01', status: 'col-doing',
};

test('matchesFilters: empty filters match everything', () => {
  assert.equal(matchesFilters(issue, {}), true);
});

test('matchesFilters: text searches title/description/key/labels, case-insensitive', () => {
  assert.equal(matchesFilters(issue, { text: 'oauth' }), true);
  assert.equal(matchesFilters(issue, { text: 'hg-7' }), true);
  assert.equal(matchesFilters(issue, { text: 'AUTH' }), true);
  assert.equal(matchesFilters(issue, { text: 'payments' }), false);
});

test('matchesFilters: type/label/epic narrow correctly', () => {
  assert.equal(matchesFilters(issue, { type: 'bug' }), true);
  assert.equal(matchesFilters(issue, { type: 'task' }), false);
  assert.equal(matchesFilters(issue, { label: 'web' }), true);
  assert.equal(matchesFilters(issue, { label: 'infra' }), false);
  assert.equal(matchesFilters(issue, { epicId: 'e1' }), true);
  assert.equal(matchesFilters(issue, { epicId: 'e2' }), false);
});

test("matchesFilters: epicId 'none' matches only epic-less issues", () => {
  assert.equal(matchesFilters(issue, { epicId: 'none' }), false);
  assert.equal(matchesFilters({ ...issue, epicId: null }, { epicId: 'none' }), true);
});

test('matchesFilters: overdue respects today and done column', () => {
  const f = { overdue: true, today: '2026-07-15', doneStatus: 'col-done' };
  assert.equal(matchesFilters(issue, f), true);
  assert.equal(matchesFilters({ ...issue, dueDate: '2026-08-01' }, f), false);
  assert.equal(matchesFilters({ ...issue, status: 'col-done' }, f), false);
});

test('matchesFilters: filters combine with AND', () => {
  assert.equal(matchesFilters(issue, { text: 'login', type: 'bug', label: 'auth' }), true);
  assert.equal(matchesFilters(issue, { text: 'login', type: 'story' }), false);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/`
Expected: FAIL — `matchesFilters` is not exported.

- [ ] **Step 3: Implement `matchesFilters` in `js/logic.js`**

Append:

```js
export function matchesFilters(issue, f) {
  if (f.text) {
    const hay = [issue.title, issue.description, issue.key, ...(issue.labels || [])]
      .join(' ').toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  if (f.type && issue.type !== f.type) return false;
  if (f.epicId) {
    if (f.epicId === 'none') { if (issue.epicId) return false; }
    else if (issue.epicId !== f.epicId) return false;
  }
  if (f.label && !(issue.labels || []).includes(f.label)) return false;
  if (f.overdue) {
    if (issue.status === f.doneStatus) return false;
    if (!isOverdue(issue.dueDate, f.today)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all pass (`# fail 0`).

- [ ] **Step 5: Write `js/filters.js`**

```js
import { state, rerender } from './state.js';
import { el, selectEl } from './ui.js';
import { allLabels, TYPES } from './logic.js';

export function filterBar(onChange) {
  const f = state.filters;
  const search = el('input', {
    class: 'filter-search', type: 'search', placeholder: 'Search board', value: f.text,
  });
  search.addEventListener('input', () => { f.text = search.value; onChange(); });

  const dropdown = (options, current, apply) => {
    const sel = selectEl(options, current);
    sel.className = 'filter-select';
    sel.addEventListener('change', () => { apply(sel.value); onChange(); });
    return sel;
  };
  const typeSel = dropdown(
    [['', 'Type: All'], ...TYPES.map(([v, l]) => [v, `Type: ${l}`])],
    f.type, v => { f.type = v; });
  const epicSel = dropdown(
    [['', 'Epic: All'], ['none', 'Epic: None'],
     ...state.epics.map(e => [e.id, `Epic: ${e.name}`])],
    f.epicId, v => { f.epicId = v; });
  const labelSel = dropdown(
    [['', 'Label: All'], ...allLabels(state.issues).map(l => [l, `Label: ${l}`])],
    f.label, v => { f.label = v; });

  const overdueChip = el('button', {
    class: 'filter-chip' + (f.overdue ? ' active' : ''),
    onclick: () => {
      f.overdue = !f.overdue;
      overdueChip.classList.toggle('active', f.overdue);
      onChange();
    },
  }, 'Overdue');
  const clear = el('button', {
    class: 'filter-chip',
    onclick: () => {
      Object.assign(f, { text: '', type: '', epicId: '', label: '', overdue: false });
      rerender();
    },
  }, 'Clear filters');

  return [search, typeSel, epicSel, labelSel, overdueChip, clear];
}
```

- [ ] **Step 6: Apply filters on the board — modify `js/board.js`**

Extend the logic import: `import { isOverdue, formatDue, appendActivity, matchesFilters, todayLocalISO } from './logic.js';` and add `import { filterBar } from './filters.js';`.

Add a helper above `columnEl`:

```js
function visibleIssues(status) {
  const cols = columnsSorted();
  const f = {
    ...state.filters,
    today: todayLocalISO(),
    doneStatus: cols.length ? cols[cols.length - 1].id : '',
  };
  return issuesByStatus(status).filter(i => matchesFilters(i, f));
}
```

In `columnEl`, change the first line from `let issues = issuesByStatus(col.id);` to `let issues = visibleIssues(col.id);` (the `allInCol`/WIP line keeps using unfiltered `issuesByStatus`).

Restructure `renderBoard` so typing in the search box repaints only the columns (keeping input focus):

```js
export function renderBoard(view) {
  const body = el('div');
  const paintBody = () => body.replaceChildren(boardBody());
  view.replaceChildren(boardHeader(paintBody), body);
  paintBody();
}
```

And change `boardHeader` to accept and use `paintBody`:

```js
function boardHeader(paintBody) {
  const gb = el('button', {
    class: 'filter-chip' + (state.groupByEpic ? ' active' : ''),
    onclick: () => {
      state.groupByEpic = !state.groupByEpic;
      localStorage.setItem('pk-groupby', state.groupByEpic ? 'epic' : 'none');
      rerender();
    },
  }, `Group by: ${state.groupByEpic ? 'Epic' : 'None'}`);
  return el('div', { class: 'board-header' },
    el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`),
    el('div', { class: 'board-controls' },
      ...filterBar(paintBody),
      el('div', { class: 'spacer' }),
      gb));
}
```

- [ ] **Step 7: Handle the `'none'` epic filter in `js/backlog.js`**

Replace `filteredByEpic`:

```js
function filteredByEpic(issues) {
  if (!state.filters.epicId) return issues;
  if (state.filters.epicId === 'none') return issues.filter(i => !i.epicId);
  return issues.filter(i => i.epicId === state.filters.epicId);
}
```

- [ ] **Step 8: Verify in browser**

Board header shows search + Type/Epic/Label dropdowns + Overdue chip + Clear. Typing narrows cards live without losing input focus; matches on title, description, key (`HG-3`), and labels. Each dropdown narrows; combinations AND together. Overdue shows only past-due issues outside the rightmost column. Clear restores everything. Filters persist when toggling swimlanes. Column headers with a WIP limit keep showing the unfiltered count.

- [ ] **Step 9: Commit**

```bash
git add js/logic.js tests/logic.test.mjs js/filters.js js/board.js js/backlog.js
git commit -m "feat: JIRA-style filter bar with tested matchesFilters"
```

---

### Task 18: Column management — add/rename/reorder/delete + WIP limits

**Files:**
- Create: `js/columns.js`
- Modify: `js/board.js` (settings gear), `css/modal.css` (column-row styles)

**Interfaces:**
- Consumes: `updateProject`, `batchUpdateIssues` (store); `columnsSorted`, `issuesByStatus` (state); `newId` (logic); `openModal`, `confirmDialog`, `selectEl`, `toast` (ui).
- Produces: `openColumnSettings(): void`. Semantics: the dialog edits a **working copy**; nothing persists until Save. Deleting a column with issues prompts for a destination immediately (recorded as a pending move, applied on Save). Chained deletes resolve to the final surviving column.

- [ ] **Step 1: Append styles to `css/modal.css`**

```css
.column-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.column-row input:first-child{flex:1}
.column-row input[type=number]{width:90px}
.column-row-head{font-size:11px;color:var(--text-subtle);text-transform:uppercase}
.column-row-head span:first-child{flex:1}
.column-row-head span:nth-child(2){width:90px}
```

- [ ] **Step 2: Write `js/columns.js`**

```js
import { state, columnsSorted, issuesByStatus } from './state.js';
import { el, openModal, confirmDialog, selectEl, toast } from './ui.js';
import * as store from './store.js';
import { newId } from './logic.js';

export function openColumnSettings() {
  let cols = columnsSorted().map(c => ({ ...c }));
  const pendingMoves = []; // { fromId, toId }
  const listEl = el('div');

  function paint() {
    listEl.replaceChildren(...cols.map((c, idx) => {
      const name = el('input', { value: c.name });
      name.addEventListener('input', () => { c.name = name.value; });
      const wip = el('input', {
        type: 'number', min: '1', value: c.wipLimit ?? '', placeholder: 'No limit',
      });
      wip.addEventListener('input', () => {
        c.wipLimit = wip.value === '' ? null : Number(wip.value);
      });
      return el('div', { class: 'column-row' },
        name, wip,
        el('button', {
          class: 'icon-btn', disabled: idx === 0,
          onclick: () => { [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]]; paint(); },
        }, '↑'),
        el('button', {
          class: 'icon-btn', disabled: idx === cols.length - 1,
          onclick: () => { [cols[idx + 1], cols[idx]] = [cols[idx], cols[idx + 1]]; paint(); },
        }, '↓'),
        el('button', { class: 'icon-btn', onclick: () => removeColumn(idx) }, '🗑'));
    }));
  }

  async function removeColumn(idx) {
    if (cols.length === 1) { toast('A board needs at least one column'); return; }
    const col = cols[idx];
    const count = issuesByStatus(col.id).length;
    if (count > 0) {
      const others = cols.filter(c => c.id !== col.id);
      const dest = await destinationDialog(col, others, count);
      if (!dest) return;
      pendingMoves.push({ fromId: col.id, toId: dest });
    } else {
      const ok = await confirmDialog({
        title: `Delete column "${col.name}"?`,
        message: 'The column is empty. This takes effect when you press Save.',
      });
      if (!ok) return;
    }
    cols.splice(idx, 1);
    paint();
  }

  async function saveAll() {
    if (cols.some(c => !c.name.trim())) { toast('Column names cannot be empty'); return; }
    const finalCols = cols.map((c, i) => ({
      id: c.id, name: c.name.trim(), wipLimit: c.wipLimit ?? null, order: i,
    }));
    const resolve = id => {
      let cur = id, guard = 0;
      while (guard++ < 20) {
        const m = pendingMoves.find(x => x.fromId === cur);
        if (!m) return cur;
        cur = m.toId;
      }
      return cur;
    };
    const updates = [];
    for (const { fromId } of pendingMoves) {
      const dest = resolve(fromId);
      const base = issuesByStatus(dest).length + updates.filter(u => u.status === dest).length;
      issuesByStatus(fromId).forEach((iss, i) =>
        updates.push({ id: iss.id, status: dest, order: base + i }));
    }
    try {
      if (updates.length) await store.batchUpdateIssues(updates);
      await store.updateProject({ columns: finalCols });
      overlay.remove();
      toast('Board columns updated');
    } catch (e) { toast('Save failed: ' + e.message); }
  }

  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Board settings — columns'),
    el('div', { class: 'column-row column-row-head' },
      el('span', {}, 'Name'), el('span', {}, 'WIP limit'), el('span', {})),
    listEl,
    el('button', {
      class: 'col-add',
      onclick: () => { cols.push({ id: newId(), name: 'New column', wipLimit: null, order: cols.length }); paint(); },
    }, '+ Add column'),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: saveAll }, 'Save'))));
  paint();
}

function destinationDialog(col, others, count) {
  return new Promise(resolve => {
    const sel = selectEl(others.map(c => [c.id, c.name]), others[0].id);
    const done = v => { overlay.remove(); resolve(v); };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, `Delete column "${col.name}"?`),
      el('p', {}, `${count} issue(s) in it need a new home. Applied when you press Save.`),
      el('div', { class: 'field' }, el('label', {}, 'Move issues to'), sel),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onclick: () => done(sel.value) }, 'Delete and move'))),
      { dismissable: false });
  });
}
```

- [ ] **Step 3: Add the settings gear to `js/board.js`**

Add `import { openColumnSettings } from './columns.js';` and, in `boardHeader`, insert a gear button after `gb`:

```js
      gb,
      el('button', { class: 'icon-btn', title: 'Board settings', onclick: openColumnSettings }, '⚙')
```

- [ ] **Step 4: Verify in browser**

⚙ opens Board settings listing current columns. Rename one → Save → header updates, issues stay put (ids stable). Add "Review" and move it with ↑ between In Progress and Done → Save → board order matches; done semantics (strikethrough) now apply only to the rightmost column. Set WIP limit 1 on In Progress with 2 issues → Save → header shows `2/1` highlighted red; dragging one out clears it. Delete a column containing issues → destination prompt → Save → issues appear at the bottom of the destination; deleted column gone. Cancel discards everything including pending deletes. Backlog page's top section follows the new first column. Empty-column delete asks a plain confirm.

- [ ] **Step 5: Commit**

```bash
git add js/columns.js js/board.js css/modal.css
git commit -m "feat: column management with WIP limits and safe delete-with-move"
```

---

### Task 19: Full verification pass + deploy

**Files:** fixes only where verification fails.

- [ ] **Step 1: Run the unit tests**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 2: Push and confirm live deploy**

```bash
git push origin main
sleep 60 && curl -sI https://harrycpc.github.io/personal-kanban/ | head -1
```

Expected: `HTTP/2 200`; hard-refresh the live site and confirm the newest features render.

- [ ] **Step 3: Execute the spec's verification checklist (on the live site)**

Work through spec section "Verification (manual, browser-driven)" items 1–11 in order. Notes:

1. Sign out/in — data persists; onboarding does not reappear.
2. **Requires a second Google account** — it gets its own onboarding + empty board; confirm in the Firebase console that two `users/{uid}` trees exist and neither client ever shows the other's data.
3. Create issues of each type from both paths — keys increment; delete one, create another → the deleted key is not reused.
4. Drag within/across columns + second-session live sync both ways.
5. Backlog reorder + promote/demote between sections.
6. Epic create/assign/swimlane/filter/delete (issues survive, unassigned).
7. Detail modal: every field, subtasks progress, comments, history (including drag moves), links.
8. Column add/rename/reorder; WIP exceed highlight; delete-with-destination.
9. Overdue chip red off the done column, suppressed + strikethrough in it.
10. All filters, singly and combined; Clear restores.
11. DevTools offline: badge shows; edit an existing issue offline → reconnect → it syncs (note: *creating* issues offline fails by design — transactions need connectivity — and surfaces a toast).

- [ ] **Step 4: Fidelity pass against real JIRA**

Compare side-by-side with a Jira Cloud kanban screenshot and adjust CSS only (no behavior changes): column background `#F4F5F7` with white cards and the layered Atlassian shadow; 12px uppercase column headers with counts; card padding ≈10px, radius 3px; blue `#0052CC` primary buttons; type icons 16px squares (blue check / green bookmark / red dot); priority arrows colored correctly per level; epic pills bold 11px white-on-color; sidebar active item blue-tinted. Fix discrepancies in the relevant `css/*.css`.

- [ ] **Step 5: Record verification results and commit any fixes**

```bash
git add -A
git commit -m "fix: verification pass adjustments"   # only if there were changes
git push origin main
```

Report each checklist item's outcome honestly — any item that cannot be completed (e.g. no second Google account available) is flagged to the user, not marked done.

---

## Plan complete

Execution starts at Task 1. Tasks 3 and 10 contain USER GATES (Firebase console, GitHub Pages domain authorization) — pause and ask Harry when reaching them.
