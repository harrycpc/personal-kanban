# Multi-Board Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the personal-kanban app hold multiple fully-isolated Jira-style boards, switchable from the sidebar, and use it to split the existing board into "Harry's Kanban" (unchanged) plus a new "Career Investment" board holding the migrated DevOps/career content.

**Architecture:** Move `columns[]`/`keyPrefix`/`issueCounter` off the `users/{uid}` doc and onto a new `users/{uid}/boards/{boardId}` doc; `issues`/`epics` become subcollections of that board doc instead of the user doc. The app subscribes to the boards list once per session and to the active board's doc/issues/epics on switch (unsubscribe/resubscribe). A one-time admin script performs the data migration directly against Firestore; the app code changes are independent of it and get verified against the migrated data before shipping.

**Tech Stack:** Vanilla ES modules (no build step), Firebase Auth + Firestore (modular SDK v10.12.2 via CDN), SortableJS, Node's built-in `node:test` runner. Admin-side: `firebase-admin` in `~/.personal-kanban-admin/` (outside the git repo).

## Global Constraints

- No build step; vanilla ES modules only, no new npm dependencies added to the app repo (`~/Documents/personal-kanban`).
- The admin CLI and migration scripts live outside the git repo at `~/.personal-kanban-admin/` — never move credentials or these scripts into the tracked repo.
- Firestore `serverTimestamp()` is forbidden inside array elements — `columns[]` entries must stay plain objects with no timestamp fields.
- `tests/logic.test.mjs` must keep passing unchanged; this plan makes no changes to `js/logic.js`.
- No in-app "move issue to another board" feature and no board-deletion UI — explicitly out of scope per the approved design.
- Every board doc keeps the exact same `columns[]` / `keyPrefix` / `issueCounter` shape the app already uses today — just relocated from the user doc onto each board doc.
- The final cleanup task (deleting the old flat data) is destructive and irreversible — it requires explicit user confirmation before running with `--apply`. Do not run it unattended.
- `git push` to `main` deploys live to GitHub Pages immediately (no staging). Only push once the full app-code change set has been verified locally.

---

### Task 1: Write the board migration script (dry-run only, no writes yet)

**Files:**
- Create: `~/.personal-kanban-admin/seeds/2026-07-25-migrate-to-boards.mjs`

**Interfaces:**
- Consumes: `~/.personal-kanban-admin/service-account.json`, `~/.personal-kanban-admin/uid.txt` (existing admin credentials).
- Produces: (dry-run) a printed migration plan only. No Firestore writes in this task.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// ONE-TIME migration: wrap the existing flat users/{uid} data into
// users/{uid}/boards/{id}, and split out the 6 career/technical epics
// (+ their issues) into a new "Career Investment" board, re-keyed CI-1..CI-33.
//
// Non-destructive: only CREATES new documents under users/{uid}/boards/*.
// Does NOT touch or delete the old users/{uid} doc or its issues/epics
// subcollections — that happens later, deliberately, via cleanup-old-shape.mjs
// after the migrated data has been verified in the live app.
//
// Usage:
//   node seeds/2026-07-25-migrate-to-boards.mjs            # dry run, prints the plan
//   node seeds/2026-07-25-migrate-to-boards.mjs --apply    # performs the writes

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const serviceAccount = JSON.parse(readFileSync(join(root, 'service-account.json'), 'utf8'));
const uid = readFileSync(join(root, 'uid.txt'), 'utf8').trim();

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const CAREER_EPIC_IDS = new Set([
  '0poGsgoFxVeEspqOieQa', // Sharpen Interview & System Design Skills
  '8oUxKAnzuLin3lsupHiY', // Build DevOps Portfolio Project
  '93zSWRlHnsf5zum3WhTe', // Pass RHCSA RHEL 10 Exam
  'JwIAVtB30MK7jVXXfCvL', // AWS & Cloud Certifications
  'W5EBr9MCQUuhbFtHZMmM', // Network & Build DevOps Presence
  'WntAimKhFXkQrTLzHXc2', // Apply for DevOps Roles
]);

