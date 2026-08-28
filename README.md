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

## Crash Protocol

A step-by-step tool for the hours after stimulant medication wears off, when
emotional reactions get loud enough to feel like facts. Its job is narrow: keep
a temporarily dysregulated nervous system from making permanent decisions.

Open it from the **Crash** tab, the **I'm crashing** tile on the Dashboard, or
`/crash`. One tap starts a 30-minute session and walks seven steps:

1. **What's happening** — tap the warning signs that fit, pick a feeling, rate
   it 0–10. No typing.
2. **Tell him** — the pre-agreed message, with variants you can edit and send
   by share sheet, text or clipboard. Every built-in variant promises a return,
   because a timeout without one is stonewalling; `message.test.js` enforces it.
3. **Facts vs. story** — two lists, *what I know* and *what my brain is telling
   me*. The second column is labeled, never argued with.
4. **How big is this** — "this is an 8; do you want to make an 8-out-of-10
   decision about your marriage?"
5. **The tomorrow test** — two questions. Any wobble opens escrow: the text you
   were about to send gets held until 9 AM instead, under a DO NOT SEND banner
   with no send button.
6. **Change something** — a pre-decided menu, filtered by how you said it
   feels. *Rejected* opens your anchors; *about to send a text* opens escrow.
7. **Where are you now** — rate it again, say whether it still needs talking
   about. "Still matters" is treated as a real answer, not a failure.

Supporting pieces:

- **Anchors** — a private locker of screenshots, photos and notes to yourself,
  for the nights you can't retrieve a single counter-example. Files live in
  Firebase Storage under `users/<uid>/crash/<anchorId>/`.
- **Held** — everything in escrow, with what's been released this morning.
- **What usually happens** — the point of the whole thing: your own record
  showing how often the 30 minutes changed the answer. Hidden until there are
  three sessions, since a thin number reads as discouraging.
- **My kit** — warning signs, the agreed phrase, timer length, and whether to
  get a buzz when time is up. Set this up on a day you feel fine.

### Dose timing and the predicted window

The crash is a schedule, not a surprise. Log when you took your meds — one tap
at the top of the Crash tab, time editable — and the app shows tonight's likely
window on a small timeline, and pushes a heads-up about half an hour before it
opens, while there's still time to finish a hard conversation.

Onset and duration default to 4 hours and 5 hours and are editable in **My
Kit**. Once there are five or more dose-and-crash pairs, *What usually happens*
works out your real number from your own record — "your last 8 crashes started
about 4h 20m after your dose" — and offers to use it. It never changes the
setting on its own.

**The app never advises on medication.** It does arithmetic on a time you
entered and shows you the result. There is no dose reminder, no adherence
tracking and no missed-dose guilt; with nothing logged, the feature says
nothing at all.

### What he needs to know

A message in **My Kit** to send him once, on a good day, explaining what the
phrase means, that you're coming back, and — the part he otherwise has to guess
— that checking in, following you or trying to fix it makes a crash louder.
This is what lets the in-the-moment message afford to be four words long.
Nothing of yours is shared; it's a message you choose to send.

### What actually helps you

Options in the crash menu are logged alongside the before-and-after numbers, so
after a few weeks the app can say which ones actually move yours. The best one
gets a quiet "usually helps you most" tag; the full ranking is in *What usually
happens*. Tile order never changes — a menu that reshuffles under a
dysregulated thumb is worse than one that doesn't. Nothing is claimed about an
option used fewer than three times.

### Reminders

Two pushes, both from the `crashReminders` Cloud Function so they arrive with
the app closed: the window heads-up, and a nudge the morning after when
something you held in escrow opens. Both are **push only** — never in the email
digest — and neither ever contains a word you wrote, since a lock-screen
preview is visible to whoever is holding the phone. Both are switchable in
My Kit.

There's also a home-screen shortcut: long-press the installed app icon and
"I'm crashing" starts a session directly.

Everything is private to your login and deliberately excluded from global
Search and from shared view links. The timer is stored as an absolute
timestamp and re-syncs on `visibilitychange`, so putting the phone down and
walking the dogs — which step 6 tells you to do — doesn't lose the session.

`test:unit` covers the step machine and timer math (`protocol.js`), the message
builder and its tone checks (`message.js`), the history stats, session pruning
and move ranking (`stats.js`), and the window prediction and onset inference
(`window.js`). `npm --prefix functions test` covers which reminders are due —
including an assertion that no notification body can contain your own words.

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
repeat scheduling (`recurrence.js`), quick-add date parsing
(`src/utils/parseTaskInput.js`) and the Crash Protocol's step machine, message
builder and history stats (`src/pages/crash/`). These modules deliberately import only from
`src/utils/dueDates.js` and `helpers.js`, both free of the Firebase SDK, which
is what lets plain Node run them. They use explicit `.js` extensions in their
imports for the same reason.
