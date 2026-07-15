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