async function main() {
  const apply = process.argv.includes('--apply');

  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data();
  const issuesSnap = await db.collection(`users/${uid}/issues`).get();
  const epicsSnap = await db.collection(`users/${uid}/epics`).get();
  const allIssues = issuesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allEpics = epicsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const careerEpics = allEpics.filter(e => CAREER_EPIC_IDS.has(e.id));
  const lifeEpics = allEpics.filter(e => !CAREER_EPIC_IDS.has(e.id));
  const careerIssues = allIssues.filter(i => CAREER_EPIC_IDS.has(i.epicId));
  const lifeIssues = allIssues.filter(i => !CAREER_EPIC_IDS.has(i.epicId));

  if (careerEpics.length !== CAREER_EPIC_IDS.size) {
    throw new Error(`Expected ${CAREER_EPIC_IDS.size} career epics, found ${careerEpics.length}. Aborting — check CAREER_EPIC_IDS against current data.`);
  }

  // --- Board 1: existing board, unchanged, just wrapped ---
  const board1Id = newId();
  const board1 = {
    name: user.projectName,
    keyPrefix: user.keyPrefix,
    issueCounter: user.issueCounter,
    columns: user.columns,
    order: 0,
    createdAt: FieldValue.serverTimestamp(),
  };

  // --- Board 2: Career Investment, fresh columns ---
  const board2Id = newId();
  const board2Columns = ['To Do', 'In Progress', 'Done'].map((name, i) => ({
    id: newId(), name, wipLimit: null, order: i,
  }));
  const newColsByOldId = {};
  for (const c of user.columns) {
    const match = board2Columns.find(nc => nc.name === c.name);
    if (match) newColsByOldId[c.id] = match.id;
  }
  // 'backlog' is a virtual status (not one of the board's real columns —
  // see js/state.js issuesByStatus('backlog')) and passes through unchanged.
  const missingCol = careerIssues.find(i => i.status !== 'backlog' && !newColsByOldId[i.status]);
  if (missingCol) {
    throw new Error(`Career issue ${missingCol.key} is in a column ("${missingCol.status}") with no name match on the new board's default columns (To Do/In Progress/Done). Resolve manually before migrating.`);
  }

  // Sort career issues by numeric key so CI-1..CI-33 preserves HK-N order.
  const sortedCareerIssues = [...careerIssues].sort(
    (a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]));

  const oldEpicIdToNew = {};
  for (const e of careerEpics) oldEpicIdToNew[e.id] = newId();

  const oldIssueIdToNew = {};
  for (const i of sortedCareerIssues) oldIssueIdToNew[i.id] = newId();

  const board2Issues = sortedCareerIssues.map((issue, idx) => {
    const { id: _oldId, key: _oldKey, ...rest } = issue;
    return {
      newId: oldIssueIdToNew[issue.id],
      key: `CI-${idx + 1}`,
      data: {
        ...rest,
        status: issue.status === 'backlog' ? 'backlog' : newColsByOldId[issue.status],
        epicId: oldEpicIdToNew[issue.epicId],
        blockedBy: (issue.blockedBy || [])
          .filter(bid => oldIssueIdToNew[bid])
          .map(bid => oldIssueIdToNew[bid]),
      },
    };
  });

  const board2Epics = careerEpics.map(e => {
    const { id: _oldId, ...rest } = e;
    return { newId: oldEpicIdToNew[e.id], data: rest };
  });

  console.log(`Board 1 "${board1.name}" (${board1.keyPrefix}): ${lifeEpics.length} epics, ${lifeIssues.length} issues (unchanged, same ids/keys).`);
  console.log(`Board 2 "Career Investment" (CI): ${board2Epics.length} epics, ${board2Issues.length} issues.`);
  console.log('Issue re-key mapping:');
  board2Issues.forEach((b, idx) => console.log(`  ${sortedCareerIssues[idx].key} -> ${b.key}  ${sortedCareerIssues[idx].title}`));

  if (!apply) {
    console.log('\nDry run only — no writes made. Re-run with --apply to perform the migration.');
    return;
  }

  const batch = db.batch();
  batch.set(db.doc(`users/${uid}/boards/${board1Id}`), board1);
  for (const e of lifeEpics) {
    const { id, ...rest } = e;
    batch.set(db.doc(`users/${uid}/boards/${board1Id}/epics/${id}`), rest);
  }
  for (const i of lifeIssues) {
    const { id, ...rest } = i;
    batch.set(db.doc(`users/${uid}/boards/${board1Id}/issues/${id}`), rest);
  }

  batch.set(db.doc(`users/${uid}/boards/${board2Id}`), {
    name: 'Career Investment', keyPrefix: 'CI', issueCounter: board2Issues.length,
    columns: board2Columns, order: 1, createdAt: FieldValue.serverTimestamp(),
  });
  for (const e of board2Epics) {
    batch.set(db.doc(`users/${uid}/boards/${board2Id}/epics/${e.newId}`), e.data);
  }
  for (const i of board2Issues) {
    batch.set(db.doc(`users/${uid}/boards/${board2Id}/issues/${i.newId}`), { ...i.data, key: i.key });
  }

  await batch.commit();
  console.log(`\nApplied. Board 1 id: ${board1Id}, Board 2 id: ${board2Id}`);
  console.log('Old users/{uid} doc and its issues/epics subcollections are untouched — run cleanup-old-shape.mjs only after verifying the app.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the dry run**

Run: `cd ~/.personal-kanban-admin && node seeds/2026-07-25-migrate-to-boards.mjs`

Expected: prints `Board 1 "Harry's Kanban" (HK): 5 epics, 23 issues (unchanged, same ids/keys).`, `Board 2 "Career Investment" (CI): 6 epics, 33 issues.`, a 33-row `HK-N -> CI-M` mapping, and ends with `Dry run only — no writes made.` (5+6=11 total epics, 23+33=56 total issues — matches the current `issueCounter: 56` and 11-epic count read earlier). If the counts don't match, stop and investigate before proceeding — do not add `--apply` yet.

No commit — this file lives in `~/.personal-kanban-admin/`, outside the git repo.

---

### Task 2: Apply the migration and verify

**Files:**
- Modify (data only, no file changes): Firestore `users/{uid}/boards/*`

**Interfaces:**
- Consumes: the script from Task 1.
- Produces: two new board documents in Firestore (`boards/{id1}` = existing board, `boards/{id2}` = Career Investment) with their `issues`/`epics` subcollections populated. The old `users/{uid}` doc and its `issues`/`epics` subcollections are left untouched.

- [ ] **Step 1: Apply**

Run: `cd ~/.personal-kanban-admin && node seeds/2026-07-25-migrate-to-boards.mjs --apply`

Expected: same summary as the dry run, followed by `Applied. Board 1 id: <id>, Board 2 id: <id>`.

- [ ] **Step 2: Verify with a direct Firestore read**

Run (replace `<uid>` from `uid.txt`, `<boardId>` from the script's printed ids):

```bash
cd ~/.personal-kanban-admin && node -e "
const admin = require('firebase-admin');
const { readFileSync } = require('fs');
const sa = JSON.parse(readFileSync('service-account.json','utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const uid = readFileSync('uid.txt','utf8').trim();
(async () => {
  const boards = await admin.firestore().collection(\`users/\${uid}/boards\`).get();
  for (const b of boards.docs) {
    const issues = await b.ref.collection('issues').get();
    const epics = await b.ref.collection('epics').get();
    console.log(b.id, b.data().name, b.data().keyPrefix, 'issues:', issues.size, 'epics:', epics.size);
  }
})();
"
```

Expected: two rows — the existing board name with `HK`, 23 issues, 5 epics; `Career Investment` with `CI`, 33 issues, 6 epics.

No commit — data-only change, no file to commit.

---

### Task 3: Make the admin CLI board-aware

**Files:**
- Modify: `~/.personal-kanban-admin/cli.mjs`

**Interfaces:**
- Consumes: `~/.personal-kanban-admin/active-board.txt` (new, created by `use-board`).
- Produces: `list-boards`, `use-board <boardId>` commands; existing `list`/`create-epic`/`create-issue`/`update-issue`/`update-epic` now operate on the board selected via `use-board`.

- [ ] **Step 1: Rewrite the file**

```js
#!/usr/bin/env node
// Local-only admin CLI for Harry's personal-kanban Firestore data.
// Mirrors the write shapes in ~/Documents/personal-kanban/js/store.js exactly
// so anything created here renders correctly in the app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'service-account.json'), 'utf8'));
const uid = readFileSync(join(__dirname, 'uid.txt'), 'utf8').trim();
const activeBoardPath = join(__dirname, 'active-board.txt');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const boardsCol = () => db.collection(`users/${uid}/boards`);
const boardRef = id => db.doc(`users/${uid}/boards/${id}`);

function activeBoardId() {
  if (!existsSync(activeBoardPath)) {
    throw new Error('No active board set. Run: node cli.mjs use-board <boardId>  (see `node cli.mjs list-boards`)');
  }
  return readFileSync(activeBoardPath, 'utf8').trim();
}

const issuesCol = () => db.collection(`users/${uid}/boards/${activeBoardId()}/issues`);
const issueRef = id => db.doc(`users/${uid}/boards/${activeBoardId()}/issues/${id}`);
const epicsCol = () => db.collection(`users/${uid}/boards/${activeBoardId()}/epics`);
const epicRef = id => db.doc(`users/${uid}/boards/${activeBoardId()}/epics/${id}`);

async function loadBoards() {
  const snap = await boardsCol().get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
}

async function loadState() {
  const boardId = activeBoardId();
  const [boardSnap, issuesSnap, epicsSnap] = await Promise.all([
    boardRef(boardId).get(), issuesCol().get(), epicsCol().get(),
  ]);
  const board = boardSnap.exists ? boardSnap.data() : null;
  const issues = issuesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const epics = epicsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { board, issues, epics };
}

function printState({ board, issues, epics }) {
  if (!board) { console.log(JSON.stringify({ error: 'No board doc found for the active board id.' }, null, 2)); return; }
  const columns = [...(board.columns || [])].sort((a, b) => a.order - b.order);
  const summary = {
    board: { name: board.name, keyPrefix: board.keyPrefix, issueCounter: board.issueCounter },
    columns: columns.map(c => ({ id: c.id, name: c.name, wipLimit: c.wipLimit, order: c.order })),
    epics: epics.map(e => ({ id: e.id, name: e.name, color: e.color })),
    issues: issues
      .sort((a, b) => (a.status === b.status ? a.order - b.order : String(a.status).localeCompare(String(b.status))))
      .map(i => ({
        id: i.id, key: i.key, title: i.title, type: i.type, status: i.status,
        priority: i.priority, storyPoints: i.storyPoints, epicId: i.epicId,
        labels: i.labels, dueDate: i.dueDate,
        subtasks: (i.subtasks || []).map(s => `${s.done ? '[x]' : '[ ]'} ${s.text}`),
      })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function createEpic(data) {
  const ref = epicsCol().doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return ref.id;
}

async function updateEpic(id, fields) {
  await epicRef(id).update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

async function createIssue(data) {
  const boardId = activeBoardId();
  const ref = issuesCol().doc();
  let key;
  await db.runTransaction(async tx => {
    const snap = await tx.get(boardRef(boardId));
    const b = snap.data();
    const n = (b.issueCounter || 0) + 1;
    key = `${b.keyPrefix}-${n}`;
    tx.update(boardRef(boardId), { issueCounter: n });
    tx.set(ref, {
      subtasks: [], comments: [], links: [], activity: [],
      ...data, key,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: ref.id, key };
}

async function updateIssue(id, fields) {
  await issueRef(id).update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

async function nextOrder(status) {
  const snap = await issuesCol().where('status', '==', status).get();
  return snap.size;
}

function usage() {
  console.log(`Usage:
  node cli.mjs list-boards
  node cli.mjs use-board <boardId>               # selects the board all other commands operate on
  node cli.mjs list
  node cli.mjs create-epic <payload.json>       # {"name":"...", "color":"#RRGGBB"}
  node cli.mjs create-issue <payload.json>       # see js/store.js issue shape; status/order auto-defaulted if omitted
  node cli.mjs update-issue <issueId> <payload.json>
  node cli.mjs update-epic <epicId> <payload.json>
`);
}

async function main() {
  const [cmd, a1, a2] = process.argv.slice(2);
  if (cmd === 'list-boards') {
    const boards = await loadBoards();
    console.log(JSON.stringify(boards.map(b => ({ id: b.id, name: b.name, keyPrefix: b.keyPrefix, order: b.order })), null, 2));
    return;
  }
  if (cmd === 'use-board') {
    if (!a1) { usage(); process.exitCode = 1; return; }
    const snap = await boardRef(a1).get();
    if (!snap.exists) { console.error(`No board found with id ${a1}. Run: node cli.mjs list-boards`); process.exitCode = 1; return; }
    writeFileSync(activeBoardPath, a1);
    console.log(JSON.stringify({ activeBoard: a1, name: snap.data().name }));
    return;
  }
  if (cmd === 'list') {
    printState(await loadState());
    return;
  }
  if (cmd === 'create-epic') {
    const data = JSON.parse(readFileSync(a1, 'utf8'));
    const id = await createEpic(data);
    console.log(JSON.stringify({ created: 'epic', id }));
    return;
  }
  if (cmd === 'create-issue') {
    const data = JSON.parse(readFileSync(a1, 'utf8'));
    if (data.order === undefined) data.order = await nextOrder(data.status);
    const result = await createIssue(data);
    console.log(JSON.stringify({ created: 'issue', ...result }));
    return;
  }
  if (cmd === 'update-issue') {
    const fields = JSON.parse(readFileSync(a2, 'utf8'));
    await updateIssue(a1, fields);
    console.log(JSON.stringify({ updated: 'issue', id: a1 }));
    return;
  }
  if (cmd === 'update-epic') {
    const fields = JSON.parse(readFileSync(a2, 'utf8'));
    await updateEpic(a1, fields);
    console.log(JSON.stringify({ updated: 'epic', id: a1 }));
    return;
  }
  usage();
  process.exitCode = 1;
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Verify against the migrated boards**

Run: `cd ~/.personal-kanban-admin && node cli.mjs list-boards`
Expected: two entries, the existing board (`order: 0`) and `Career Investment` (`order: 1`).

Run: `node cli.mjs use-board <career-investment-board-id>` then `node cli.mjs list`
Expected: `board.keyPrefix` is `CI`, `board.issueCounter` is `33`, and the issues list shows keys `CI-1`…`CI-33`.

No commit — this file lives in `~/.personal-kanban-admin/`, outside the git repo.

---

### Task 4: Board-scoped app state (`js/state.js`)

**Files:**
- Modify: `js/state.js` (full rewrite, 37 → ~40 lines)

**Interfaces:**
- Produces: `state.boards` (raw list), `state.activeBoardId`, `state.board` (active board doc), `boardsSorted()`, `columnsSorted()` (now reads `state.board.columns`), `isDoneStatus(status)`, `issuesByStatus(status)`, `findEpic(id)`, `statusName(status)`. Removes `state.userDoc`.
- Consumes: nothing new.

- [ ] **Step 1: Rewrite the file**

```js
export const state = {
  user: null,
  boards: [],
  activeBoardId: null,
  board: null,
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

export function boardsSorted() {
  return [...state.boards].sort((a, b) => a.order - b.order);
}

export function columnsSorted() {
  return [...(state.board?.columns || [])].sort((a, b) => a.order - b.order);
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

- [ ] **Step 2: Syntax check**

Run: `node --check js/state.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/personal-kanban
git add js/state.js
git commit -m "refactor: board-scoped app state (state.board replaces state.userDoc)"
```

(Note: the app won't run correctly until Tasks 5–9 also land — this is an in-progress commit, not a shippable point. Nothing gets pushed until Task 12.)

---

### Task 5: Board-scoped Firestore access (`js/store.js`)

**Files:**
- Modify: `js/store.js` (full rewrite, 100 → ~85 lines)

**Interfaces:**
- Consumes: `newId` from `js/logic.js` (unchanged).
- Produces: `initStore(uid)`, `setActiveBoard(boardId)`, `subscribeBoards(cb)`, `subscribeBoard(id, cb)`, `createBoard(name, keyPrefix) → Promise<boardId>`, `updateBoard(id, fields)`, `subscribeIssues(cb)`, `subscribeEpics(cb)`, `createIssue(data)`, `updateIssue(id, fields)`, `deleteIssue(id)`, `batchUpdateIssues(updates)`, `createEpic(data)`, `updateEpic(id, fields)`, `deleteEpic(id, issueIdsToUnassign)`. Removes `createUserDoc`, `getUserDoc`, `updateProject`, `subscribeUser` (no longer needed — `users/{uid}` no longer holds project fields, and board existence is checked via `subscribeBoards` instead).

- [ ] **Step 1: Rewrite the file**

```js
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { newId } from './logic.js';

let uid = null;
let boardId = null;
export function initStore(userId) { uid = userId; }
export function setActiveBoard(id) { boardId = id; }

const boardsCol = () => collection(db, 'users', uid, 'boards');
const boardRef = id => doc(db, 'users', uid, 'boards', id);
const issuesCol = () => collection(db, 'users', uid, 'boards', boardId, 'issues');
const issueRef = id => doc(db, 'users', uid, 'boards', boardId, 'issues', id);
const epicsCol = () => collection(db, 'users', uid, 'boards', boardId, 'epics');
const epicRef = id => doc(db, 'users', uid, 'boards', boardId, 'epics', id);

export function subscribeBoards(cb) {
  return onSnapshot(boardsCol(), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function subscribeBoard(id, cb) {
  return onSnapshot(boardRef(id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null));
}

export async function createBoard(name, keyPrefix) {
  const existing = await getDocs(boardsCol());
  const ref = doc(boardsCol());
  await setDoc(ref, {
    name,
    keyPrefix,
    issueCounter: 0,
    columns: ['To Do', 'In Progress', 'Done'].map((n, i) => ({
      id: newId(), name: n, wipLimit: null, order: i,
    })),
    order: existing.size,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBoard(id, fields) {
  await updateDoc(boardRef(id), fields);
}

export function subscribeIssues(cb) {
  return onSnapshot(issuesCol(), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function subscribeEpics(cb) {
  return onSnapshot(epicsCol(), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createIssue(data) {
  const ref = doc(issuesCol());
  let key;
  await runTransaction(db, async tx => {
    const snap = await tx.get(boardRef(boardId));
    const b = snap.data();
    const n = (b.issueCounter || 0) + 1;
    key = `${b.keyPrefix}-${n}`;
    tx.update(boardRef(boardId), { issueCounter: n });
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

- [ ] **Step 2: Syntax check**

Run: `node --check js/store.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add js/store.js
git commit -m "refactor: board-scoped Firestore access in store.js"
```

---

### Task 6: Board switcher UI module + simplify auth.js

**Files:**
- Create: `js/boards.js`
- Modify: `js/auth.js` (remove `onboardingDialog`, drop the now-unused `suggestKeyPrefix` import)

**Interfaces:**
- Consumes: `state`, `boardsSorted` from `js/state.js` (Task 4); `el`, `openModal`, `toast` from `js/ui.js`; `store.createBoard` from `js/store.js` (Task 5); `suggestKeyPrefix` from `js/logic.js`.
- Produces: `boardDetailsDialog({title, submitLabel, defaultName}) → Promise<{name, keyPrefix}>`, `renderBoardSwitcher(onSwitch: (boardId: string) => void) → HTMLElement`. Both consumed by `js/main.js` in Task 8.

- [ ] **Step 1: Create `js/boards.js`**

```js
import { state, boardsSorted } from './state.js';
import { el, openModal, toast } from './ui.js';
import * as store from './store.js';
import { suggestKeyPrefix } from './logic.js';

export function boardDetailsDialog({ title, submitLabel, defaultName = 'My Board' }) {
  return new Promise(resolve => {
    let prefixTouched = false;
    const name = el('input', { value: defaultName });
    const prefix = el('input', { value: suggestKeyPrefix(defaultName), maxlength: '5' });
    const errEl = el('p', { class: 'form-error', hidden: true });
    prefix.addEventListener('input', () => { prefixTouched = true; prefix.value = prefix.value.toUpperCase(); });
    name.addEventListener('input', () => { if (!prefixTouched) prefix.value = suggestKeyPrefix(name.value); });
    const submit = () => {
      const n = name.value.trim() || defaultName;
      const p = prefix.value.trim();
      if (!/^[A-Z][A-Z0-9]{0,4}$/.test(p)) {
        errEl.textContent = 'Key must be 1–5 characters, start with a letter, A–Z / 0–9 only.';
        errEl.hidden = false;
        return;
      }
      overlay.remove();
      resolve({ name: n, keyPrefix: p });
    };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, title),
      el('div', { class: 'field' }, el('label', {}, 'Board name'), name),
      el('div', { class: 'field' },
        el('label', {}, 'Key — used for issue IDs like HG-1. Permanent.'), prefix),
      errEl,
      el('div', { class: 'actions' },
        el('button', { class: 'btn btn-primary', onclick: submit }, submitLabel)),
    ), { dismissable: false });
  });
}

async function createBoardFlow(onCreated) {
  const { name, keyPrefix } = await boardDetailsDialog({
    title: 'Create board', submitLabel: 'Create board', defaultName: 'New board',
  });
  try {
    const id = await store.createBoard(name, keyPrefix);
    onCreated(id);
  } catch (e) { toast('Could not create board: ' + e.message); }
}

export function renderBoardSwitcher(onSwitch) {
  return el('div', { class: 'board-list' },
    el('h3', {}, 'Boards'),
    boardsSorted().map(b => {
      const active = b.id === state.activeBoardId;
      const row = el('div', { class: 'board-item' + (active ? ' active' : '') },
        el('span', { class: 'board-item-icon' }, b.keyPrefix[0]),
        b.name);
      row.addEventListener('click', () => { if (!active) onSwitch(b.id); });
      return row;
    }),
    el('button', { class: 'col-add', onclick: () => createBoardFlow(onSwitch) }, '+ Create board'));
}
```

- [ ] **Step 2: Simplify `js/auth.js`**

Replace the full file contents with:

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

- [ ] **Step 3: Syntax check**

Run: `node --check js/boards.js && node --check js/auth.js`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add js/boards.js js/auth.js
git commit -m "feat: board switcher UI module, move board-naming dialog out of auth.js"
```

---

### Task 7: Sidebar markup + styles for the board switcher

**Files:**
- Modify: `index.html:42-52` (sidebar nav block)
- Modify: `css/chrome.css` (append new rules)

**Interfaces:**
- Consumes: `#board-switcher` container populated by `js/main.js` (Task 8) calling `renderBoardSwitcher()` from Task 6.
- Produces: `.board-list`, `.board-item`, `.board-item.active`, `.board-item-icon` CSS classes.

- [ ] **Step 1: Add the switcher container to `index.html`**

In `index.html`, insert a new `<div id="board-switcher"></div>` between the `.project` block and the first `.nav-item` link:

```html
      <nav id="sidebar">
        <div class="project">
          <div class="project-icon" id="project-icon"></div>
          <div>
            <div class="project-name" id="project-name"></div>
            <div class="project-sub">Kanban project</div>
          </div>
        </div>
        <div id="board-switcher"></div>
        <a href="#/board" class="nav-item" data-route="board"><span class="nav-icon">▦</span> Board</a>
        <a href="#/backlog" class="nav-item" data-route="backlog"><span class="nav-icon">☰</span> Backlog</a>
      </nav>
```

- [ ] **Step 2: Add styles to `css/chrome.css`**

Append to the end of `css/chrome.css`:

```css
.board-list{margin-bottom:16px}
.board-list h3{font-size:11px;text-transform:uppercase;color:var(--text-faint);padding:0 8px;margin-bottom:6px}
.board-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--radius);cursor:pointer;font-size:13px}
.board-item:hover{background:#EBECF0}
.board-item.active{background:var(--blue-light);color:var(--blue);font-weight:500}
.board-item-icon{width:20px;height:20px;border-radius:4px;background:var(--text-faint);color:#fff;font-size:11px;font-weight:700;
  display:flex;align-items:center;justify-content:center;flex-shrink:0}
```

(The "+ Create board" button reuses the existing global `.col-add` class from `css/board.css` — no new style needed for it.)

- [ ] **Step 3: Commit**

```bash
git add index.html css/chrome.css
git commit -m "feat: sidebar board-switcher markup and styles"
```

---

### Task 8: Board subscription/switching orchestration (`js/main.js`)

**Files:**
- Modify: `js/main.js` (full rewrite, 111 → ~100 lines)

**Interfaces:**
- Consumes: `renderBoardSwitcher`, `boardDetailsDialog` from `js/boards.js` (Task 6); `subscribeBoards`, `subscribeBoard`, `subscribeIssues`, `subscribeEpics`, `setActiveBoard`, `createBoard`, `updateBoard`, `initStore` from `js/store.js` (Task 5); `state`, `setRenderer`, `rerender` from `js/state.js` (Task 4); `#board-switcher` element from `index.html` (Task 7).
- Produces: `switchBoard(boardId)` (module-private, wired into the switcher's `onSwitch` callback).

- [ ] **Step 1: Rewrite the file**

```js
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initSignin, wireSignout } from './auth.js';
import * as store from './store.js';
import { state, setRenderer, rerender } from './state.js';
import { el, openModal, toast } from './ui.js';
import { renderBoard } from './board.js';
import { openCreateModal } from './detail.js';
import { renderBacklog } from './backlog.js';
import { renderBoardSwitcher, boardDetailsDialog } from './boards.js';

const signinEl = document.getElementById('signin');
const appEl = document.getElementById('app');
let unsubs = [];
let boardUnsubs = [];

initSignin();
wireSignout();

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

document.getElementById('btn-create').addEventListener('click', () => openCreateModal());

const offlineBadge = document.getElementById('offline-badge');
const paintOnline = () => { offlineBadge.hidden = navigator.onLine; };
window.addEventListener('online', paintOnline);
window.addEventListener('offline', paintOnline);
paintOnline();

document.querySelector('#sidebar .project').addEventListener('click', () => {
  if (!state.board) return;
  const input = el('input', { value: state.board.name });
  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Rename board'),
    el('div', { class: 'field' }, el('label', {}, 'Board name'), input),
    el('div', { class: 'field' },
      el('label', {}, 'Key'),
      el('span', { class: 'static' }, `${state.board.keyPrefix} (permanent)`)),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          const v = input.value.trim();
          if (!v) return;
          try { await store.updateBoard(state.activeBoardId, { name: v }); }
          catch (err) { toast('Rename failed: ' + err.message); }
          overlay.remove();
        },
      }, 'Save')),
  ));
});

setRenderer(renderApp);

function renderApp() {
  if (!state.board) return;
  document.getElementById('project-name').textContent = state.board.name;
  document.getElementById('project-icon').textContent = state.board.keyPrefix[0];
  document.getElementById('board-switcher').replaceChildren(renderBoardSwitcher(switchBoard));
  renderView();
}

function renderView() {
  const view = document.getElementById('view');
  if (state.route === 'backlog') renderBacklog(view);
  else renderBoard(view);
}

function switchBoard(boardId) {
  boardUnsubs.forEach(u => u());
  state.activeBoardId = boardId;
  state.board = null;
  state.issues = [];
  state.epics = [];
  state.filters = { text: '', type: '', epicId: '', label: '', overdue: false };
  state.collapsedLanes = new Set();
  localStorage.setItem('pk-active-board', boardId);
  store.setActiveBoard(boardId);
  boardUnsubs = [
    store.subscribeBoard(boardId, data => { state.board = data; rerender(); }),
    store.subscribeIssues(list => { state.issues = list; rerender(); }),
    store.subscribeEpics(list => { state.epics = list; rerender(); }),
  ];
}

async function pickInitialBoardId(boards, user) {
  const saved = localStorage.getItem('pk-active-board');
  if (saved && boards.some(b => b.id === saved)) return saved;
  if (boards.length) return [...boards].sort((a, b) => a.order - b.order)[0].id;
  const first = (user.displayName || '').split(' ')[0];
  const { name, keyPrefix } = await boardDetailsDialog({
    title: 'Name your board', submitLabel: 'Create board',
    defaultName: first ? `${first}'s Kanban` : 'My Kanban',
  });
  return store.createBoard(name, keyPrefix);
}

