import { auth, googleProvider } from './firebase.js';
import {
  signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { el, openModal } from './ui.js';
import { suggestKeyPrefix } from './logic.js';

export function initSignin() {
  const btn = document.getElementById('btn-signin');
  const err = document.getElementById('signin-error');
  btn.addEventListener('click', async () => {
    err.hidden = true;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      if (e.code === 'auth/popup-closed-by-user') return;
      err.textContent = 'Sign-in failed: ' + (e.message || e.code);
      err.hidden = false;
    }
  });
}

export function wireSignout() {
  document.getElementById('btn-signout').addEventListener('click', () => signOut(auth));
}

export function onboardingDialog(defaultName = 'My Kanban') {
  return new Promise(resolve => {
    let prefixTouched = false;
    const name = el('input', { value: defaultName });
    const prefix = el('input', { value: suggestKeyPrefix(defaultName), maxlength: '5' });
    const errEl = el('p', { class: 'form-error', hidden: true });
    prefix.addEventListener('input', () => { prefixTouched = true; prefix.value = prefix.value.toUpperCase(); });
    name.addEventListener('input', () => { if (!prefixTouched) prefix.value = suggestKeyPrefix(name.value); });
    const submit = () => {
      const n = name.value.trim() || 'My Kanban';
      const p = prefix.value.trim();
      if (!/^[A-Z][A-Z0-9]{0,4}$/.test(p)) {
        errEl.textContent = 'Key must be 1–5 characters, start with a letter, A–Z / 0–9 only.';
        errEl.hidden = false;
        return;
      }
      overlay.remove();
      resolve({ projectName: n, keyPrefix: p });
    };
    const overlay = openModal(el('div', { class: 'modal' },
      el('h2', {}, 'Name your project'),
      el('div', { class: 'field' }, el('label', {}, 'Project name'), name),
      el('div', { class: 'field' },
        el('label', {}, 'Key — used for issue IDs like HG-1. Permanent.'), prefix),
      errEl,
      el('div', { class: 'actions' },
        el('button', { class: 'btn btn-primary', onclick: submit }, 'Create project')),
    ), { dismissable: false });
  });
}
