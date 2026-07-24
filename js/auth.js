import { auth, googleProvider } from './firebase.js';
import {
  signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

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
