import { state, columnsSorted, issuesByStatus, isDoneStatus, findEpic, rerender, statusName } from './state.js';
import { el, iconEl, typeIconHtml, priorityIconHtml, toast } from './ui.js';
import * as store from './store.js';
import { isOverdue, formatDue, appendActivity, matchesFilters, todayLocalISO } from './logic.js';
import { openCreateModal, openDetailModal } from './detail.js';
import { filterBar } from './filters.js';
import { openColumnSettings } from './columns.js';

let suppressClick = false;

export function renderBoard(view) {
  const body = el('div');
  const paintBody = () => body.replaceChildren(boardBody());
  view.replaceChildren(boardHeader(paintBody), body);
  paintBody();
}

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
      gb,
      el('button', { class: 'icon-btn', title: 'Board settings', onclick: openColumnSettings }, '⚙')));
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

function visibleIssues(status) {
  const cols = columnsSorted();
  const f = {
    ...state.filters,
    today: todayLocalISO(),
    doneStatus: cols.length ? cols[cols.length - 1].id : '',
  };
  return issuesByStatus(status).filter(i => matchesFilters(i, f));
}

function columnEl(col, laneEpicId, group) {
  let issues = visibleIssues(col.id);
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
