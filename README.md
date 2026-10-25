# מרחב הלמידה המשותף · יד הנדיב × MindCET

Live site: https://yad-hanadiv-study.mindcet.io (GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`).

The page (`site-src/index.html`) is the same file that runs as the Claude Artifact
(https://claude.ai/artifact/Lwsp7VgTkMt2N4BVoDuQ4g). On the live site, `live/shim.js` provides the
`window.claude.use("db" | "user" | "assets")` API the page expects:

| Need | Service | Plan |
|---|---|---|
| Sign-in (Google) | Firebase Auth, project `yad-hanadiv-study` | Spark (free) |
| Shared data | Cloud Firestore, rules in `firestore.rules` | Spark (free) |
| Uploaded files | Supabase Storage, project `cwavefingrlviboswtya`, public bucket `yad-hanadiv-study` | Free |
| Files migrated from the artifact | Served by Pages from `seed/files/` (`dist/assets-map.js`) | — |

Supabase accepts the Firebase ID token through Third-party Auth, so its storage policies (`supabase/storage.sql`)
know who is uploading. Firebase Storage is not used because it needs the paid Blaze plan.

## Layout
- `site-src/index.html`: page source. The shared source of truth is `/mnt/project-files/site/index.html` in the
  Claude project; copy it here before deploying. Uploaded files must be linked only as
  `"/_blob/" + encodeURIComponent(id)`; `scripts/build.mjs` rewrites those and fails on any other `/_blob/` use.
- `live/config.js`: public Firebase and Supabase config. `live/shim.js`: the adapter, sign-in screen and first-run import.
- `firestore.rules`: Firestore access rules. `supabase/storage.sql`: upload bucket, policies and facilitator table.
- `seed/`: content exported from the artifact (`data.json`) and its PDFs and photos. A facilitator who signs in to an
  empty site is offered a one-click import.
- `scripts/build.mjs`: builds `dist/`. `scripts/e2e.cjs`: end-to-end test against the Firebase emulators.

## Design
Warm paper background `#f5f1e8`, deep green `#0e5446`, terracotta accent `#c2502f`. Rubik (300–900) for headings,
Heebo (300–700) for text. The home page shows the central question as a pull quote and the six sessions as a
timeline with the next one highlighted.

## Roles
- Anyone signed in with Google can view, and add materials, reading recommendations, insights and feedback. They can
  edit or delete only their own items and files; the feedback questionnaire is private to its author.
- Facilitators edit the home page and session content, mark materials official, manage every item, and read all
  feedback. A facilitator can switch to **"לראות כמשתתף"** (view as participant) in the header to see the site
  without facilitator controls; nothing is written in that mode.
- To add a facilitator:
  1. Firestore → collection `facilitators` → document id = their lower-case email (any field).
  2. Supabase SQL Editor (only needed to let them delete other people's files):
     `insert into public.yad_hanadiv_facilitators (email) values ('name@example.com');`

## One-time setup (done on 2026-10-25)
1. Firebase: project `yad-hanadiv-study`, Web app config in `live/config.js`.
2. Authentication → Sign-in method → Google enabled. Authorized domains → `yad-hanadiv-study.mindcet.io`.
3. Firestore (production mode) with `firestore.rules` published.
4. Supabase: Authentication → Third-party Auth → Firebase (`yad-hanadiv-study`), then `supabase/storage.sql` run in the SQL Editor.
5. GitHub → Settings → Pages → Source: GitHub Actions, custom domain `yad-hanadiv-study.mindcet.io`, Enforce HTTPS once the certificate is issued.
6. DNS at mindcet.io: `CNAME yad-hanadiv-study → mindcet-dev.github.io`.

## Local test
`firebase emulators:start --project demo-yad`, then `node scripts/build.mjs && node scripts/e2e.cjs`
(needs `playwright` and `firebase` from npm; set `SB_BUNDLE` to an ESM bundle of `@supabase/supabase-js` to test
uploads against a mocked Storage API).
