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
