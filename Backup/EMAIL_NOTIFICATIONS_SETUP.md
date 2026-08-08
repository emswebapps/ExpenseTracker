# Email Notifications Setup — ExpenseTracker

This guide turns on **email notifications** using Firebase's official
**Trigger Email from Firestore** extension, sending through your **IONOS**
mailbox (`eliascaldwell@emslearn.org`).

Once configured, the app emails you:

- **Ahead of a dated task's due moment** — on to‑do *and* work lists, but only if
  it still isn't marked complete. The lead is yours to pick (at the due time up
  to a day before, default one hour). (`todoReminders` Cloud Function, runs
  every minute.)
- **A daily digest** covering bills due today, overdue bills, bills due
  tomorrow, expiring commitments, goal target dates, project dates, and the
  work‑log reminder. It goes out at the time set in **Settings → Notifications →
  Daily Summary** (default 8:00 AM), in your own time zone, and each section can
  be included or excluded individually. (`dailyNotifications` Cloud Function,
  ticks every 15 minutes and sends each account once per local day.)

Email is its own channel, not a mirror of push: **Settings → Email
Notifications** decides what reaches the inbox independently of the push
toggles, so a category can be emailed without buzzing the phone, or the reverse.

---

## How it works (architecture)

```
Cloud Function  ──writes──▶  Firestore `mail` collection  ──▶  Trigger Email
(dailyNotifications /                                            extension
 todoReminders)                                                    │
                                                                   ▼
                                                          IONOS SMTP (465/SSL)
                                                                   │
                                                                   ▼
                                                             your inbox
```

- Our Cloud Functions add a document to a Firestore collection named **`mail`**.
- The **Trigger Email** extension watches that collection and sends each new
  document as an email through IONOS.
- Clients can't write to `mail` (Firestore rules don't grant it), so nothing but
  our server code and the extension can send mail.

---

## 1. Prerequisites

- **Firebase Blaze (pay‑as‑you‑go) plan** — required for Cloud Functions and for
  installing extensions. The free tiers are generous; this app's volume is tiny.
- Access to the **IONOS mailbox** `eliascaldwell@emslearn.org` and its password.
- Firebase project: **`billtracker-256ef`** (the live project).

---

## 2. IONOS SMTP settings

Use these values wherever an SMTP server is requested.

| Setting            | Value                                              |
|--------------------|----------------------------------------------------|
| SMTP host / server | `smtp.ionos.com`                                   |
| Port (recommended) | `465` (implicit SSL/TLS)                           |
| Alt. port          | `587` (STARTTLS)                                    |
| Security           | SSL/TLS on 465, STARTTLS on 587                    |
| Username           | `eliascaldwell@emslearn.org` (the **full** address)|
| Password           | your IONOS mailbox password                        |
| From address       | `eliascaldwell@emslearn.org`                       |

> IONOS requires the **From** address to match the authenticated mailbox, so
> keep the default From as `eliascaldwell@emslearn.org`. Our code does not set a
> custom From — it relies on the extension's default. That's also why changing
> the sending mailbox means changing three things together: the URI username,
> the password secret, and the Default FROM.

> **Sender vs recipient.** This whole section is about the mailbox reminders are
> sent *from* — the "from" line in your inbox. Where they *arrive* is a separate
> setting inside the app (**Settings → Email Notifications → Send emails to**),
> and it can be any address at all. The two don't have to match, and changing
> where mail lands never requires touching Firebase.

**SMTP connection URI** (note the `@` in the username is URL‑encoded as `%40`):

```
smtps://eliascaldwell%40emslearn.org@smtp.ionos.com:465
```

Leave the password **out** of the URI — you'll supply it as a separate secret
(next step). If you prefer STARTTLS on port 587 instead, use:

```
smtp://eliascaldwell%40emslearn.org@smtp.ionos.com:587
```

---

## 3. Install the Trigger Email extension

1. In the Firebase console open **Extensions** → **Explore extensions**.
2. Find **Trigger Email from Firestore** (publisher: Firebase) → **Install**.
3. Select project **`billtracker-256ef`**. Approve enabling any APIs it asks for.
4. Set the configuration parameters:

