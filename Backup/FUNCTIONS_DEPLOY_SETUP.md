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
| **Service Usage Admin** | Turns on any of the APIs below that aren't on yet |

Click **Done**.

> **Reusing the Firebase Admin SDK key instead?** Firebase Console → Project
> settings → Service accounts → *Generate new private key* hands you a valid
> service account key in one click, and the workflow accepts it. But that
> account only carries the Admin SDK's own role, so you still have to grant it
> everything in the table above under **IAM & Admin → IAM** — find
> `firebase-adminsdk-…@billtracker-256ef.iam.gserviceaccount.com`, click the
> pencil, and add them. Skipping this fails mid-deploy, not at the credential
> check.

## 2a. Or do steps 2 and 2b in one paste

Nine roles and seven APIs is a lot of clicking, and missing one costs a whole
failed deploy. The same grants are a few `gcloud` lines, and **Cloud Shell** —
the `>_` icon at the top right of the
[console](https://console.cloud.google.com/home/dashboard?project=billtracker-256ef)
— is a browser terminal already signed in as you, with `gcloud` installed.

Open it as a project **owner**, replace `SERVICE_ACCOUNT` with your deploy
account's address, and paste the lot. Everything here is idempotent, so it is
safe to run again if you are not sure what was granted before.

```bash
PROJECT=billtracker-256ef
SERVICE_ACCOUNT=github-deployer@billtracker-256ef.iam.gserviceaccount.com

gcloud services enable \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com \
  cloudscheduler.googleapis.com --project="$PROJECT"

for ROLE in \
  roles/firebase.admin \
  roles/cloudfunctions.admin \
  roles/iam.serviceAccountUser \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.admin \
  roles/cloudscheduler.admin \
  roles/eventarc.admin \
  roles/storage.admin \
  roles/serviceusage.serviceUsageAdmin
do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="$ROLE" --condition=None >/dev/null
done
```

> Reusing the Firebase Admin SDK key? Then `SERVICE_ACCOUNT` is the
> `firebase-adminsdk-…@billtracker-256ef.iam.gserviceaccount.com` address shown
> in the key file's `client_email`, and in the deploy log's preflight output.

When the preflight stops a deploy it prints this same block back at you, already
filled in with your service account and narrowed to only what is actually
missing. Copy it from the failed run's log.

## 2b. Enable the APIs the deploy touches

A deploy calls several Google APIs, and an account without **Service Usage
Admin** cannot switch them on for you — it fails with *"Permissions denied
enabling …"* rather than enabling it and moving on. Granting that role is
enough; turning them on by hand also works, and is quicker than another
round trip through a failed deploy.

Open each and click **Enable** (already-enabled ones say *Manage* instead):

- [Cloud Scheduler](https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=billtracker-256ef)
- [Cloud Functions](https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=billtracker-256ef)
- [Cloud Build](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=billtracker-256ef)
- [Artifact Registry](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=billtracker-256ef)
- [Eventarc](https://console.cloud.google.com/apis/library/eventarc.googleapis.com?project=billtracker-256ef)
- [Cloud Run](https://console.cloud.google.com/apis/library/run.googleapis.com?project=billtracker-256ef)
- [Pub/Sub](https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=billtracker-256ef)

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

The workflow checks two things before it deploys anything, so most failures are
named outright at the top of the log. Read the first `::error::` line.

- **The key itself** — shape, project, whether the private key loads. Catches a
  bad paste without a network call.
- **The project** — a *Preflight the project* step asks Google which of the APIs
  above are switched on and which of the roles in step 2 the account actually
  holds. It prints an `ok`/`X` line per item and, when something is missing,
  the link to fix it. This runs before the source is built, so a project that
  isn't ready fails in seconds with a list rather than part-way through a deploy
  with one service's complaint.

  A disabled API is only fatal when the account also lacks **Service Usage
  Admin**; with that role the deploy switches the API on itself, and the
  preflight says so instead of failing.

If the preflight can't reach Google it warns and lets the deploy proceed — it
will never be the reason a working deploy is blocked.

| Error | Fix |
|-------|-----|
| `FIREBASE_SERVICE_ACCOUNT is not set` | The secret name is wrong or it's on the wrong repo |
| `secret is not valid JSON` | A partial paste — the value must run from the opening `{` to the closing `}`, with no surrounding quotes |
| `not a service account key` | That's the Firebase *web app* config or a CI token. You want the JSON downloaded in step 3 |
| `private_key is not a usable private key` | The key was mangled (usually newlines stripped). Download a fresh one and paste it unmodified |
| `key belongs to project "…"` | The service account was created in the wrong Google Cloud project |
| `Failed to authenticate, have you run firebase login?` | The key is well-formed but Google rejected it — the key was deleted or disabled, or its service account was removed. Create a new key (steps 1–4) |
| `The service account is missing N role(s)` | The preflight caught it before the deploy. Its log ends with a filled-in `gcloud` block — paste that into Cloud Shell, then re-run the workflow |
| `Permission denied` / `caller does not have permission` | A role from step 2 is missing — the message names the service |
| `Permissions denied enabling <api>` | The key is fine; the account can't switch that API on. Enable it from the step 2b list, or grant **Service Usage Admin** |
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
