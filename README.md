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

## One app, one build

`npm run build` produces a single installable PWA — Finance Manager, served at
`/ExpenseTracker/` with `public/manifest.json`.

vite-plugin-pwa's own manifest generation is off (`manifest: false`), so
`index.html` links that static file and nothing is injected at build time. One
manifest, visible as a plain file, is easier to reason about than an injected
one plus a stale duplicate in `public/`.

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
npm run test:unit            # front-end logic, via node --test — no extra deps
npm --prefix functions test  # Cloud Function reminder selection
npm run test:rules           # security rules, against the Firestore emulator
```

`test:unit` covers the pure pieces of the to-do list: task ordering
(`src/pages/lists/taskSort.js`), the Today view's grouping (`agenda.js`),
subtask trees and heading rules (`subtasks.js`), section ordering
(`sections.js`), the weekly planner's week maths (`weeks.js`),
repeat scheduling (`recurrence.js`), quick-add date parsing
(`src/utils/parseTaskInput.js`) and the shared-list op rules (`shareOps.js`).
These modules deliberately import only from
`src/utils/dueDates.js` and `helpers.js`, both free of the Firebase SDK, which
is what lets plain Node run them. They use explicit `.js` extensions in their
imports for the same reason.

`test:rules` is the odd one out: it starts the real Firestore emulator and
drives it with `@firebase/rules-unit-testing`, because the only way to know
what a security rule does is to run it. It covers the claims the share link
rests on — the token can't be sidestepped by listing the collection, a guest
can append an edit but never read the queue back, a paused share accepts
nothing, and `ownerUid` can't be re-pointed at another user's document. It
needs Java (the emulator is a jar, downloaded on first run) and it gates the
deploy that ships the rules.

One of them is a *parity* test:
`src/pages/lists/shareOps.parity.test.js` runs every guest edit through both
the ESM client copy and the CommonJS function copy and asserts they agree, as
neither bundle can import the other. If it goes red, decide which side is right
and change both — relaxing the assertion is how the two quietly disagree in
production.
