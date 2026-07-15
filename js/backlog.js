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