onAuthStateChanged(auth, async user => {
  boardUnsubs.forEach(u => u());
  boardUnsubs = [];
  unsubs.forEach(u => u());
  unsubs = [];
  if (!user) {
    Object.assign(state, { user: null, boards: [], activeBoardId: null, board: null, issues: [], epics: [] });
    appEl.hidden = true;
    signinEl.hidden = false;
    return;
  }
  state.user = user;
  store.initStore(user.uid);
  document.getElementById('nav-avatar').src = user.photoURL || '';
  document.getElementById('menu-email').textContent = user.email || '';
  signinEl.hidden = true;
  appEl.hidden = false;

  let boardsInitialized = false;
  unsubs = [store.subscribeBoards(async list => {
    state.boards = list;
    if (!boardsInitialized) {
      boardsInitialized = true;
      switchBoard(await pickInitialBoardId(list, user));
    } else {
      rerender();
    }
  })];
  applyRoute();
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check js/main.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "refactor: board subscription/switching orchestration in main.js"
```

---

### Task 9: Fix remaining call sites (`js/board.js`, `js/columns.js`)

**Files:**
- Modify: `js/board.js:28`
- Modify: `js/columns.js:78`

**Interfaces:**
- Consumes: `state.board` (Task 4), `store.updateBoard` (Task 5).

- [ ] **Step 1: Update `js/board.js`**

Change:
```js
    el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`),
```
to:
```js
    el('div', { class: 'board-title' }, `${state.board.name} board`),
```

- [ ] **Step 2: Update `js/columns.js`**

Change:
```js
      await store.updateProject({ columns: finalCols });
```
to:
```js
      await store.updateBoard(state.activeBoardId, { columns: finalCols });
```

- [ ] **Step 3: Syntax check**

Run: `node --check js/board.js && node --check js/columns.js`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add js/board.js js/columns.js
git commit -m "fix: board.js and columns.js read/write the active board instead of the old user doc"
```

---

### Task 10: Regression check

**Files:** none (verification only)

- [ ] **Step 1: Syntax-check every touched file**

Run: `for f in js/state.js js/store.js js/boards.js js/auth.js js/main.js js/board.js js/columns.js; do node --check "$f" || echo "FAILED: $f"; done`
Expected: no `FAILED` lines.

- [ ] **Step 2: Run the existing test suite**

Run: `node --test`
Expected: all tests pass (same count as before this plan — `js/logic.js` was not touched). If `node --test` with no path errors on this machine, fall back to `node --test tests/logic.test.mjs` (known environment quirk, unrelated to this change).

No commit — verification only, no files changed.

---

### Task 11: Manual browser verification

**Files:** none (manual verification only)

- [ ] **Step 1: Serve the app locally**

Run: `cd ~/Documents/personal-kanban && python3 -m http.server 8000`

- [ ] **Step 2: Walk through the flows in a browser (via claude-in-chrome)**

Open `http://localhost:8000`, sign in, and verify:
- Sidebar shows a "Boards" list with two entries (the existing board and "Career Investment"); one is highlighted as active.
- Switching boards swaps the columns, issues, and epics shown, and the header name/icon updates.
- The Career Investment board shows 33 issues keyed `CI-1`…`CI-33` across its columns, with the 6 migrated epics visible in the Backlog epic panel and correctly colored/named.
- The original board is unaffected — same issues, same `HK-` keys, same columns as before this change.
- "+ Create board" opens the name/key dialog, creates a new board, and switches to it (empty, default 3 columns).
- Clicking the sidebar header opens "Rename board" and renaming the active board updates its name live.
- Board Settings (⚙) column add/remove/reorder still works and persists on the active board.
- Drag-and-drop between columns, subtask reordering, and the "Blocked by" issue-detail feature still work (spot check on one issue on each board).
- Switching boards resets any active text/epic filter (open a filter on one board, switch, confirm it's cleared).

If anything doesn't match, fix the relevant file from Tasks 4–9, re-run Step 1's syntax check for that file, and re-verify here before moving on.

No commit — verification only.

---

### Task 12: Push and live smoke check

**Files:** none (deploy only)

- [ ] **Step 1: Push**

Run: `cd ~/Documents/personal-kanban && git push`

- [ ] **Step 2: Smoke check the live site**

Open `https://harrycpc.github.io/personal-kanban/` (may take ~1 minute for GitHub Pages to redeploy), sign in, and confirm the same board switcher and both boards appear correctly, same as the local check in Task 11.

No commit — deploy step only.

---

### Task 13: Clean up the old flat data (destructive — requires explicit confirmation)

**Files:**
- Create: `~/.personal-kanban-admin/seeds/2026-07-25-cleanup-old-shape.mjs`

**Interfaces:**
- Consumes: `~/.personal-kanban-admin/service-account.json`, `~/.personal-kanban-admin/uid.txt`.
- Produces: deletion of `users/{uid}/issues`, `users/{uid}/epics`, and the legacy `columns`/`keyPrefix`/`issueCounter`/`projectName` fields on `users/{uid}`.

**STOP before Step 3 of this task and get explicit confirmation from the user that Task 12's live smoke check looked correct. This step is irreversible — do not run `--apply` unattended.**

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// ONE-TIME cleanup: run ONLY after verifying the migrated boards/* data in
// the live app (Task 12). Deletes the old flat users/{uid}/issues and
// users/{uid}/epics subcollections and strips the now-unused
// columns/keyPrefix/issueCounter/projectName fields from users/{uid}.
//
// This is destructive and irreversible — do not run with --apply until the
// app has been confirmed working against the new boards/* data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const serviceAccount = JSON.parse(readFileSync(join(root, 'service-account.json'), 'utf8'));
const uid = readFileSync(join(root, 'uid.txt'), 'utf8').trim();

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function deleteCollection(path) {
  const snap = await db.collection(path).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function main() {
  if (!process.argv.includes('--apply')) {
    const issuesSnap = await db.collection(`users/${uid}/issues`).get();
    const epicsSnap = await db.collection(`users/${uid}/epics`).get();
    console.log(`Would delete ${issuesSnap.size} old issues, ${epicsSnap.size} old epics, and strip columns/keyPrefix/issueCounter/projectName from users/${uid}.`);
    console.log('Re-run with --apply to perform this. This is irreversible.');
    return;
  }
  const deletedIssues = await deleteCollection(`users/${uid}/issues`);
  const deletedEpics = await deleteCollection(`users/${uid}/epics`);
  await db.doc(`users/${uid}`).update({
    columns: FieldValue.delete(),
    keyPrefix: FieldValue.delete(),
    issueCounter: FieldValue.delete(),
    projectName: FieldValue.delete(),
  });
  console.log(`Deleted ${deletedIssues} old issues, ${deletedEpics} old epics. Stripped legacy fields from users/${uid}.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry run**

Run: `cd ~/.personal-kanban-admin && node seeds/2026-07-25-cleanup-old-shape.mjs`
Expected: `Would delete 56 old issues, 11 old epics, and strip columns/keyPrefix/issueCounter/projectName from users/<uid>.`

- [ ] **Step 3: Apply (only after explicit user go-ahead)**

Run: `node seeds/2026-07-25-cleanup-old-shape.mjs --apply`
Expected: `Deleted 56 old issues, 11 old epics. Stripped legacy fields from users/<uid>.`

No commit — this file lives in `~/.personal-kanban-admin/`, outside the git repo.
