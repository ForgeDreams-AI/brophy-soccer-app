# Deploy Plan — Brophy Soccer (for the deploying agent)

You are deploying PR #1 (branch `claude/full-app-walkthrough-audit-ytqu45`) of `ForgeDreams-AI/brophy-soccer-app` to the Firebase project **`brophy-soccer-app`**.

- Follow the steps **in order**.
- Stop and report if any check fails. Do not skip a step or improvise around a failure.
- Every command runs from `teamhub/` unless it says otherwise.

## 0. What you need

| Need | Check |
|---|---|
| Node 22+, npm, Java 21 (for the rules tests) | `node -v`, `java -version` |
| Firebase CLI logged in as an **owner/editor** of `brophy-soccer-app` | `npx -y firebase-tools@14 login` then `npx -y firebase-tools@14 projects:list` shows `brophy-soccer-app` |
| gcloud logged in with the same account | `gcloud auth login` then `gcloud config set project brophy-soccer-app` |
| Application Default Credentials (for the migration script in step 8) | `gcloud auth application-default login` |
| The project is on the **Blaze** plan (Cloud Functions need it) | Firebase console → Usage and billing |

## 1. Get the code and verify it

```bash
git fetch origin claude/full-app-walkthrough-audit-ytqu45
git checkout claude/full-app-walkthrough-audit-ytqu45
cd teamhub
npm ci && (cd functions && npm ci)
npm run lint                 # must print no errors
npm run build                # must succeed
npm test                     # Vitest: all pass
(cd functions && npm test)   # node --test: all pass
npm run test:rules           # emulators: all pass (62 tests at time of writing)
```

**Stop if anything fails.**

## 2. Back up Firestore (rollback safety)

```bash
gcloud firestore export gs://brophy-soccer-app.firebasestorage.app/backups/$(date +%Y%m%d-%H%M) --project brophy-soccer-app
```

Wait until it reports success. Note the backup path in your report.

## 3. Deploy security rules (Firestore + Storage)

```bash
npx -y firebase-tools@14 deploy --only firestore:rules,storage --project brophy-soccer-app
```

Expect "Deploy complete!".

What changes:
- Sign-up is invite-only, enforced server-side.
- The drill library becomes signed-in-only.
- Poll votes become private.
- Coaches can no longer edit other users' profiles.
- Team-scoped settings, plus tighter Storage paths.

## 4. Deploy indexes, then WAIT

```bash
npx -y firebase-tools@14 deploy --only firestore:indexes --project brophy-soccer-app
```

1. If the CLI asks whether to **delete indexes that aren't in the file**, answer **yes**. They are dead indexes for removed features (`nutritionTargets`, `attendance`, `attendanceReasons`, `scheduled.runAt`, `users.firstName`).
2. Poll until every composite index is `READY`:
   ```bash
   gcloud firestore indexes composite list --project brophy-soccer-app --format="table(name.basename(),state)"
   ```
3. **Do not continue until none are `CREATING`.** The new chat window query and the scheduler queries fail without them.

## 5. Deploy Cloud Functions

```bash
npx -y firebase-tools@14 deploy --only functions --project brophy-soccer-app
```

- If asked to **delete `sendPushNotification`**, answer **yes**. It was replaced and is unused.
- New functions:
  - `onPushNotificationCreated`: instant "Send now".
  - `onPollVoteWritten`: private poll tallies.
- Changed function: `runScheduled` (bounded queries, once-a-day wellness pass, retry cap).
- Check: `npx -y firebase-tools@14 functions:list --project brophy-soccer-app` lists 10 functions, including `onPushNotificationCreated` and `onPollVoteWritten`, and not `sendPushNotification`.

## 6. Turn on Storage CORS (fixes blank pictures in practice PDFs)

```bash
gcloud storage buckets update gs://brophy-soccer-app.firebasestorage.app --cors-file=cors.json
```

Verify the header now appears. Take any drill image URL, for example from the Firebase console → Storage → `drills/` → a file → "Access token" link:

```bash
curl -s -o /dev/null -D - -H "Origin: https://brophysoccer.forgedreams.ai" "<that download URL>" | grep -i access-control-allow-origin
```

**Expected:** `access-control-allow-origin: *`. Before this step there is no such header, which is exactly why PDF pictures came out blank.

## 7. Audit existing org admins (the old rules let anyone self-promote)

1. Firebase console → Firestore → `users` → filter `role == orgAdmin`.
2. **List every result in your report (name + email). Do not change anything.** Batman confirms which ones are legitimate.

## 8. Migrate old poll votes to private

```bash
cd functions
GOOGLE_CLOUD_PROJECT=brophy-soccer-app node scripts/migrate-poll-votes.js --dry-run
GOOGLE_CLOUD_PROJECT=brophy-soccer-app node scripts/migrate-poll-votes.js
cd ..
```

- The script reports how many votes and polls it moved. It is idempotent: a second run moves 0.

## 9. Deploy the website (frontend)

The repo has **two** possible Cloudflare setups, and it isn't known which one serves `BrophySoccer.forgedreams.ai`. Find out first:

1. Check the Cloudflare dashboard → Workers & Pages → find the project for `BrophySoccer.forgedreams.ai`.
2. **Food-search key (both hosting types).** The USDA key used to ship inside the public app, so treat the old one as leaked:
   - Get a **new** free key at https://fdc.nal.usda.gov/api-key-signup.html.
   - Store it **server-side only** (step 3 or 4 below).
   - **Remove** any `VITE_USDA_API_KEY` build variable from Cloudflare.
