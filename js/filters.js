import { state, rerender } from './state.js';
import { el, selectEl } from './ui.js';
import { allLabels, TYPES } from './logic.js';

export function filterBar(onChange) {
  const f = state.filters;
  const search = el('input', {
    class: 'filter-search', type: 'search', placeholder: 'Search board', value: f.text,
  });
  search.addEventListener('input', () => { f.text = search.value; onChange(); });

  const dropdown = (options, current, apply) => {
    const sel = selectEl(options, current);
    sel.className = 'filter-select';
    sel.addEventListener('change', () => { apply(sel.value); onChange(); });
    return sel;
  };
  const typeSel = dropdown(
    [['', 'Type: All'], ...TYPES.map(([v, l]) => [v, `Type: ${l}`])],
    f.type, v => { f.type = v; });
  const epicSel = dropdown(
    [['', 'Epic: All'], ['none', 'Epic: None'],
     ...state.epics.map(e => [e.id, `Epic: ${e.name}`])],
    f.epicId, v => { f.epicId = v; });
  const labelSel = dropdown(
    [['', 'Label: All'], ...allLabels(state.issues).map(l => [l, `Label: ${l}`])],
    f.label, v => { f.label = v; });

  const overdueChip = el('button', {
    class: 'filter-chip' + (f.overdue ? ' active' : ''),
    onclick: () => {
      f.overdue = !f.overdue;
      overdueChip.classList.toggle('active', f.overdue);
      onChange();
    },
  }, 'Overdue');
  const clear = el('button', {
    class: 'filter-chip',
    onclick: () => {
      Object.assign(f, { text: '', type: '', epicId: '', label: '', overdue: false });
      rerender();
    },
  }, 'Clear filters');

  return [search, typeSel, epicSel, labelSel, overdueChip, clear];
}
