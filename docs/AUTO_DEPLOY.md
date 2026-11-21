# Auto-deploy setup (one time, about 10 minutes)

After this, the flow is:

1. You tell Claude what to fix.
2. Claude fixes it and opens a PR. The PR gets a **preview link** to try.
3. The PR is merged, and it's **live** at https://brophy-soccer-app.web.app a few minutes later.

No one deploys by hand any more.

The GitHub workflows `.github/workflows/deploy.yml` (deploys on merge) and `preview.yml` (preview link on every PR) need **one secret**: a Google service-account key that lets GitHub deploy to Firebase. You add it in GitHub's settings. It is never pasted in chat and never in the code.

---

## Step 1 — Create the deploy account (Google Cloud)

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=brophy-soccer-app. Sign in as the project owner.
2. Click **+ Create service account**.
   - Name: `github-deploy`, then click **Create and continue**.
3. **Grant this service account access to project.** Add these 4 roles, using **+ Add another role** for each:
   - **Firebase Admin**
   - **Cloud Functions Admin**
   - **Service Account User**
   - **Secret Manager Secret Accessor**
   - **Secret Manager Viewer** (the functions deploy looks the USDA key up before reading it; without this it fails with `secretmanager.secrets.get` denied)

   Click **Continue**, then **Done**.
4. Click the new `github-deploy` account → **Keys** tab → **Add key** → **Create new key** → **JSON** → **Create**.
   - A `.json` file downloads. Treat it like a password.
   - **If Google says key creation is disabled by an organization policy:** stop and tell Claude. There is a keyless way (Workload Identity Federation), and Claude will switch the workflows to it.

## Step 2 — Give it to GitHub

1. Open https://github.com/ForgeDreams-AI/brophy-soccer-app/settings/secrets/actions.
2. Click **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: open the downloaded `.json` file in a text editor, select all, copy, and paste it here.
3. Click **Add secret**, then **delete the downloaded `.json` file** from your computer.

## Step 3 — Two clicks only the Firebase console can do

Open https://console.firebase.google.com/project/brophy-soccer-app.

1. **Push notification key.**
   - Go to ⚙️ Project settings → **Cloud Messaging** → Web configuration → **Web Push certificates**.
   - Copy the **Key pair** value. It is public, so it's fine to paste in the Claude chat.
   - **If none is listed,** click **Generate key pair** first.
   - **If one exists,** use it. Don't generate a new one, because phones already signed up for notifications use it.
2. **Custom domain.**
   - Go to **Hosting** → **Add custom domain** → `brophysoccer.forgedreams.ai`. Leave "redirect" unticked.
   - Claude already set up the Cloudflare side. If Firebase asks for any records other than `A 199.36.158.100` and `TXT hosting-site=brophy-soccer-app`, paste them in the chat.
   - Then go to **Authentication → Settings → Authorized domains → Add** `brophysoccer.forgedreams.ai`.

## Step 4 — Tell Claude

Tell Claude two things:
- "the secret is in"
- the push key

Claude then commits the key and runs the first auto-deploy. Optionally, also say **"you can merge your own PRs once the checks pass"**. Then every fix you ask for goes live without you touching GitHub.

---

## What deploys automatically

On every merge to `main` that touches `teamhub/`:
- lint and tests
- a build (it fails on purpose if the push key is missing)
- Firestore rules and indexes
- Storage rules
- Cloud Functions
- the website

Removed functions are deleted automatically (`--force`).

### Not automatic
- Secret Manager secrets, such as the USDA key. These are set once, by hand.
- One-off scripts such as `functions/scripts/migrate-poll-votes.js`.
- The Drill Library site, which lives in a separate repo. It can get the same setup.
