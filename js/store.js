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
