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

## Subtasks, sections, and the weekly planner

A task list can be arranged the way a paper week is: a section per week, a
heading per day, and the actual work nested underneath.

- **Subtasks** — any task can hold subtasks, one level deep. They collapse
  behind *Show 3 subtasks*, and the parent shows how many are done. Completing
  a parent closes what's still open under it; re-opening it leaves them alone,
  since the ones you genuinely finished shouldn't come back. Deleting a parent
  deletes its subtasks. A repeating parent takes copies of its subtasks to the
  next occurrence, shifted by the same number of days it moved.
- **Headings** — in a task's ⋯ menu, *Use as a heading* turns it into a label
  for the work under it rather than work itself. A heading reads its date as a
  plain calendar date ("Today", "Tomorrow", "9/7/26") instead of counting down
  to Overdue, is skipped by the Today view and by reminders, and doesn't count
  towards a list's progress. A day that has been and gone is not a task anyone
  failed to do.
- **Sections** — a list can hold sections, shown either stacked or as columns
  you swipe between. Inside a section, tasks run in date order rather than by
  urgency: a section is a list you've already arranged, and re-triaging it
  would split Monday from Tuesday. Deleting a section keeps its tasks — they
  move to *Unfiled*.
- **Weekly planner** — tick it on when creating or editing a to-do or work
  list. It keeps the current week and the next one built: a section named the
  way you'd write it ("September 7th–13th") holding a dated heading per day.
  Choose which day weeks start on, which days to include, and whether the day
  names get 📅 around them. Add your tasks as subtasks under the day they
  belong to.

  It runs when the app opens and again when you come back to it on a new day.
  A week whose section you renamed is never rebuilt, and a week you deleted
  stays deleted rather than growing back tomorrow. *Add another week* in the
  list's ⋮ menu builds one further ahead.

Reminders understand all of this: a push names the heading a task sits under
("Weekly To Do · MONDAY"), day headings never notify, and a list reminder counts
the work under its headings rather than the headings themselves. The daily
summary gained a **Today's plan** entry — one push and one email section with
everything due today and anything overdue, on by default under
*Notifications → To-Do & Work Lists*.

## Sharing a list with someone

A list can be handed to someone who doesn't have the app at all. Their ⋮ menu →
*Share with someone…* creates a link like
`https://…/ExpenseTracker/list/<token>`. Whoever opens it can add tasks, tick
them off, rename them and set dates, in a browser, with no account and no
install.

**The link is the permission.** Anyone holding it can edit, exactly like a
document shared by link — so send it to the people you mean to. *Pause* stops it
without losing anything (the same link works again when you resume); *Delete
link* kills it for good. The share panel lists who changed what.

What a guest deliberately **cannot** do: set reminders, add photos, change
repeats, edit or delete a day heading, or touch the list's settings. Those stay
with you, so a leaked link is a nuisance rather than a disaster.

You're told when they've been in: one push and one email per sitting rather than
one per tap, a couple of minutes after they stop. Both are switchable —
*Notifications → To-Do & Work Lists → Shared list activity*, and *Email me about
shared list changes*.

### How it works, and why

Your data lives in a single Firestore document, `users/{uid}/data/app`. Letting
an anonymous browser write that would hand over every bill, debt and note in the
app along with the shopping list. So it doesn't:

1. Your app writes a **mirror** of the shared list to `listShares/{token}` —
   the list, its sections and its items, minus photos (their URLs point at
   storage only you can read).
2. A guest reads that mirror and appends their edits to
   `listShares/{token}/ops` — a create-only queue they can't even read back.
3. The `applyListOps` Cloud Function validates each op and applies it to your
   document in a transaction, then refreshes the mirror and deletes the op.
4. Your app is subscribed to the mirror and picks the change up.

