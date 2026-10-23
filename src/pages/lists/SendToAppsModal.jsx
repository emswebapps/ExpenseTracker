import { useState, useMemo } from 'react';
import { ListChecks, CalendarPlus, Share2, Clipboard, ChevronDown, Info } from 'lucide-react';
import { isTaskList } from '../../utils/helpers';
import { canShareIcs, downloadIcs, shareIcs } from '../../utils/icsFile';
import {
  REMINDERS_SHORTCUT_NAME, remindersShortcutUrl, itemsToSend, calendarTasks,
  buildRemindersPayload, buildRemindersText, buildTasksIcs, icsFilename,
} from './sendToApps';

// ── SendToAppsModal ───────────────────────────────────────────────────────────
// Sends a list's open items to Apple Reminders, or a task list's dated tasks to
// Calendar. See sendToApps.js for why Reminders goes through a Shortcut.

const HINT = {
  fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5,
  backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: '0.75rem', padding: '0.625rem 0.75rem',
};

const SECTION_TITLE = {
  display: 'flex', alignItems: 'center', gap: '0.375rem',
  fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The one-time build of the shortcut. Every name in bold is what the action is
// called when you search for it in the Shortcuts app.
function ShortcutSetup() {
  return (
    <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.125rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <li>Open the <b>Shortcuts</b> app, tap <b>+</b>, and name the new shortcut exactly <b>{REMINDERS_SHORTCUT_NAME}</b>.</li>
      <li>Add <b>Get Clipboard</b>.</li>
      <li>Add <b>Get Dictionary from Input</b> (it picks up the Clipboard).</li>
      <li>Add <b>Get Dictionary Value</b> — set it to get <i>Value</i> for key <code>reminders</code>.</li>
      <li>Add <b>Repeat with Each</b> and set it to that <i>Dictionary Value</i>. Everything below goes inside the repeat.</li>
      <li>Add <b>Get Dictionary Value</b> for key <code>title</code> in <i>Repeat Item</i>, then <b>Set Variable</b> named <i>Title</i>.</li>
      <li>Add <b>Get Dictionary Value</b> for key <code>due</code> in <i>Repeat Item</i>, then <b>Set Variable</b> named <i>Due</i>.</li>
      <li>Add <b>If</b> — <i>Due</i> <i>has any value</i>.</li>
      <li>Under <i>If</i>: <b>Add New Reminder</b> with <i>Title</i> as the reminder, pick your list, and set its alert / due date to <i>Due</i>.</li>
      <li>Under <i>Otherwise</i>: another <b>Add New Reminder</b> with <i>Title</i>, same list, no date.</li>
    </ol>
  );
}

export function SendToAppsModal({ list, items, onClose }) {
  const [status, setStatus] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const taskList = isTaskList(list.type);
  const noun = taskList ? 'task' : 'item';
  const toSend = useMemo(() => itemsToSend(list, items), [list, items]);
  const dated = useMemo(() => calendarTasks(list, items), [list, items]);
  const filename = icsFilename(list);
  const canShareFile = taskList && canShareIcs(filename);

  // The shortcut reads the list off the clipboard, so copy first, then hand
  // over to Shortcuts. Opening the URL has to follow the copy — the clipboard
  // has to hold the list by the time the shortcut runs.
  async function handleShortcut() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildRemindersPayload(list, items)));
    } catch {
      setStatus("Couldn't copy the list — try again.");
      return;
    }
    setStatus(`Sending ${plural(toSend.length, noun)} to Reminders…`);
    window.location.href = remindersShortcutUrl();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildRemindersText(list, items));
      setStatus(`Copied ${plural(toSend.length, noun)}. Paste into a Reminders list.`);
    } catch {
      setStatus("Couldn't copy the list — try again.");
    }
  }

  function handleCalendar() {
    downloadIcs(buildTasksIcs(list, items), filename);
    setStatus(`Exported ${plural(dated.length, 'task')} to Calendar.`);
  }

  async function handleShareFile() {
    if (await shareIcs(buildTasksIcs(list, items), filename, list.name)) {
      setStatus(`Shared ${plural(dated.length, 'task')}.`);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={SECTION_TITLE}><ListChecks size={16} style={{ color: 'var(--accent-text)' }} /> Reminders</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', margin: 0 }}>
          {toSend.length === 0
            ? `Nothing left to send — every ${noun} is done.`
            : `${plural(toSend.length, `open ${noun}`)} will be sent${taskList && dated.length > 0 ? `, ${dated.length} with a due date` : ''}.`}
        </p>
        <button type="button" onClick={handleShortcut} disabled={toSend.length === 0} className="app-btn-primary">
          <ListChecks size={16} /> Send to Reminders
        </button>
        <button type="button" onClick={handleCopy} disabled={toSend.length === 0} className="app-btn-secondary">
          <Clipboard size={16} /> Copy as list
        </button>
        <div style={HINT}>
          <Info size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
          <b>Send to Reminders</b> runs the <b>{REMINDERS_SHORTCUT_NAME}</b> shortcut on your iPhone, iPad or Mac and keeps due dates.
          {' '}<b>Copy as list</b> needs no setup: open a list in Reminders, tap <b>New Reminder</b> and paste — each line becomes its own reminder, without dates.
          {' '}Sending the same {noun}s twice adds them twice.
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', padding: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-text)',
            }}
          >
            First time? Set up the shortcut
            <ChevronDown size={12} style={{ transform: showSetup ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showSetup && <ShortcutSetup />}
        </div>
      </section>

      {taskList && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={SECTION_TITLE}><CalendarPlus size={16} style={{ color: 'var(--accent-text)' }} /> Calendar</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', margin: 0 }}>
            {dated.length === 0
              ? 'No open tasks have a due date to put on a calendar.'
              : `${plural(dated.length, 'task')} with a due date will be added as events.`}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: canShareFile ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
            <button type="button" onClick={handleCalendar} disabled={dated.length === 0} className="app-btn-secondary">
              <CalendarPlus size={16} /> Add to Calendar
            </button>
            {canShareFile && (
              <button type="button" onClick={handleShareFile} disabled={dated.length === 0} className="app-btn-secondary">
                <Share2 size={16} /> Share File
              </button>
            )}
          </div>
          <div style={HINT}>
            <Info size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
            On iPhone, tap <b>Add to Calendar</b>, then <b>Add All</b>. Timed tasks become 30-minute events; tasks with only a date become all-day events.
          </div>
        </section>
      )}

      {status && <p style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: 600, margin: 0 }}>{status}</p>}
      <button type="button" onClick={onClose} className="app-btn-secondary">Done</button>
    </div>
  );
}
