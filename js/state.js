export const state = {
  user: null,
  boards: [],
  activeBoardId: null,
  board: null,
  issues: [],
  epics: [],
  route: 'board',
  filters: { text: '', type: '', epicId: '', label: '', overdue: false },
  groupByEpic: localStorage.getItem('pk-groupby') === 'epic',
  collapsedLanes: new Set(),
  timelineCollapsed: new Set(),
  timelineZoom: localStorage.getItem('pk-timeline-zoom') || 'weeks',
};

let renderFn = () => {};
export function setRenderer(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

export function boardsSorted() {
  return [...state.boards].sort((a, b) => a.order - b.order);
}

export function columnsSorted() {
  return [...(state.board?.columns || [])].sort((a, b) => a.order - b.order);
}

export function isDoneStatus(status) {
  const cols = columnsSorted();
  return cols.length > 0 && status === cols[cols.length - 1].id;
}

export function issuesByStatus(status) {
  return state.issues.filter(i => i.status === status).sort((a, b) => a.order - b.order);
}

export function findEpic(id) {
  return state.epics.find(e => e.id === id);
}

export function statusName(status) {
  if (status === 'backlog') return 'Backlog';
  return columnsSorted().find(c => c.id === status)?.name || status;
}