Your document stays the single source of truth, which is what lets the offline
cache and all four reminder functions carry on working with no special case for
a shared list. The rules pin the *shape* of an op; `functions/listOps.js`
decides what it's allowed to mean, and `src/pages/lists/shareOps.parity.test.js`
asserts that the guest's own screen agrees with what actually gets saved.

**Setup:** shared lists need **Anonymous sign-in** enabled in the Firebase
Console (*Authentication → Sign-in method → Anonymous*). Guests are signed in
silently — they see no account and no prompt — which is what puts an auth uid on
every edit so the rules can require one and each change can say who made it.
Without it the link opens to an explanatory error rather than the list. The
rules and the two new functions also need deploying:

```bash
firebase deploy --only firestore:rules,functions
```

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
- **My kit** — warning signs, the agreed phrase, timer length, fallback dose
  timing, and which of the seven notifications are allowed to buzz you. Set
  this up on a day you feel fine.

### Medications, and the predicted window

The crash is a schedule, not a surprise. **My medications** holds what you take:
a name, a strength, when it's due, how long it takes to wear off and how long
the crash then lasts. A dose can be scheduled at a wall-clock time, or hung off
another one — "six hours after the morning one" — in which case a late morning
drags the afternoon one late with it.

Today's doses sit at the top of the Crash tab: one row each, with a Log button,
a tick once it's in, and the rules you wrote for that dose while it's still
ahead of you. Logging a dose counts one out of the supply in the same step, so
the pill count can't drift away from the log. There's still a plain one-tap Log
for anyone who hasn't set a list up.

**The window is worked out from the whole regimen, not the last dose.** Each
logged dose gets a span — its own onset, its own duration — and the one that
ends last is the one that governs the evening. That's what makes a second dose
matter: take the afternoon one and the hard hours move later; skip it and they
stay where the morning one put them.

The interesting case is the one that hasn't happened yet. While a dose is still
expected — not yet due, or inside the grace you set for it — the honest answer
is "it depends", so the timeline shows the earlier window with the later one
dotted in behind it, and **both notifications stay quiet**. Warning you that the
hard hours start at five, when taking the two o'clock one would have moved them
to six, is a false alarm about the exact thing this feature is asking you to
trust. Once the grace passes with nothing logged, the dose counts as skipped and
the earlier window is the real one. Log it late, at any point, and everything
recomputes back out.

Two things then fire: a heads-up half an hour before the window opens, and — as
it actually opens — a note that opens straight onto your anchors, because that's
the thing that's hard to reach for at that exact moment. It never starts a
session on its own; it says "read this", not "you are crashing".

Onset and duration default to 4 and 5 hours per medication, and the pair in
**My Kit** covers a dose that isn't attached to anything on the list. Once there
are five or more dose-and-crash pairs, *What usually happens* works out your
real number from your own record — "your last 8 crashes started about 4h 20m
after your dose" — and offers to use it. It never changes the setting on its own.

### Refills and rules

Enter how many you have on hand and how many you take per dose, and the count
comes down as you log. A supply speaks up on the day it crosses the threshold
you set, and again when it's nearly gone — not every morning in between, because
a reminder that fires seven days running stops being a reminder. There's also an
optional **can refill from** date, for when the fill window is the constraint
rather than the pill count.

Rules are yours, in your words, attached to a dose and fired at an offset you
pick: *"1h before — eat first, nothing too high in fat"*. They show on the dose
card while it's still ahead of you and buzz at their moment. A before-the-dose
rule stops mattering the moment you log the dose, because telling you to eat
first after you've swallowed it is worse than saying nothing.

**The app never advises on medication.** Every name, time, threshold and rule on
these screens was typed in by you. It does arithmetic on your numbers and hands
the result back — there is no default medication, no suggested dose, and no
opinion about either. With nothing logged, the feature says nothing at all.

Every one of these notifications can be switched off on its own in **My Kit**,
and none of them ever names a medication, a strength or a rule: the lock screen
says there's something to look at, and what it is stays behind your login.
`crashReminders.test.js` sweeps a full day of every message kind and fails if
any of them interpolates a word you wrote.

