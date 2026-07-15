# Personal Kanban

A free, JIRA-style kanban board. Anyone with a Google account who opens the
app gets their own private board. Vanilla JS + Firebase, no build step.

## One-time Firebase setup (owner only)

1. Go to https://console.firebase.google.com → **Add project** → name it
   `personal-kanban` → disable Google Analytics → Create.
2. **Authentication** → Get started → Sign-in method → enable **Google**
   → set a support email → Save.
3. **Firestore Database** → Create database → Start in **production mode**
   → pick a region close to you (e.g. `australia-southeast1`) → Enable.
4. Firestore → **Rules** → replace with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
         match /{document=**} {
           allow read, write: if request.auth != null && request.auth.uid == uid;
         }
       }
     }
   }
   ```

   → Publish.
5. Project overview → **Add app** → Web (</>) → nickname `personal-kanban`
   → don't tick hosting → Register. Copy the `firebaseConfig` values into
   `firebase-config.js` in this repo.
6. After deploying to GitHub Pages: Authentication → Settings →
   **Authorized domains** → Add domain → `harrycpc.github.io`.

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(`localhost` is already an authorized domain for Google sign-in.)

## Tests

```sh
node --test tests/
```

## Deploy

Push to `main` on GitHub; the site is served by GitHub Pages from the
branch root at https://harrycpc.github.io/personal-kanban/.
