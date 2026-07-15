import { state, columnsSorted, issuesByStatus, statusName, findEpic } from './state.js';
import {
  el, openModal, toast, selectEl, iconEl, typeIconHtml, priorityIconHtml, confirmDialog,
} from './ui.js';
import * as store from './store.js';
import { allLabels, appendActivity, newId, PRIORITIES, TYPES } from './logic.js';

export function fieldWrap(label, node) {
  return el('div', { class: 'field' }, el('label', {}, label), node);
}

export function labelsInput(initial, onChange) {
  let labels = [...(initial || [])];
  const chips = el('div', { class: 'card-labels' });
  const input = el('input', { list: 'labels-datalist', placeholder: 'Add label…' });
  const dl = el('datalist', { id: 'labels-datalist' },
    allLabels(state.issues).map(l => el('option', { value: l })));
  const paint = () => chips.replaceChildren(...labels.map(l =>
    el('span', { class: 'chip' }, l,
      el('button', {
        class: 'chip-x',
        onclick: () => { labels = labels.filter(x => x !== l); paint(); onChange?.(labels); },
      }, '×'))));
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v && !labels.includes(v)) { labels.push(v); paint(); onChange?.(labels); }
    input.value = '';
  });
  paint();
  return { node: el('div', {}, chips, input, dl), get: () => labels };
}

export function openCreateModal(defaults = {}) {
  const cols = columnsSorted();
  const typeSel = selectEl(TYPES, defaults.type || 'task');
  const title = el('input', { placeholder: 'What needs to be done?' });
  const desc = el('textarea', { rows: '3', placeholder: 'Add a description…' });
  const statusSel = selectEl([['backlog', 'Backlog'], ...cols.map(c => [c.id, c.name])],
    defaults.status || 'backlog');
  const prioSel = selectEl(PRIORITIES, 'medium');
  const points = el('input', { type: 'number', min: '0', placeholder: 'None' });
  const due = el('input', { type: 'date' });
  const epicSel = selectEl([['', 'No epic'], ...state.epics.map(e => [e.id, e.name])],
    defaults.epicId || '');
  const labels = labelsInput([], null);

  async function create() {
    const t = title.value.trim();
    if (!t) { toast('Summary is required'); return; }
    const status = statusSel.value;
    try {
      const key = await store.createIssue({
        type: typeSel.value, title: t, description: desc.value, status,
        priority: prioSel.value,
        storyPoints: points.value === '' ? null : Number(points.value),
        dueDate: due.value, epicId: epicSel.value || null, labels: labels.get(),
        order: issuesByStatus(status).length,
        subtasks: [], comments: [], links: [], activity: [],
      });
      toast(`${key} created`);
      overlay.remove();
    } catch (e) { toast('Could not create issue: ' + e.message); }
  }

  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Create issue'),
    fieldWrap('Issue type', typeSel),
    fieldWrap('Summary', title),
    fieldWrap('Description', desc),
    fieldWrap('Status', statusSel),
    fieldWrap('Priority', prioSel),
    fieldWrap('Story points', points),
    fieldWrap('Due date', due),
    fieldWrap('Epic', epicSel),
    fieldWrap('Labels', labels.node),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: create }, 'Create'))));
  title.focus();
}

