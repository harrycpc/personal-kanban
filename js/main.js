import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initSignin, wireSignout, onboardingDialog } from './auth.js';
import * as store from './store.js';
import { state, setRenderer, rerender } from './state.js';
import { el, openModal, toast } from './ui.js';
import { renderBoard } from './board.js';
import { openCreateModal } from './detail.js';

const signinEl = document.getElementById('signin');
const appEl = document.getElementById('app');
let unsubs = [];

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
    renderBoard(view);
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
  applyRoute();
});