3. **If it is a Pages project connected to Git:**
   - In Pages → Settings → Environment variables, delete `VITE_USDA_API_KEY` and add **`USDA_API_KEY`** as an *encrypted secret* (Production + Preview).
   - Then merge PR #1 into `main` on GitHub. Pages builds and deploys automatically (build command `npm run build`, output `dist`, root `teamhub`).
   - The build emits `dist/_worker.js`, so Pages also serves `/api/usda` and `/api/img`.
4. **If it is a Worker (`brophy-soccer-app`, using `wrangler.toml`):** merge PR #1, then from `teamhub/` run:
   ```bash
   npx -y wrangler@3 secret put USDA_API_KEY      # paste the NEW key when prompted
   npm run build && npx -y wrangler@3 deploy
   ```
5. Check food search: open `https://brophysoccer.forgedreams.ai/api/usda?q=chicken` in a browser.
   - **Expected:** JSON with `foods`.
   - `{"error":"USDA search is not configured"}` means the secret is missing.
   - `{"error":"forbidden"}` from curl is expected. The route only answers same-site browser requests.
6. Report which hosting type it was.

## 10. Smoke test (production)

Use real accounts, or ask Batman/Anthony to do these. Record pass/fail for each:

1. **Uninvited Google account:** sign-in is refused with "isn't on the team roster".
2. **Invite link:** a new player signs up via `/?invite=CODE` and lands on the right team; the link's uses go up by 1.
3. **Coach → Home → Send notification → Send now:** the push arrives within a few seconds.
4. **Chat:** send a message; it appears for a teammate; the box grows to 5 lines then scrolls.
5. **Poll:** a player sees totals only; the coach's "See who voted" lists names.
6. **Practice → Export / PDF:** drill pictures appear in the PDF.
7. **Diagram board:** Neutral player, Blank field, Sections (cols × rows), Line / Dashed line all work and save.
8. **E-signature:**
   - The coach uploads a test document.
   - A player opens it, types their name, draws a signature, ticks the agreement and taps Sign.
   - The coach's "Who" list shows the name, email, time and signature image, and "Download signature log (CSV)" works.
   - The player can't sign twice.
9. **Train → Documents:**
   - A coach shares a PDF ("All teams", Notify on) and a Google Drive link ("<team> only").
   - Players get the push and can open the PDF.
   - A player on another team doesn't see the team-only link, and players have no Share button.
10. **Food search:** typing "chicken" in the food log shows USDA results, not only packaged products.
11. **Wellness check-in after 5 PM Arizona time:** it shows on the coach's list for *today*.
12. **The Drill Library website** (`brophy-drill-library.web.app`) still loads drills for a **signed-in** user. Drills are no longer public. If the site shows drills before sign-in, it needs a sign-in gate; report it.

## 11. Shrink the git repository (DESTRUCTIVE — get Batman's explicit "go" first)

**What this does and why:**
- About 89 MB of intermediate WAV audio was committed in `videos/walkthrough/`. PR #1 removes it from the files and gitignores it, but it is still in the git **history**, so every clone downloads it (`.git` is about 57 MB).
- Removing it from history rewrites every commit hash and needs a **force-push to all branches**. Every collaborator must re-clone afterwards.
- The audio isn't lost. Each WAV has an MP3 next to it, and `videos/walkthrough/README.md` has the commands to rebuild them.

**Do it only after:**
- PR #1 is merged.
- No other PRs are open, or their authors have agreed to re-create them.
- Batman has said "go".

1. **Full backup first:**
   ```bash
   git clone --mirror https://github.com/ForgeDreams-AI/brophy-soccer-app.git brophy-backup-$(date +%Y%m%d).git
   ```
   Keep this folder until everyone confirms things are fine. It is a complete copy, including the WAVs.
2. **Rewrite:**
   ```bash
   pip install git-filter-repo
   git clone https://github.com/ForgeDreams-AI/brophy-soccer-app.git brophy-clean && cd brophy-clean
   git fetch origin '+refs/heads/*:refs/remotes/origin/*'
   for b in $(git branch -r | grep -v HEAD | sed 's#origin/##'); do git branch -f "$b" "origin/$b"; done
   git filter-repo --force --path-glob 'videos/walkthrough/*.wav' --path-glob 'videos/walkthrough/sections/*.wav' --invert-paths
   git count-objects -vH   # size-pack should now be ~10 MB
   ```
3. **Push the rewritten history.** If GitHub branch protection blocks force-pushes to `main`, a repo admin must allow them temporarily.
   ```bash
   git remote add origin https://github.com/ForgeDreams-AI/brophy-soccer-app.git
   git push --force --all origin && git push --force --tags origin
   ```
4. **Tell everyone (Anthony, any agents) to delete their local copy and re-clone.** Pulling into an old clone would bring the WAVs back.
5. GitHub keeps unreferenced objects for a while. For immediate removal, ask GitHub Support to run garbage collection on the repo.
6. Report the before/after `size-pack`.

## Rollback

- **Rules:**
  ```bash
  git checkout fda7cbc -- firestore.rules storage.rules
  npx -y firebase-tools@14 deploy --only firestore:rules,storage --project brophy-soccer-app
  ```
  Then `git checkout -- .` to restore the files.
- **Functions:** redeploy from the previous commit (`git checkout fda7cbc -- functions && npx -y firebase-tools@14 deploy --only functions`).
- **Data:** `gcloud firestore import <backup path from step 2>`. This is a last resort, because it overwrites changes made since the backup.
- **Frontend:** in Cloudflare Pages, "Rollback to this deployment" on the previous build. For a Worker, use `npx wrangler rollback`.

## Report back

For each step, give:
- the step number
- ✅ or ❌
- any output that matters, including:
  - the backup path
  - the index states
  - the function list
  - the CORS header
  - the migration counts
  - the hosting type
  - the org-admin list
  - the smoke-test results
