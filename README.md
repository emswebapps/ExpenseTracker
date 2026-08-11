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
- Defaults and on/off switches live in **Settings → Notifications → To-Do Lists**.

Delivery is handled by the `todoReminders` Cloud Function, which runs every
minute and sends through FCM. In-app timers cover the case where the app is
already open; both use the same notification tag, so the phone only ever shows
one alert per reminder.

## Today view, ordering, and repeating tasks

- **Today tab** — at the top of Lists, a *Today* tab gathers everything overdue
  or due today from every to-do and work list into one screen, with tomorrow's
  work collapsed underneath. Its count badge turns red as soon as anything is
  late. The tab appears only when something is actually due.
- **Ordering** — tasks sort by urgency rather than by when they were typed:
  unfinished before done, overdue before dated before undated, soonest first.
  Finished tasks drop to the bottom, most recently ticked off at the top.
  *Existing lists will re-order the first time you open them.*
- **Stars** — the ☆ on a task marks it important. A star lifts a task within
  its group but never above something that's genuinely overdue.
- **Typing a date** — the quick-add box reads a trailing date phrase, so
  "trash out tomorrow 7pm" becomes a task called *trash out*, due tomorrow at
  7 PM. It understands today/tonight/tomorrow, weekday names, "next friday",
  "in 3 days", "8/14" and "aug 14". Only a phrase at the *end* of the line
  counts, so "call the tomorrow people" is left alone.
- **Add task with details** — in a list's ⋮ menu, for a new task that needs
  notes, an address, photos or a reminder set up front.
- **Repeat** — a task can repeat daily, weekly or monthly (every N of those).
  Ticking it off creates the next occurrence, skipping past any that were
  missed, so a chore ignored for three weeks gives you one upcoming task
  rather than three overdue ones. Notes, address, star and reminder carry
  over; photos don't, since a receipt belongs to the occurrence it came from.
- **Elsewhere in the app** — tasks now show up in global **Search** (by name,
  notes or address; tapping a hit opens its list), and a **Tasks** tile on the
  Dashboard lists what's overdue or due today. Turn the tile off under
  *Customize Dashboard*.

## Addresses & photos on to-do items

Tap a task on a to-do or work list to open it — alongside notes and the due
date there's now an **Address** and a **Photos** section.

- **Address** — type or paste where the task happens. It shows on the task row
  under a 📍 pin; tapping it hands off to **Apple Maps** on iPhone, iPad and
  Mac, and to Google Maps everywhere else. The address also travels with the
  list when you share it as a text message, and shows on a shared view link.
- **Photos** — attach receipts, screenshots, a picture of the part you need.
  *Camera* goes straight to the phone camera, *Choose* picks from the photo
  library (several at once). Uploads save to the task as soon as they finish,
  so nothing is lost if you close the editor.
- Thumbnails appear right on the task row — tap one for a full-screen viewer
  with swipe-through arrows and a link to the original. Deleting a task (or its
  list) removes its photos from storage too.

Files live in Firebase Storage under `users/<uid>/todos/<taskId>/`, so the same
10 MB per-file limit and owner-only access rules apply as everywhere else.

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

## Tests

```bash
npm run test:unit          # front-end logic, via node --test — no extra deps
npm --prefix functions test  # Cloud Function reminder selection
```

`test:unit` covers the pure pieces of the to-do list: task ordering
(`src/pages/lists/taskSort.js`), the Today view's grouping (`agenda.js`),
repeat scheduling (`recurrence.js`) and quick-add date parsing
(`src/utils/parseTaskInput.js`). These modules deliberately import only from
`src/utils/dueDates.js` and `helpers.js`, both free of the Firebase SDK, which
is what lets plain Node run them. They use explicit `.js` extensions in their
imports for the same reason.
