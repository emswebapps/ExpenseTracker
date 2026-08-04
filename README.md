# Budget Tracker

Mobile-first bill and budget tracking app built with React + Vite + Tailwind CSS.

## Features

- Track recurring and one-time bills with paid/unpaid toggle per month
- Payment URL links on each bill — tap **Pay** to go straight to the biller's website
- Monthly income tracking (weekly/biweekly/monthly paychecks, auto-calculates monthly total)
- Dashboard: income vs. bills summary, money left over, paid/unpaid totals
- Discretionary budget entry per month
- Optional spouse/partner income tracking (enable in Settings)
- All data stored in browser localStorage — no account or backend needed
- Mobile-first dark UI, works great on phone, iPad, and desktop
- Add to Home Screen on iOS/Android for an app-like experience

## To-do timers & due dates

To-do items support a due date/time and a countdown timer, both of which push a
notification to your phone even when the app is closed.

- **Due date + time** — set on a task, with an optional lead time ("30 min
  before", "1 day before", …). Turn on *Push notification when due* on the task.
- **Timer** — tap the ⏱ button on any task for a quick countdown (5 min … 2 hr,
  or a custom number of minutes). The remaining time ticks live on the task row.
- **Whole-list reminders** — a list carries its own due date, time and lead time,
  separate from anything set on its items: "shopping Saturday at 10". Set it from
  the list's ⋮ menu → *Remind me*, or in the list editor. It works on every kind
  of list, and it's skipped once every item on the list is finished.
- Defaults and on/off switches live in **Settings → Notifications → To-Do Lists**.

## Attachments, photos & scanning

Lists and the items on them take file attachments, straight from the ⋮ menu
(*Attachments*) on a list, or by tapping an item to open its editor.

- **File** — PDFs, images or Word docs, up to 10 MB each.
- **Photo** — opens the camera on a phone, so a picture of the shelf, the label
  or the receipt lands on the item it belongs to.
- **Scan** — reads the text off a photo on-device (Tesseract), keeps the photo as
  an attachment, and shows the text for correcting. On a list, the scanned text
  can be turned into items in one tap — one per line — so a handwritten list
  becomes a real one without retyping it.

Scanned text is searchable from the box at the top of the Lists page. Files live
in Firebase Storage under `users/{uid}/lists/…`, are deleted along with the list
or item they belong to, and are left out of share-link snapshots.

Delivery is handled by the `todoReminders` Cloud Function, which runs every
minute and sends through FCM. In-app timers cover the case where the app is
already open; both use the same notification tag, so the phone only ever shows
one alert per reminder.

## Push notification setup

Background push needs two things configured:

1. **VAPID key** — in the Firebase Console under *Project Settings → Cloud
   Messaging → Web Push certificates*, generate (or copy) the key pair and take
   the public key. Add it as a repository secret named `VITE_FCM_VAPID_KEY`
   (Settings → Secrets and variables → Actions); the deploy workflow passes it
   into the build. For local dev, put it in a `.env` file:

   ```
   VITE_FCM_VAPID_KEY=<public key>
   ```

   The key is ~87 characters. If it's missing or malformed the app logs a
   warning, falls back to in-app alerts, and Settings says push is unavailable.

2. **Cloud Functions** — requires the Firebase Blaze plan:

   ```bash
   npm --prefix functions install
   npm --prefix functions test     # unit tests for the reminder logic
   firebase deploy --only functions
   ```

On **iPhone**, iOS only delivers web push to apps installed to the Home Screen —
open the site in Safari, *Share → Add to Home Screen*, then enable notifications
from inside the installed app.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
