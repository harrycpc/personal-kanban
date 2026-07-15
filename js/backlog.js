import { state, columnsSorted, issuesByStatus, findEpic, rerender, statusName } from './state.js';
import {
  el, iconEl, typeIconHtml, priorityIconHtml, toast, openModal, confirmDialog,
} from './ui.js';
import * as store from './store.js';
import { openDetailModal } from './detail.js';
import { EPIC_COLORS, appendActivity } from './logic.js';

let suppressClick = false;

export function renderBacklog(view) {
  const first = columnsSorted()[0];
  const main = el('div', { class: 'backlog-main' },
    el('div', { class: 'board-title' }, 'Backlog'),
    section(first.name, first.id),
    section('Backlog', 'backlog'));
  view.replaceChildren(el('div', { class: 'backlog-layout' }, epicPanel(), main));
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
  if (evt.from !== evt.to) {
    const movedId = evt.item.dataset.id;
    const moved = updates.find(u => u.id === movedId);
    const src = state.issues.find(i => i.id === movedId);
    if (moved && src) {
      moved.activity = appendActivity(src.activity, `Moved to ${statusName(moved.status)}`);
    }
  }
  try { await store.batchUpdateIssues(updates); }
  catch (e) { toast('Reorder failed: ' + e.message); }
}

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
