import { state, rerender, columnsSorted, isDoneStatus } from './state.js';
import { el } from './ui.js';
import {
  todayLocalISO, isOverdue, matchesFilters, daysBetween, addDaysISO, issueDateRange, epicDateRange,
} from './logic.js';
import { openDetailModal } from './detail.js';
import { openEpicDialog } from './backlog.js';
import { filterBar } from './filters.js';

const ZOOM_PX = { weeks: 22, months: 6, quarters: 2.4 };
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function renderTimeline(view) {
  const body = el('div');
  const paint = () => body.replaceChildren(timelineBody());
  view.replaceChildren(timelineHeader(paint), body);
  paint();
}

function timelineHeader(paint) {
  const zoomBtn = z => el('button', {
    class: 'filter-chip' + (state.timelineZoom === z ? ' active' : ''),
    onclick: () => {
      state.timelineZoom = z;
      localStorage.setItem('pk-timeline-zoom', z);
      rerender();
    },
  }, z[0].toUpperCase() + z.slice(1));
  return el('div', { class: 'board-header' },
    el('div', { class: 'board-title' }, `${state.board.name} timeline`),
    el('div', { class: 'board-controls' },
      ...filterBar(paint),
      el('div', { class: 'spacer' }),
      el('div', { class: 'zoom-group' }, zoomBtn('weeks'), zoomBtn('months'), zoomBtn('quarters'))));
}

function timelineBody() {
  const cols = columnsSorted();
  const doneStatus = cols.length ? cols[cols.length - 1].id : '';
  const f = { ...state.filters, today: todayLocalISO(), doneStatus };
  const visible = state.issues.filter(i => matchesFilters(i, f));

  const groups = [
    ...state.epics.map(e => ({ epic: e, issues: visible.filter(i => i.epicId === e.id) })),
    { epic: null, issues: visible.filter(i => !i.epicId) },
  ].filter(g => g.epic || g.issues.length);

  const scheduled = [];
  const unscheduled = [];
  groups.forEach(g => g.issues.forEach(i => (issueDateRange(i) ? scheduled : unscheduled).push(i)));

  const allRanges = [
    ...groups.filter(g => g.epic).map(g => epicDateRange(g.epic, visible)),
    ...scheduled.map(issueDateRange),
  ].filter(Boolean);

  if (!allRanges.length) {
    return el('div', {}, el('div', { class: 'timeline-empty' },
      'No dates set yet. Add a start or due date to an issue (or epic) to see it on the timeline.'));
  }

  const today = todayLocalISO();
  const starts = allRanges.map(r => r.start).concat(today);
  const ends = allRanges.map(r => r.end).concat(today);
  const winStart = addDaysISO(starts.reduce((a, b) => (a < b ? a : b)), -14);
  const winEnd = addDaysISO(ends.reduce((a, b) => (a > b ? a : b)), 21);
  const pxPerDay = ZOOM_PX[state.timelineZoom] || ZOOM_PX.weeks;
  const totalPx = daysBetween(winStart, winEnd) * pxPerDay;
  const xOf = iso => daysBetween(winStart, iso) * pxPerDay;
  const todayX = xOf(today);

  const ticks = buildTicks(winStart, winEnd, state.timelineZoom);
  const ruler = el('div', { class: 'timeline-ruler', style: `width:${totalPx}px` },
    ticks.map(t => el('div', {
      class: 'timeline-tick', style: `left:${Math.max(0, xOf(t.date))}px`,
    }, el('span', {}, t.label))));

  const rows = [];
  groups.forEach(g => {
    if (g.epic) {
      const collapsed = state.timelineCollapsed.has(g.epic.id);
      const range = epicDateRange(g.epic, visible);
      const total = g.issues.length;
      const done = g.issues.filter(i => isDoneStatus(i.status)).length;
      rows.push(epicRow(g.epic, range, done, total, collapsed, xOf, todayX, totalPx));
      if (!collapsed) {
        g.issues.filter(issueDateRange)
          .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
          .forEach(i => rows.push(issueRow(i, g.epic.color, xOf, todayX, totalPx)));
      }
    } else if (g.issues.some(issueDateRange)) {
      rows.push(el('div', { class: 'timeline-row timeline-group-row' },
        el('div', { class: 'timeline-row-label' }, 'No epic'),
        el('div', { class: 'timeline-row-track', style: `width:${totalPx}px` }, todayLine(todayX))));
      g.issues.filter(issueDateRange)
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
        .forEach(i => rows.push(issueRow(i, '#6B778C', xOf, todayX, totalPx)));
    }
  });

  const headerRow = el('div', { class: 'timeline-header-row' },
    el('div', { class: 'timeline-row-label timeline-corner' }), ruler);
  const scroller = el('div', { class: 'timeline-scroll' },
    headerRow, el('div', { class: 'timeline-rows' }, rows));

  return el('div', {}, scroller, unscheduledTray(unscheduled));
}

