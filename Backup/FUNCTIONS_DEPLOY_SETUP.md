# Cloud Functions Auto-Deploy — One-Time Setup

The web app already deploys itself to GitHub Pages on every push to `main`. The
reminder logic (`dailyNotifications`, `todoReminders`) lives in **Cloud
Functions**, which Pages can't deploy — that's why reminder changes needed a
`firebase deploy` from a terminal.

The **Deploy Cloud Functions** workflow removes that step. It runs the function
unit tests, then deploys, whenever `functions/` changes on `main` — or on demand
from the Actions tab.

It needs one credential, set up once. Everything below happens in a browser.

---

## 1. Create the service account

1. Open the [Google Cloud console](https://console.cloud.google.com) and select
   project **`billtracker-256ef`**.
2. **IAM & Admin → Service Accounts → Create service account**.
3. Name it something obvious, e.g. `github-deployer`. Click **Create and
   continue**.

## 2. Grant it the roles a functions deploy needs

Still in the create flow (or later via **IAM → Grant access**), add these roles.
A deploy touches more services than you'd expect — the function is built, stored,
run, and scheduled — and a missing role shows up as a permission error part-way
through the deploy.

| Role | Why |
|------|-----|
| **Firebase Admin** | Read project config, deploy Firebase resources |
| **Cloud Functions Admin** | Create and update the functions themselves |
| **Service Account User** | Lets the deploy act as the runtime service account |
| **Cloud Build Editor** | Functions are built through Cloud Build |
| **Artifact Registry Administrator** | Where the built container images land |
| **Cloud Scheduler Admin** | Both functions are scheduled, so jobs get created |
| **Eventarc Admin** | Wiring the schedule to the function |
| **Storage Admin** | Build staging bucket |

Click **Done**.

## 3. Download a key

1. Click the new service account → **Keys** tab → **Add key → Create new key**.
2. Choose **JSON**. It downloads a small `.json` file.

> Treat this file as a password — it can deploy to and read your project. Don't
> commit it, don't email it. Delete the download once step 4 is done.

## 4. Put the key in the repository

1. GitHub → the **ExpenseTracker** repo → **Settings → Secrets and variables →
   Actions**.
2. **New repository secret**.
3. Name: **`FIREBASE_SERVICE_ACCOUNT`** — exactly that, it's what the workflow
   reads.
4. Value: the **entire contents** of the JSON file, pasted in — from the opening
   `{` to the closing `}`.
5. **Add secret**.

## 5. Run the first deploy

1. GitHub → **Actions** tab → **Deploy Cloud Functions** in the left sidebar.
2. **Run workflow** → pick `main` → **Run workflow**.
3. Watch it. Green means `dailyNotifications` and `todoReminders` are live.

Confirm in the Firebase console under **Functions** — both should be listed,
with `dailyNotifications` scheduled every 15 minutes and `todoReminders` every
minute.

After this, any change to the reminder logic deploys itself on merge to `main`.

---

## If the deploy fails

The workflow checks the key before it deploys, so most credential problems are
named outright in the log. Read the first `::error::` line — it says what is
wrong with the secret.

| Error | Fix |
|-------|-----|
| `FIREBASE_SERVICE_ACCOUNT is not set` | The secret name is wrong or it's on the wrong repo |
| `secret is not valid JSON` | A partial paste — the value must run from the opening `{` to the closing `}`, with no surrounding quotes |
| `not a service account key` | That's the Firebase *web app* config or a CI token. You want the JSON downloaded in step 3 |
| `private_key is not a usable private key` | The key was mangled (usually newlines stripped). Download a fresh one and paste it unmodified |
| `key belongs to project "…"` | The service account was created in the wrong Google Cloud project |
| `Failed to authenticate, have you run firebase login?` | The key is well-formed but Google rejected it — the key was deleted or disabled, or its service account was removed. Create a new key (steps 1–4) |
| `Permission denied` / `caller does not have permission` | A role from step 2 is missing — the message names the service |
| `API has not been used in project…` | Enable the named API under **APIs & Services → Library**, then re-run |
| Billing errors | Cloud Functions need the **Blaze** plan |

The workflow is deliberately gated on `npm test` in `functions/`, so a failure
there stops the deploy before anything reaches production. That's a real
failure, not a flake — read the test output rather than re-running.

---

## What this does *not* do

It does not install the **Trigger Email from Firestore** extension — that's a
separate one-time job in the Firebase console, covered in
`EMAIL_NOTIFICATIONS_SETUP.md`. Without it the functions will queue email into
the `mail` collection and nothing will ever send it.
