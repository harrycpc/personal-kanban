export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : String(c));
  }
  return node;
}

const modalRoot = () => document.getElementById('modal-root');

export function openModal(node, { dismissable = true } = {}) {
  const overlay = el('div', { class: 'modal-overlay' }, node);
  if (dismissable) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  modalRoot().append(overlay);
  return overlay;
}

export function closeTopModal() {
  modalRoot().lastElementChild?.remove();
}

export function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  document.getElementById('toast-root').append(t);
  setTimeout(() => t.remove(), 4000);
}

export function confirmDialog({ title, message, confirmLabel = 'Delete' }) {
  return new Promise(resolve => {
    const done = v => { overlay.remove(); resolve(v); };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, title),
      el('p', {}, message),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onclick: () => done(true) }, confirmLabel),
      )), { dismissable: false });
  });
}

export function selectEl(options, value) {
  return el('select', {},
    options.map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
}

export function iconEl(svgHtml, title = '') {
  const s = el('span', { class: 'icon', title });
  s.innerHTML = svgHtml;
  return s;
}

const TYPE_SVGS = {
  task: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4BADE8"/><path d="M6.7 11.2 3.8 8.3l1-1 1.9 1.9 4.5-4.5 1 1z" fill="#fff"/></svg>',
  story: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#63BA3C"/><path d="M5 3h6v10L8 10.6 5 13z" fill="#fff"/></svg>',
  bug: '<svg viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E5493A"/><circle cx="8" cy="8" r="3.5" fill="#fff"/></svg>',
};
export function typeIconHtml(type) { return TYPE_SVGS[type] || TYPE_SVGS.task; }

const PRIO_SVGS = {
  highest: ['#CD1316', 'M8 2.5l5.5 5.5H10v5.5H6V8H2.5z'],
  high: ['#E9494A', 'M8 3.5l5.5 6h-11z'],
  medium: ['#EA7D24', 'M3 5.5h10v2H3zm0 3.5h10v2H3z'],
  low: ['#2D8738', 'M8 12.5l-5.5-6h11z'],
  lowest: ['#57A55A', 'M8 13.5L2.5 8H6V2.5h4V8h3.5z'],
};
export function priorityIconHtml(priority) {
  const [color, d] = PRIO_SVGS[priority] || PRIO_SVGS.medium;
  return `<svg viewBox="0 0 16 16" aria-label="${priority}"><path d="${d}" fill="${color}"/></svg>`;
}