function epicRow(epic, range, done, total, collapsed, xOf, todayX, totalPx) {
  const label = el('div', {
    class: 'timeline-row-label timeline-epic-label',
    onclick: () => {
      collapsed ? state.timelineCollapsed.delete(epic.id) : state.timelineCollapsed.add(epic.id);
      rerender();
    },
  },
    el('span', { class: 'caret' }, collapsed ? '▸' : '▾'),
    el('span', { class: 'epic-dot', style: `background:${epic.color}` }),
    el('span', { class: 'timeline-epic-name' }, epic.name),
    total > 0 && el('span', { class: 'timeline-progress-text' }, `${done}/${total}`));

  const track = el('div', { class: 'timeline-row-track', style: `width:${totalPx}px` }, todayLine(todayX));
  if (range) {
    const left = xOf(range.start);
    const width = Math.max(xOf(range.end) - left, 6);
    const pct = total > 0 ? Math.round(100 * done / total) : 0;
    track.append(el('div', {
      class: 'timeline-bar timeline-epic-bar',
      style: `left:${left}px;width:${width}px;border-color:${epic.color}`,
      title: `${epic.name}: ${range.start} → ${range.end}`,
      onclick: e => { e.stopPropagation(); openEpicDialog(epic); },
    }, el('div', { class: 'timeline-progress-fill', style: `width:${pct}%;background:${epic.color}` })));
  }
  return el('div', { class: 'timeline-row timeline-epic-row' }, label, track);
}

function issueRow(issue, color, xOf, todayX, totalPx) {
  const range = issueDateRange(issue);
  const done = isDoneStatus(issue.status);
  const overdue = !done && isOverdue(issue.dueDate);
  const label = el('div', {
    class: 'timeline-row-label timeline-issue-label',
    onclick: () => openDetailModal(issue.id),
  },
    el('span', { class: 'key' + (done ? ' done' : '') }, issue.key),
    el('span', { class: 'timeline-issue-title' }, issue.title));

  const left = xOf(range.start);
  const width = Math.max(xOf(range.end) - left, 8);
  const bar = el('div', {
    class: 'timeline-bar timeline-issue-bar' + (done ? ' done' : '') + (overdue ? ' overdue' : ''),
    style: `left:${left}px;width:${width}px;background:${color}`,
    title: `${issue.key} ${issue.title}: ${range.start}${range.start !== range.end ? ' → ' + range.end : ''}`,
    onclick: () => openDetailModal(issue.id),
  });
  const track = el('div', { class: 'timeline-row-track', style: `width:${totalPx}px` }, todayLine(todayX), bar);
  return el('div', { class: 'timeline-row' }, label, track);
}

function todayLine(todayX) {
  return el('div', { class: 'timeline-today-line', style: `left:${todayX}px` });
}

function unscheduledTray(issues) {
  if (!issues.length) return null;
  const list = el('div', { class: 'timeline-unscheduled-list', hidden: true },
    [...issues].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map(i => el('div', {
        class: 'timeline-unscheduled-row',
        onclick: () => openDetailModal(i.id),
      }, el('span', { class: 'key' }, i.key), el('span', {}, i.title))));
  const label = open => `${issues.length} unscheduled issue${issues.length === 1 ? '' : 's'} ${open ? '▴' : '▾'}`;
  const toggle = el('button', { class: 'timeline-unscheduled-toggle' }, label(false));
  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.textContent = label(!list.hidden);
  });
  return el('div', { class: 'timeline-unscheduled' }, toggle, list);
}

function ymd(iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; }
function isoOf(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function weekday(iso) { return new Date(`${iso}T00:00:00Z`).getUTCDay(); }
function mondayOnOrBefore(iso) { return addDaysISO(iso, -((weekday(iso) + 6) % 7)); }
function firstOfMonthOnOrBefore(iso) { const { y, m } = ymd(iso); return isoOf(y, m, 1); }
function firstOfNextMonth(iso) { const { y, m } = ymd(iso); return m === 12 ? isoOf(y + 1, 1, 1) : isoOf(y, m + 1, 1); }
function firstOfQuarterOnOrBefore(iso) { const { y, m } = ymd(iso); return isoOf(y, Math.floor((m - 1) / 3) * 3 + 1, 1); }
function firstOfNextQuarter(iso) {
  const { y, m } = ymd(iso);
  const q = Math.floor((m - 1) / 3);
  return q === 3 ? isoOf(y + 1, 1, 1) : isoOf(y, q * 3 + 4, 1);
}
function weekLabel(iso) { const { m, d } = ymd(iso); return `${d} ${MONTHS_SHORT[m - 1]}`; }
function monthLabel(iso) { const { y, m } = ymd(iso); return `${MONTHS_SHORT[m - 1]} ${y}`; }
function quarterLabel(iso) { const { y, m } = ymd(iso); return `Q${Math.floor((m - 1) / 3) + 1} ${y}`; }

function buildTicks(winStart, winEnd, zoom) {
  const ticks = [];
  if (zoom === 'quarters') {
    let d = firstOfQuarterOnOrBefore(winStart);
    while (d <= winEnd) { ticks.push({ date: d, label: quarterLabel(d) }); d = firstOfNextQuarter(d); }
  } else if (zoom === 'months') {
    let d = firstOfMonthOnOrBefore(winStart);
    while (d <= winEnd) { ticks.push({ date: d, label: monthLabel(d) }); d = firstOfNextMonth(d); }
  } else {
    let d = mondayOnOrBefore(winStart);
    while (d <= winEnd) { ticks.push({ date: d, label: weekLabel(d) }); d = addDaysISO(d, 7); }
  }
  return ticks;
}