| Parameter                              | Value                                                   |
|----------------------------------------|---------------------------------------------------------|
| **SMTP connection URI**                | `smtps://eliascaldwell%40emslearn.org@smtp.ionos.com:465` |
| **SMTP password** (secret)             | your IONOS mailbox password                             |
| **Email documents collection**         | `mail`                                                   |
| **Default FROM address**               | `eliascaldwell@emslearn.org`                             |
| **Default REPLY‑TO address** (optional)| `eliascaldwell@emslearn.org`                             |
| **Users collection** (optional)        | *leave blank*                                            |
| **Templates collection** (optional)    | *leave blank*                                            |
| Cloud Functions location               | same region as Firestore (`us‑central1`)                |

5. Click **Install extension** and wait for it to finish (a few minutes).

> The **collection name must be exactly `mail`** — that's what the Cloud
> Functions write to (see `MAIL_COLLECTION` in `functions/index.js`). If you pick
> a different collection, change that constant to match and redeploy.

---

## 4. Google Cloud APIs to enable

Installing the extension and deploying the functions enables most of these
automatically, but if a deploy fails with a "…API has not been used / is
disabled" error, enable the named API in the Google Cloud console
(**APIs & Services → Library**) for project `billtracker-256ef` and retry.

**For the Trigger Email extension:**

- Cloud Functions API (`cloudfunctions.googleapis.com`)
- Cloud Firestore API (`firestore.googleapis.com`)
- **Secret Manager API** (`secretmanager.googleapis.com`) — stores the SMTP password
- Eventarc API (`eventarc.googleapis.com`)
- Cloud Run Admin API (`run.googleapis.com`)
- Artifact Registry API (`artifactregistry.googleapis.com`)
- Cloud Build API (`cloudbuild.googleapis.com`)
- Cloud Pub/Sub API (`pubsub.googleapis.com`)
- Firebase Extensions API (`firebaseextensions.googleapis.com`)

**For our scheduled Cloud Functions (`dailyNotifications`, `todoReminders`):**

- Cloud Functions API (`cloudfunctions.googleapis.com`)
- Cloud Build API (`cloudbuild.googleapis.com`)
- Artifact Registry API (`artifactregistry.googleapis.com`)
- Cloud Run Admin API (`run.googleapis.com`)
- Eventarc API (`eventarc.googleapis.com`)
- **Cloud Scheduler API** (`cloudscheduler.googleapis.com`) — runs them on a timer
- Cloud Pub/Sub API (`pubsub.googleapis.com`)
- Cloud Logging API (`logging.googleapis.com`)
- **Identity Toolkit API** (`identitytoolkit.googleapis.com`) — lets the function
  look up an account's login email as the fallback recipient (Firebase Auth;
  normally already enabled)

No billing surprises: these all sit inside the Blaze free tier for this app.

---

## 5. Deploy the updated Cloud Functions

The email logic lives in `functions/index.js`, and none of it exists on the
server until it's deployed.

**Preferred — from the browser.** Set up the deploy credential once, following
`FUNCTIONS_DEPLOY_SETUP.md`, then run the **Deploy Cloud Functions** workflow
from the repository's **Actions** tab. After that it deploys itself whenever
`functions/` changes on `main`, and no terminal is ever needed again.

**Or from a terminal**, if you'd rather not set up the credential:

```bash
cd /path/to/ExpenseTracker/functions
npm install
cd ..
firebase deploy --only functions
```

No local machine? **Google Cloud Shell** (the terminal icon in the Cloud
console) is a browser terminal that's already signed in as you and has the
Firebase CLI installed — the same commands work there, minus `firebase login`.

Verify in **Firebase console → Functions** that `dailyNotifications` and
`todoReminders` are listed and healthy.

---

## 6. Turn it on in the app

1. Open the app → **Settings → Email Notifications**.
2. Toggle **Send notifications by email** on.
3. Optionally enter a **Send emails to** address. Leave it blank to use your
   account's login email.
4. Under **Task Due Emails**, choose how far ahead of a task's due moment the
   email goes — at the due time, or up to a day before.
5. Under **Daily Email Digest**, tick the sections you want in the once-a-day
   email: bills, commitments, goals, projects, work log. Anything unticked is
   left out of the email even if it still notifies your phone.
