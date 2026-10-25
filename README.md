# מרחב הלמידה המשותף · יד הנדיב × MindCET

Live site: https://yad-hanadiv-study.mindcet.io

The page itself (`site-src/index.html`) is the same file that runs as a Claude Artifact. On the live site,
`live/shim.js` provides the `window.claude.use("db" | "user" | "assets")` API it expects, backed by Firebase
(Google sign-in, Firestore, Storage). `scripts/build.mjs` produces `dist/`, which GitHub Actions deploys to Pages
on every push to `main`.

## Layout
- `site-src/index.html`: page source, synced from the artifact.
- `live/config.js`: public Firebase web config. `live/shim.js`: the adapter.
- `firestore.rules`, `storage.rules`: access rules (paste into the Firebase console, or `firebase deploy --only firestore:rules,storage`).
- `seed/`: content exported from the artifact. A facilitator signing in to an empty site is offered a one-click import.

## Roles
- Anyone signed in with Google can view and add materials, reading recommendations, insights and feedback, and edit or delete their own.
- Facilitators: add a document with the person's lower-case email as its id to the `facilitators` collection (Firestore console). They edit the home page and session content, mark materials official, manage everything, and read all feedback.

## One-time setup
1. Firebase: create a project, add a Web app, copy its config into `live/config.js`.
2. Authentication → Sign-in method → enable Google. Settings → Authorized domains → add `yad-hanadiv-study.mindcet.io`.
3. Firestore: create the database (production mode), then publish `firestore.rules`.
4. Storage: upgrade to Blaze, create the default bucket, then publish `storage.rules`.
5. Firestore → `facilitators/{email}`: add the facilitators.
6. GitHub → Settings → Pages → Source: GitHub Actions. Custom domain: `yad-hanadiv-study.mindcet.io`, Enforce HTTPS.
7. DNS at mindcet.io: `CNAME yad-hanadiv-study → mindcet-dev.github.io`.

## Local test
`firebase emulators:start --project demo-yad`, then `node scripts/build.mjs && node scripts/e2e.cjs` (needs `playwright` and `firebase` from npm).
