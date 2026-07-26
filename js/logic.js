export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function suggestKeyPrefix(name) {
  const cleaned = (name || '').replace(/['’]/g, '').toUpperCase();
  const words = cleaned.split(/[^A-Z0-9]+/).filter(Boolean);
  if (!words.length) return 'PK';
  const raw = words.length === 1 ? words[0].slice(0, 3) : words.map(w => w[0]).join('').slice(0, 4);
  const prefix = raw.replace(/[^A-Z]/g, '');
  return prefix || 'PK';
}

export function todayLocalISO(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isOverdue(dueDate, today = todayLocalISO()) {
  return !!dueDate && dueDate < today;
}

export function appendActivity(activity, text, ts = Date.now()) {
  return [...(activity || []), { ts, text }].slice(-100);
}

export function allLabels(issues) {
  return [...new Set(issues.flatMap(i => i.labels || []))].sort();
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function formatDue(dueDate) {
  const [, m, d] = dueDate.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export const EPIC_COLORS = ['#8777D9','#2684FF','#57D9A3','#00C7E6','#FFC400','#FF7452','#6554C0','#00875A'];

export const PRIORITIES = [
  ['highest', 'Highest'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['lowest', 'Lowest'],
];

export const TYPES = [['task', 'Task'], ['story', 'Story'], ['bug', 'Bug']];

export function matchesFilters(issue, f) {
  if (f.text) {
    const hay = [issue.title, issue.description, issue.key, ...(issue.labels || [])]
      .join(' ').toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  if (f.type && issue.type !== f.type) return false;
  if (f.epicId) {
    if (f.epicId === 'none') { if (issue.epicId) return false; }
    else if (issue.epicId !== f.epicId) return false;
  }
  if (f.label && !(issue.labels || []).includes(f.label)) return false;
  if (f.overdue) {
    if (issue.status === f.doneStatus) return false;
    if (!isOverdue(issue.dueDate, f.today)) return false;
  }
  return true;
}

export function blockedByIssues(issue, allIssues) {
  const ids = new Set(issue.blockedBy || []);
  return allIssues.filter(i => ids.has(i.id));
}

export function blockingIssues(issue, allIssues) {
  return allIssues.filter(i => (i.blockedBy || []).includes(issue.id));
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(aIso, bIso) {
  return Math.round((parseISO(bIso) - parseISO(aIso)) / 86400000);
}

export function addDaysISO(iso, n) {
  const dt = new Date(parseISO(iso) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function issueDateRange(issue) {
  if (issue.startDate && issue.dueDate) return { start: issue.startDate, end: issue.dueDate };
  if (issue.dueDate) return { start: issue.dueDate, end: issue.dueDate };
  if (issue.startDate) return { start: issue.startDate, end: issue.startDate };
  return null;
}

export function rollupRange(ranges) {
  const valid = ranges.filter(Boolean);
  if (!valid.length) return null;
  return {
    start: valid.map(r => r.start).reduce((a, b) => (a < b ? a : b)),
    end: valid.map(r => r.end).reduce((a, b) => (a > b ? a : b)),
  };
}

export function epicDateRange(epic, issues) {
  if (epic.startDate && epic.dueDate) return { start: epic.startDate, end: epic.dueDate };
  return rollupRange(issues.filter(i => i.epicId === epic.id).map(issueDateRange));
}
