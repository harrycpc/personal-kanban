import { state, boardsSorted } from './state.js';
import { el, openModal, toast } from './ui.js';
import * as store from './store.js';
import { suggestKeyPrefix } from './logic.js';

export function boardDetailsDialog({ title, submitLabel, defaultName = 'My Board', cancellable = false }) {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (settled) return; settled = true; resolve(v); };
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
      done({ name: n, keyPrefix: p });
    };
    const cancel = () => { overlay.remove(); done(null); };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, title),
      el('div', { class: 'field' }, el('label', {}, 'Board name'), name),
      el('div', { class: 'field' },
        el('label', {}, 'Key — used for issue IDs like HG-1. Permanent.'), prefix),
      errEl,
      el('div', { class: 'actions' },
        cancellable && el('button', { class: 'btn', onclick: cancel }, 'Cancel'),
        el('button', { class: 'btn btn-primary', onclick: submit }, submitLabel)),
    ), { dismissable: cancellable });
    if (cancellable) overlay.addEventListener('click', e => { if (e.target === overlay) done(null); });
  });
}

async function createBoardFlow(onCreated) {
  const result = await boardDetailsDialog({
    title: 'Create board', submitLabel: 'Create board', defaultName: 'New board', cancellable: true,
  });
  if (!result) return;
  const { name, keyPrefix } = result;
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
