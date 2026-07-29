import { state, rerender, columnsSorted, findEpic } from './state.js';
import { el, toast } from './ui.js';
import { todayLocalISO, journalDays, journalStats, toCSV, formatDue } from './logic.js';
import { openDetailModal } from './detail.js';
import * as store from './store.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayOf(iso) {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

function currentDays() {
  const cols = columnsSorted();
  const doneCol = cols.length ? cols[cols.length - 1] : null;
  return journalDays(
    state.issues, state.journal,
    doneCol?.id, doneCol?.name,
    todayLocalISO(),
  );
}

export function renderJournal(view) {
  const days = currentDays();
  const stats = journalStats(days, todayLocalISO());
  const shown = state.journalShowEmpty ? days : days.filter(d => d.issues.length || d.note);

  view.replaceChildren(
    header(shown),
    days.length
      ? el('div', {}, summary(stats), table(shown))
      : el('div', { class: 'journal-empty' },
          'Nothing logged yet. Move an issue into ',
          el('strong', {}, columnsSorted().slice(-1)[0]?.name || 'Done'),
          ' and the day it happened shows up here.'),
  );
}

function header(days) {
  const toggle = el('input', { type: 'checkbox', checked: state.journalShowEmpty });
  toggle.addEventListener('change', () => {
    state.journalShowEmpty = toggle.checked;
    localStorage.setItem('pk-journal-empty', toggle.checked ? 'on' : 'off');
    rerender();
  });

  return el('div', { class: 'board-header' },
    el('div', { class: 'board-title' }, `${state.board.name} journal`),
    el('div', { class: 'board-controls' },
      el('label', { class: 'journal-toggle' }, toggle, 'Show empty days'),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn',
        disabled: !days.length,
        onclick: () => exportCSV(days),
      }, 'Export CSV')));
}

function summary(s) {
  const bits = [
    `Active days ${s.activeDays}`,
    `Streak ${s.streak}`,
    `Tickets ${s.tickets}`,
    `Points ${s.points}`,
    s.since && `Since ${formatDue(s.since)} ${s.since.slice(0, 4)}`,
  ].filter(Boolean);
  return el('div', { class: 'journal-summary' }, bits.join(' · '));
}

function table(days) {
  const head = el('div', { class: 'journal-row journal-head' },
    el('div', { class: 'jc-date' }, 'Date'),
    el('div', { class: 'jc-done' }, 'Done'),
    el('div', { class: 'jc-pts' }, 'Pts'),
    el('div', { class: 'jc-epics' }, 'Epics'),
    el('div', { class: 'jc-note' }, 'What I did'));

  return el('div', { class: 'journal-table' }, head, days.map(dayRow));
}

function dayRow(day) {
  const empty = !day.issues.length && !day.note;
  return el('div', { class: 'journal-row' + (empty ? ' empty' : '') },
    el('div', { class: 'jc-date' },
      el('span', { class: 'jc-weekday' }, weekdayOf(day.date)),
      formatDue(day.date)),
    el('div', { class: 'jc-done' },
      day.issues.length
        ? day.issues.map(i => el('button', {
            class: 'jc-key',
            title: i.title,
            onclick: () => openDetailModal(i.id),
          }, i.key))
        : el('span', { class: 'jc-dash' }, '—')),
    el('div', { class: 'jc-pts' }, day.points ? String(day.points) : el('span', { class: 'jc-dash' }, '—')),
    el('div', { class: 'jc-epics' },
      day.epicIds.length
        ? day.epicIds.map(id => {
            const e = findEpic(id);
            return e && el('span', { class: 'jc-epic' },
              el('span', { class: 'epic-dot', style: `background:${e.color}` }), e.name);
          })
        : el('span', { class: 'jc-dash' }, '—')),
    noteCell(day));
}

// Click to edit, Enter or blur to save, Escape to cancel.
function noteCell(day) {
  const cell = el('div', { class: 'jc-note' });

  const paintText = () => cell.replaceChildren(day.note
    ? el('span', { class: 'jc-note-text' }, day.note)
    : el('span', { class: 'jc-dash' }, 'Add a note…'));

  const startEdit = () => {
    const input = el('input', { class: 'jc-note-input', value: day.note });
    let settled = false;
    const commit = async save => {
      if (settled) return;
      settled = true;
      const next = input.value.trim();
      if (!save || next === day.note) { paintText(); return; }
      day.note = next;
      paintText();
      try { await store.setJournalNote(day.date, next); }
      catch (e) { toast('Could not save note: ' + e.message); }
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
    input.addEventListener('blur', () => commit(true));
    cell.replaceChildren(input);
    input.focus();
    input.select();
  };

  cell.addEventListener('click', () => {
    if (!cell.querySelector('input')) startEdit();
  });
  paintText();
  return cell;
}

function exportCSV(days) {
  const rows = [['Date', 'Weekday', 'Tickets', 'Titles', 'Points', 'Epics', 'What I did']];
  for (const d of days) {
    rows.push([
      d.date,
      weekdayOf(d.date),
      d.issues.map(i => i.key).join(' '),
      d.issues.map(i => i.title).join('; '),
      d.points || '',
      d.epicIds.map(id => findEpic(id)?.name).filter(Boolean).join('; '),
      d.note,
    ]);
  }
  const slug = state.board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv' }));
  const a = el('a', { href: url, download: `${slug}-journal-${todayLocalISO()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