export function openDetailModal(issueId) {
  const src = state.issues.find(i => i.id === issueId);
  if (!src) return;
  const issue = { ...src };
  const cols = columnsSorted();

  const save = async (fields, activityText) => {
    if (activityText) {
      issue.activity = appendActivity(issue.activity, activityText);
      fields = { ...fields, activity: issue.activity };
    }
    Object.assign(issue, fields);
    try { await store.updateIssue(issue.id, fields); }
    catch (e) { toast('Save failed: ' + e.message); }
  };

  const fmtTs = ts => (ts?.toDate ? ts.toDate().toLocaleString() : '—');

  // --- header ---
  const moreMenu = el('div', { class: 'dropdown', hidden: true },
    el('button', {
      class: 'dropdown-item',
      onclick: async () => {
        moreMenu.hidden = true;
        const ok = await confirmDialog({
          title: `Delete ${issue.key}?`,
          message: 'This permanently deletes the issue, including its comments and subtasks.',
        });
        if (!ok) return;
        try {
          await store.deleteIssue(issue.id);
          toast(`${issue.key} deleted`);
          overlay.remove();
        } catch (e) { toast('Delete failed: ' + e.message); }
      },
    }, 'Delete'));
  const header = el('div', { class: 'detail-header' },
    iconEl(typeIconHtml(issue.type), issue.type),
    el('span', { class: 'key' }, issue.key),
    el('div', { class: 'right' },
      el('button', {
        class: 'icon-btn',
        onclick: e => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; },
      }, '⋯'),
      el('button', { class: 'icon-btn', onclick: () => overlay.remove() }, '✕'),
      moreMenu));

  // --- left column ---
  const title = el('input', { class: 'detail-title', value: issue.title });
  title.addEventListener('change', () => {
    const t = title.value.trim();
    if (t && t !== issue.title) save({ title: t });
    else title.value = issue.title;
  });
  const desc = el('textarea', { rows: '4', placeholder: 'Add a description…' }, issue.description || '');
  desc.addEventListener('change', () => save({ description: desc.value }));
  const detailMain = el('div', { class: 'detail-main' },
    title,
    el('div', { class: 'detail-section' }, el('h4', {}, 'Description'), desc),
    // Task 14 appends subtasksSection(issue, save) here.
    // Task 16 appends linksSection(issue, save) here.
    // Task 15 appends commentsActivitySection(issue, save) here (always last).
  );

  // --- right sidebar ---
  const statusSel = selectEl([['backlog', 'Backlog'], ...cols.map(c => [c.id, c.name])], issue.status);
  statusSel.addEventListener('change', () => {
    const status = statusSel.value;
    const order = state.issues.filter(i => i.status === status && i.id !== issue.id).length;
    save({ status, order }, `Moved to ${statusName(status)}`);
  });
  const typeSel = selectEl(TYPES, issue.type);
  typeSel.addEventListener('change', () =>
    save({ type: typeSel.value }, `Type changed to ${typeSel.selectedOptions[0].textContent}`));
  const prioSel = selectEl(PRIORITIES, issue.priority);
  prioSel.addEventListener('change', () =>
    save({ priority: prioSel.value }, `Priority set to ${prioSel.selectedOptions[0].textContent}`));
  const points = el('input', { type: 'number', min: '0', value: issue.storyPoints ?? '' });
  points.addEventListener('change', () => {
    const v = points.value === '' ? null : Number(points.value);
    save({ storyPoints: v }, v === null ? 'Story points cleared' : `Story points set to ${v}`);
  });
  const labels = labelsInput(issue.labels, ls => save({ labels: ls }));
  const epicSel = selectEl([['', 'No epic'], ...state.epics.map(e => [e.id, e.name])],
    issue.epicId || '');
  epicSel.addEventListener('change', () => {
    const v = epicSel.value || null;
    save({ epicId: v }, v ? `Epic set to ${findEpic(v)?.name ?? v}` : 'Epic removed');
  });
  const due = el('input', { type: 'date', value: issue.dueDate || '' });
  due.addEventListener('change', () =>
    save({ dueDate: due.value }, due.value ? `Due date set to ${due.value}` : 'Due date cleared'));

  const side = el('div', { class: 'detail-side' },
    fieldWrap('Status', statusSel),
    fieldWrap('Issue type', typeSel),
    fieldWrap('Priority', prioSel),
    fieldWrap('Story points', points),
    fieldWrap('Labels', labels.node),
    fieldWrap('Epic', epicSel),
    fieldWrap('Due date', due),
    el('div', { class: 'field' }, el('label', {}, 'Created'),
      el('span', { class: 'static' }, fmtTs(issue.createdAt))),
    el('div', { class: 'field' }, el('label', {}, 'Updated'),
      el('span', { class: 'static' }, fmtTs(issue.updatedAt))));

  const overlay = openModal(el('div', { class: 'modal modal-detail' },
    header,
    el('div', { class: 'detail-grid' }, detailMain, side)));
}
