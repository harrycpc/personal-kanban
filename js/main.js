import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initSignin, wireSignout } from './auth.js';

const signinEl = document.getElementById('signin');
const appEl = document.getElementById('app');

initSignin();
wireSignout();

onAuthStateChanged(auth, user => {
  if (!user) {
    appEl.hidden = true;
    signinEl.hidden = false;
    return;
  }
  document.getElementById('nav-avatar').src = user.photoURL || '';
  document.getElementById('menu-email').textContent = user.email || '';
  signinEl.hidden = true;
  appEl.hidden = false;
});
