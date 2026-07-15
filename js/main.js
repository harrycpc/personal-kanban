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
