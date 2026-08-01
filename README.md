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

## Work schedule → Outlook / Apple Calendar

Once your hours are logged, the shifts can go straight onto your phone's
calendar so it reminds you before each one.

- **Where** — *Work Time → Hours → Add to Calendar*, or *Settings → Export Data
  → Shifts to Calendar*.
- **What you pick** — which job, which shifts (upcoming, this month, next 90
  days, all, or a custom range) and how long before each shift you want the
  alert (none, at start, 15 min … 2 hr). A shift that already has its own
  *Shift Reminder* switched on keeps that offset.
- **How it lands** — on a phone the button opens the share sheet, so you can
  send it to Calendar/Outlook and tap **Add All**. On desktop it downloads an
  `.ics` file: Apple Calendar and Google Calendar open it directly, Outlook
  imports it from *File → Open & Export → Import/Export → Import an iCalendar
  (.ics) file*.

Shifts with start and end times become timed events (anchored in UTC, so the
time is right in any calendar app) with a `VALARM` for the reminder. Shifts
logged as hours only become all-day events — with no start time there's nothing
to alert against. Each event's ID is derived from the shift, so re-exporting
after you edit your hours updates the events already on the calendar rather than
duplicating them.

The calendar alert is separate from the app's own push notifications — it's the
phone's calendar doing the reminding, so it works even without push set up.

```bash
npm test    # unit tests for the .ics builder
```

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