### Recognising it earlier

The warning signs are one vocabulary used in two places: Step 1 of a session,
and **How am I doing?** on the home screen — tap what's true, nothing starts, it
just goes in the record. Having the quiet evenings in there as well as the loud
ones is what lets *What usually happens* show **what shows up first**: each sign
with the median time it tends to arrive *after a dose*, earliest at the top. The
one at the top is the earliest warning you actually get. Nothing is said about a
sign tagged fewer than four times.

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

### Installing it as its own app

The protocol is also built as a **separate installable app called Reset**, at

```
https://emswebapps.github.io/ExpenseTracker/reset/
```

Open that on your phone and add it to the home screen — iPhone: Safari →
Share → *Add to Home Screen*. Android: Chrome → *Install app*. It gets its own
anchor icon and opens straight into the protocol, with no bottom nav and no
route into the rest of the app.

It's the same origin as the main app, so it shares your login, your
localStorage cache and your Firestore document — the same data behind a second
icon, not a second account. Long-pressing its icon offers *Start now*, which
begins a session immediately.

The main app keeps its own Crash tab for when you're already in there.

### Reminders

Two pushes, both from the `crashReminders` Cloud Function so they arrive with
the app closed: the window heads-up, and a nudge the morning after when
something you held in escrow opens. Both are **push only** — never in the email
digest — and neither ever contains a word you wrote, since a lock-screen
preview is visible to whoever is holding the phone. Both are switchable in
My Kit.

Both notifications open the standalone Reset app. Long-pressing either app's
icon also offers a shortcut straight into a session.

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

## Two apps, one build

`npm run build` produces two installable apps from one deployment:

| Entry | URL | Manifest | What it is |
|---|---|---|---|
| `index.html` | `/ExpenseTracker/` | `public/manifest.json` | Finance Manager — the full app |
| `reset/index.html` | `/ExpenseTracker/reset/` | `public/reset.webmanifest` | Reset — the Crash Protocol alone |

They share an origin deliberately, so they share the Firebase login, the
localStorage cache and the Firestore document. What makes the phone treat them
as two separate installs is the manifests: distinct `id` values and different
`scope`s. Both link their manifest explicitly — vite-plugin-pwa's own manifest
generation is off (`manifest: false`), so there's exactly one manifest per page
and nothing injected at build time.

Two things to keep in mind when changing this:

- `workbox.navigateFallbackDenylist` in `vite.config.js` keeps the service
  worker from serving `index.html` for `/reset/` when offline. Without it, an
  offline launch of Reset silently opens the finance app.
- Reset's `scope` deliberately has **no** trailing slash. React Router
  normalises the basename, so clearing a query string rewrites the URL to
  `/ExpenseTracker/reset`; a trailing-slash scope would put that outside the
  app and drop it out of standalone mode.

Icons for Reset are generated by `node scripts/make-reset-icons.mjs` and
committed, so CI never runs it.

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
subtask trees and heading rules (`subtasks.js`), section ordering
(`sections.js`), the weekly planner's week maths (`weeks.js`),
repeat scheduling (`recurrence.js`), quick-add date parsing
(`src/utils/parseTaskInput.js`) and the Crash Protocol's step machine, message
builder and history stats (`src/pages/crash/`). These modules deliberately import only from
`src/utils/dueDates.js` and `helpers.js`, both free of the Firebase SDK, which
is what lets plain Node run them. They use explicit `.js` extensions in their
imports for the same reason.

Two of them are *parity* tests, which assert that code duplicated across the
ESM bundle and the CommonJS functions hasn't drifted apart:
`src/pages/crash/regimen.parity.test.js` (against a recorded fixture) and
`src/pages/lists/shareOps.parity.test.js` (by running both implementations).
If either goes red, decide which side is right and change both — relaxing the
assertion is how the two quietly disagree in production.
