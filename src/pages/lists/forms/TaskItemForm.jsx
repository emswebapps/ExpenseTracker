import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { mapsHref, mapsAppName } from '../../../utils/helpers';
import PhotoUpload from '../../../components/PhotoUpload';
import { useDueReminder, DueReminderFields } from '../useDueReminder';

// ── TaskItemForm ──────────────────────────────────────────────────────────────
// Used by both to-do and work lists. A task is due at an absolute moment — a
// date and a clock time — never a countdown.
export function TaskItemForm({
  initial = {}, defaultLeadMinutes = 0, onSave, onCancel,
  storagePath, attachments = [], onAttachmentsChange, onOpenAttachment,
}) {
  const [name, setName] = useState(initial.name || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [address, setAddress] = useState(initial.address || '');
  const due = useDueReminder(initial, defaultLeadMinutes);

  // Photos are saved to the task the moment they finish uploading, so the
  // section only makes sense once the task exists to hang them off.
  const canAttach = !!storagePath;
  const addressLink = mapsHref(address);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      notes: notes.trim() || null,
      address: address.trim() || null,
      ...due.dueFields(),
      status: initial.status || 'pending',
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Task *</label>
        <input className="app-input" placeholder="What needs to be done?" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
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

      <DueReminderFields
        due={due}
        help="Set the exact date and time this task is due. Leave the date blank to use today (e.g. 2:00 PM today)."
        notifyLabel="Push notification when due"
      />

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Task</button>
      </div>
    </form>
  );
}
