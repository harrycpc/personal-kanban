import { state, columnsSorted, issuesByStatus, isDoneStatus, findEpic } from './state.js';
import { el, iconEl, typeIconHtml, priorityIconHtml, toast } from './ui.js';
import * as store from './store.js';
import { isOverdue, formatDue } from './logic.js';
import { openCreateModal, openDetailModal } from './detail.js';

let suppressClick = false;

export function renderBoard(view) {
  view.replaceChildren(
    el('div', { class: 'board-header' },
      el('div', { class: 'board-title' }, `${state.userDoc.projectName} board`)),
    el('div', { class: 'board' }, columnsSorted().map(col => columnEl(col))),
  );
}

function columnEl(col) {
  const issues = issuesByStatus(col.id);
  const over = col.wipLimit != null && issues.length > col.wipLimit;
  return el('div', { class: 'column' },
    el('div', { class: 'column-header' + (over ? ' over-wip' : '') },
      col.name,
      el('span', { class: 'count' },
        col.wipLimit != null ? `${issues.length}/${col.wipLimit}` : String(issues.length))),
    el('div', { class: 'column-list', dataset: { status: col.id } }, issues.map(issueCard)),
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
