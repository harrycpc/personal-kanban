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

// Real implementation in Task 9.
export function openDetailModal(issueId) {
  toast('Issue detail arrives in Task 9');
}
