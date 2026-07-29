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

// --- journal ---

// The day an issue was finished, or null if it isn't currently finished.
// Prefers the explicit completedAt stamp; falls back to the timestamped
// "Moved to <done column>" entry left in activity by issues completed before
// completedAt existed.
export function completionDate(issue, doneStatusId, doneColumnName) {
  if (!doneStatusId || issue.status !== doneStatusId) return null;
  if (issue.completedAt) return todayLocalISO(new Date(issue.completedAt));
  const moved = `Moved to ${doneColumnName}`;
  const hit = [...(issue.activity || [])].reverse().find(a => a.text === moved);
  return hit ? todayLocalISO(new Date(hit.ts)) : null;
}

function isActiveDay(day) {
  return day.issues.length > 0 || !!day.note;
}

// One entry per calendar day, newest first, spanning the earliest recorded day
// through today — including days where nothing happened.
export function journalDays(issues, notes, doneStatusId, doneColumnName, today) {
  const byDate = new Map();
  for (const issue of issues) {
    const date = completionDate(issue, doneStatusId, doneColumnName);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(issue);
  }

  const dated = [...byDate.keys(), ...Object.keys(notes || {}).filter(d => notes[d])];
  if (!dated.length) return [];

  const first = dated.reduce((a, b) => (a < b ? a : b));
  const last = [...dated, today].reduce((a, b) => (a > b ? a : b));

  const days = [];
  for (let d = last; d >= first; d = addDaysISO(d, -1)) {
    const dayIssues = (byDate.get(d) || [])
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    days.push({
      date: d,
      issues: dayIssues,
      points: dayIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
      epicIds: [...new Set(dayIssues.map(i => i.epicId).filter(Boolean))],
      note: (notes || {})[d] || '',
    });
  }
  return days;
}

export function journalStats(days, today) {
  const active = new Set(days.filter(isActiveDay).map(d => d.date));
  // A day still in progress shouldn't read as a broken streak, so an unworked
  // today is forgiven — an unworked yesterday is not.
  let cursor = active.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return {
    activeDays: active.size,
    streak,
    tickets: days.reduce((n, d) => n + d.issues.length, 0),
    points: days.reduce((n, d) => n + d.points, 0),
    since: days.length ? days[days.length - 1].date : null,
  };
}

export function toCSV(rows) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(cell).join(',')).join('\n');
}