6. To move the digest, set **Settings → Notifications → Daily Summary → Send my
   daily reminders at**. That one time governs both the daily push batch and the
   daily email, in your own time zone.
7. That's it — the settings sync to Firestore, and the Cloud Functions read them
   on their next run.

> **Recipient resolution:** the function uses the address you type in Settings;
> if that's blank it falls back to the account's Firebase Auth login email.
>
> **Timing precision:** `dailyNotifications` ticks every 15 minutes, so the
> digest lands on the first tick at or after your chosen time. A time later than
> 23:45 is treated as 23:45, since there's no tick after that in the local day.

---

## 7. Firestore security (already correct)

The `mail` collection lives at the database root and is **not** covered by any
`allow` rule in `firestore.rules`, so client apps can't read or write it. The
extension and the Cloud Functions use the Admin SDK, which bypasses rules. No
rule changes are needed. (Do **not** add a public rule for `mail` — that would
let anyone queue outbound email.)

---

## 8. Test & troubleshoot

### Nothing is arriving — which half is broken?

Email needs two independent pieces, installed in two different places. Either
one missing means silence, and the symptom is identical, so find out which half
you have before changing anything:

1. **The sender** — the Cloud Functions (`dailyNotifications`, `todoReminders`,
   `sendTestEmail`) that write documents into the `mail` collection.
   Check: **Firebase console → Functions**. If those three are not listed, they
   are not deployed, and no reminder can ever be queued. Fix it in
   `FUNCTIONS_DEPLOY_SETUP.md` — and check the **Deploy Cloud Functions** run in
   the repo's Actions tab, because a red run there is the usual reason they are
   missing.
2. **The deliverer** — the Trigger Email extension, which watches `mail` and
   sends over SMTP. Check: **Firebase console → Extensions**.

The quick test below isolates the deliverer on its own: it puts a document in
`mail` by hand, so it passes whenever the extension works — *even when no
function is deployed*. That is the point of it. A passing manual test plus no
reminders means the sender is the missing half.

The **Send test email** button in Settings → Email Notifications tests the whole
chain instead, because it goes through the deployed function. If it reports that
it couldn't reach the function, that is the sender half being absent, stated
plainly.

**Quick end‑to‑end test** — in the Firestore console, manually add a document to
the `mail` collection:

```json
{
  "to": ["you@example.com"],
  "message": { "subject": "IONOS test", "text": "Hello from ExpenseTracker" }
}
```

Within a few seconds the extension adds a `delivery` field to that document.
`delivery.state` should read `SUCCESS`. If it says `ERROR`, `delivery.error`
explains why.

**Common issues**

| Symptom                                  | Fix                                                                 |
|------------------------------------------|---------------------------------------------------------------------|
| `delivery.state = ERROR`, auth failed    | Check the SMTP password secret and that the username is the full address |
| `ERROR`, "from address not allowed"      | Default FROM must be `eliascaldwell@emslearn.org` (the IONOS mailbox) |
| Connection timeout                       | Try port `587` with the `smtp://…:587` URI (STARTTLS)               |
| No `delivery` field ever appears         | Collection name mismatch — extension and code must both use `mail`  |
| Manual `mail` doc sends, but reminders never do | The functions aren't deployed — see "which half is broken?" above |
| No emails from the functions             | Confirm email is toggled on in Settings and a recipient resolves     |
| To‑do email never arrives                | It only sends while the item is still **pending** an hour before due |

Extension send logs: **Firebase console → Functions → `ext-firestore-send-email-…`
→ Logs**.

---

## Quick Reference

```
Extension:        Trigger Email from Firestore (firebase/firestore-send-email)
Mail collection:  mail
SMTP host:        smtp.ionos.com
SMTP port:        465 (SSL)  |  587 (STARTTLS)
SMTP user:        eliascaldwell@emslearn.org
Default FROM:     eliascaldwell@emslearn.org
Connection URI:   smtps://eliascaldwell%40emslearn.org@smtp.ionos.com:465
Functions:        dailyNotifications (digest, every 15 min, per-user send time)
                  todoReminders (task due emails, every minute)
Toggle:           Settings → Email Notifications
```
