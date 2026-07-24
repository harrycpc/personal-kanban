import { state, columnsSorted, issuesByStatus } from './state.js';
import { el, openModal, confirmDialog, selectEl, toast } from './ui.js';
import * as store from './store.js';
import { newId } from './logic.js';

export function openColumnSettings() {
  let cols = columnsSorted().map(c => ({ ...c }));
  const pendingMoves = []; // { fromId, toId }
  const listEl = el('div');

  function paint() {
    listEl.replaceChildren(...cols.map((c, idx) => {
      const name = el('input', { value: c.name });
      name.addEventListener('input', () => { c.name = name.value; });
      const wip = el('input', {
        type: 'number', min: '1', value: c.wipLimit ?? '', placeholder: 'No limit',
      });
      wip.addEventListener('input', () => {
        c.wipLimit = wip.value === '' ? null : Number(wip.value);
      });
      return el('div', { class: 'column-row' },
        name, wip,
        el('button', {
          class: 'icon-btn', disabled: idx === 0,
          onclick: () => { [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]]; paint(); },
        }, '↑'),
        el('button', {
          class: 'icon-btn', disabled: idx === cols.length - 1,
          onclick: () => { [cols[idx + 1], cols[idx]] = [cols[idx], cols[idx + 1]]; paint(); },
        }, '↓'),
        el('button', { class: 'icon-btn', onclick: () => removeColumn(idx) }, '🗑'));
    }));
  }

  async function removeColumn(idx) {
    if (cols.length === 1) { toast('A board needs at least one column'); return; }
    const col = cols[idx];
    const count = issuesByStatus(col.id).length;
    if (count > 0) {
      const others = cols.filter(c => c.id !== col.id);
      const dest = await destinationDialog(col, others, count);
      if (!dest) return;
      pendingMoves.push({ fromId: col.id, toId: dest });
    } else {
      const ok = await confirmDialog({
        title: `Delete column "${col.name}"?`,
        message: 'The column is empty. This takes effect when you press Save.',
      });
      if (!ok) return;
    }
    cols.splice(idx, 1);
    paint();
  }

  async function saveAll() {
    if (cols.some(c => !c.name.trim())) { toast('Column names cannot be empty'); return; }
    const finalCols = cols.map((c, i) => ({
      id: c.id, name: c.name.trim(), wipLimit: c.wipLimit ?? null, order: i,
    }));
    const resolve = id => {
      let cur = id, guard = 0;
      while (guard++ < 20) {
        const m = pendingMoves.find(x => x.fromId === cur);
        if (!m) return cur;
        cur = m.toId;
      }
      return cur;
    };
    const updates = [];
    for (const { fromId } of pendingMoves) {
      const dest = resolve(fromId);
      const base = issuesByStatus(dest).length + updates.filter(u => u.status === dest).length;
      issuesByStatus(fromId).forEach((iss, i) =>
        updates.push({ id: iss.id, status: dest, order: base + i }));
    }
    try {
      if (updates.length) await store.batchUpdateIssues(updates);
      await store.updateBoard(state.activeBoardId, { columns: finalCols });
      overlay.remove();
      toast('Board columns updated');
    } catch (e) { toast('Save failed: ' + e.message); }
  }

  const overlay = openModal(el('div', { class: 'modal' },
    el('h2', {}, 'Board settings — columns'),
    el('div', { class: 'column-row column-row-head' },
      el('span', {}, 'Name'), el('span', {}, 'WIP limit'), el('span', {})),
    listEl,
    el('button', {
      class: 'col-add',
      onclick: () => { cols.push({ id: newId(), name: 'New column', wipLimit: null, order: cols.length }); paint(); },
    }, '+ Add column'),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: saveAll }, 'Save'))));
  paint();
}

function destinationDialog(col, others, count) {
  return new Promise(resolve => {
    const sel = selectEl(others.map(c => [c.id, c.name]), others[0].id);
    const done = v => { overlay.remove(); resolve(v); };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, `Delete column "${col.name}"?`),
      el('p', {}, `${count} issue(s) in it need a new home. Applied when you press Save.`),
      el('div', { class: 'field' }, el('label', {}, 'Move issues to'), sel),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onclick: () => done(sel.value) }, 'Delete and move'))),
      { dismissable: false });
  });
}
