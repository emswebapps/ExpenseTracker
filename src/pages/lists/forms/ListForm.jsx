import { useState } from 'react';
import { isWishlist } from '../../../utils/helpers';
import { LIST_TYPES } from '../listMeta';
import { useDueReminder, DueReminderFields } from '../useDueReminder';

// ── ListForm ──────────────────────────────────────────────────────────────────
export function ListForm({ initial = {}, defaultLeadMinutes = 0, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [type, setType] = useState(initial.type || 'grocery');
  const [store, setStore] = useState(initial.store || '');
  const [forPerson, setForPerson] = useState(initial.forPerson || '');
  const due = useDueReminder(initial, defaultLeadMinutes);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      type,
      store: type === 'grocery' ? (store.trim() || null) : null,
      forPerson: isWishlist(type) ? (forPerson.trim() || null) : null,
      ...due.dueFields(),
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">List Name *</label>
        <input className="app-input" placeholder="e.g. Weekly Groceries, Project Tasks…" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Type</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {LIST_TYPES.map(({ key, short, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              style={{
                flex: 1, minWidth: 0, padding: '0.625rem 0.375rem', borderRadius: '0.75rem', border: '2px solid',
                borderColor: type === key ? 'var(--accent)' : 'var(--border)',
                backgroundColor: type === key ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: type === key ? 'var(--accent-text)' : 'var(--muted)',
                fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem',
              }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} /> {short}
            </button>
          ))}
        </div>
      </div>
      {type === 'grocery' && (
        <div>
          <label className="app-label">Store <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="e.g. Walmart, Costco, Target…" value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
      )}
      {isWishlist(type) && (
        <div>
          <label className="app-label">Who it's for <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="Leave blank for yourself — or a name, e.g. Mom" value={forPerson} onChange={(e) => setForPerson(e.target.value)} />
        </div>
      )}

      <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />
      <DueReminderFields
        due={due}
        help="Optional — set when the whole list is due, e.g. shopping on Saturday morning. This is separate from any reminder on an individual item."
        notifyLabel="Remind me about this list"
      />

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
      </div>
    </form>
  );
}
