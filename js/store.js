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
const journalCol = () => collection(db, 'users', uid, 'boards', boardId, 'journal');
const journalRef = date => doc(db, 'users', uid, 'boards', boardId, 'journal', date);

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

// Doc id is the YYYY-MM-DD date, so a note write is idempotent and needs no
// read-modify-write. Clearing a note deletes the doc rather than storing ''.
export function subscribeJournal(cb) {
  return onSnapshot(journalCol(), s => {
    const notes = {};
    s.docs.forEach(d => { notes[d.id] = d.data().note || ''; });
    cb(notes);
  });
}

export async function setJournalNote(date, note) {
  if (!note) await deleteDoc(journalRef(date));
  else await setDoc(journalRef(date), { note, updatedAt: serverTimestamp() });
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
