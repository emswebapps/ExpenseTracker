import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Repeat } from 'lucide-react';
import { mapsHref, mapsAppName } from '../../../utils/helpers';
import PhotoUpload from '../../../components/PhotoUpload';
import { useDueReminder, DueReminderFields } from '../useDueReminder';
import { REPEAT_OPTIONS, repeatLabel } from '../recurrence.js';

// ── TaskItemForm ──────────────────────────────────────────────────────────────
// Used by both to-do and work lists. A task is due at an absolute moment — a
// date and a clock time — never a countdown.
//
// Two things are true of almost every task: it has a name, and it has a when.
// Those stay above the fold. Notes, address, photos and repeat are real but
// occasional, and when they sat between the name and the due date they pushed
// the field people actually came to change off the bottom of a phone screen.
// They live behind a disclosure now, opened automatically for a task that
// already uses them.
//
// The Save/Cancel pair is *not* here — it's passed to `Modal`'s footer by
// `TaskEditorModal` so it stays pinned. That's why this form takes an `id`:
// the submit button is outside the <form> element and reaches it by `form=`.
export function TaskItemForm({
  id, initial = {}, defaultLeadMinutes = 0, onSave,
  storagePath, attachments = [], onAttachmentsChange, onOpenAttachment,
}) {
  const [name, setName] = useState(initial.name || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [address, setAddress] = useState(initial.address || '');
  const [repeatFreq, setRepeatFreq] = useState(initial.repeat?.freq || '');
  const [repeatInterval, setRepeatInterval] = useState(Math.max(1, Number(initial.repeat?.interval) || 1));
  const due = useDueReminder(initial, defaultLeadMinutes);

  // Photos are saved to the task the moment they finish uploading, so the
  // section only makes sense once the task exists to hang them off.
  const canAttach = !!storagePath;
  const addressLink = mapsHref(address);

  // Nothing hidden by default should ever be a surprise: a task that already
  // carries any of these opens with the section expanded.
  const [showDetails, setShowDetails] = useState(
    !!(initial.notes || initial.address || initial.repeat?.freq || attachments.length > 0)
  );

  // What's in there, for the collapsed row — so you can tell at a glance
  // whether it's worth opening.
  const detailSummary = [
    notes && 'Notes',
    address && 'Address',
    attachments.length > 0 && `${attachments.length} photo${attachments.length === 1 ? '' : 's'}`,
    repeatFreq && repeatLabel({ freq: repeatFreq, interval: repeatInterval }),
  ].filter(Boolean).join(' · ');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      notes: notes.trim() || null,
      address: address.trim() || null,
      ...due.dueFields(),
      // A repeat needs a date to step from — without one there's nothing to
      // roll forward, so the setting is dropped rather than saved dormant.
      repeat: (repeatFreq && due.dueFields().dueDate)
        ? { freq: repeatFreq, interval: Math.max(1, Number(repeatInterval) || 1) }
        : null,
      status: initial.status || 'pending',
    });
  };

  return (
    <form id={id} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Task *</label>
        <input className="app-input" placeholder="What needs to be done?" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>

      <DueReminderFields
        due={due}
        help="Set the exact date and time this task is due. Leave the date blank to use today (e.g. 2:00 PM today)."
        notifyLabel="Push notification when due"
      />

      {/* ── Details ─────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.875rem' }}>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.625rem 0', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
          }}
        >
          {showDetails ? <ChevronDown size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} /> : <ChevronRight size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} />}
          <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>Details</span>
          <span style={{
            marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--subtle)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%', textAlign: 'right',
          }}>
            {showDetails ? '' : (detailSummary || 'Notes, address, photos, repeat')}
          </span>
        </button>

        {/*
          Hidden rather than unmounted: `PhotoUpload` uploads sequentially and
          keeps its progress state internally, so collapsing this section
          mid-upload would throw that progress away. It also means half-typed
          notes survive a collapse.
        */}
        <div style={{ display: showDetails ? 'flex' : 'none', flexDirection: 'column', gap: '1rem', paddingTop: '0.375rem' }}>
            <div>
              <label className="app-label">Notes <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
              <input className="app-input" placeholder="Additional details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div>
              <label className="app-label">Address <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
              <input
                className="app-input"
                placeholder="e.g. 123 Main St, Springfield IL"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.375rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                  Tap the address on the task to open it in {mapsAppName()}.
                </p>
                {addressLink && (
                  <a
                    href={addressLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-text)', flexShrink: 0, textDecoration: 'none' }}
                  >
                    <MapPin size={11} /> Preview
                  </a>
                )}
              </div>
            </div>

            {canAttach && (
              <div>
                <label className="app-label">Photos <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
                <PhotoUpload
                  storagePath={storagePath}
                  attachments={attachments}
                  onChange={onAttachmentsChange}
                  onOpen={onOpenAttachment}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.5rem' }}>
                  Receipts, screenshots, a photo of the part you need — saved as soon as they upload.
                </p>
              </div>
            )}

            <div>
              <label className="app-label">
                <Repeat size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
                Repeat <span style={{ color: 'var(--subtle)' }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  className="app-input"
                  style={{ flex: 1 }}
                  value={repeatFreq}
                  onChange={(e) => setRepeatFreq(e.target.value)}
                >
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.freq ?? 'none'} value={o.freq ?? ''}>{o.label}</option>
                  ))}
                </select>
                {repeatFreq && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>every</span>
                    <input
                      className="app-input" type="number" min="1" max="99" style={{ width: '4rem' }}
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {repeatFreq && (
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
                  Needs a due date. Ticking this off creates the next one automatically.
                </p>
              )}
            </div>
        </div>
      </div>
    </form>
  );
}
