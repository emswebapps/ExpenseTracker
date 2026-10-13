import { useState } from 'react';
import { Link, CalendarOff } from 'lucide-react';

const CATEGORIES = ['Housing', 'Utilities', 'Insurance', 'Subscriptions', 'Auto', 'Medical', 'Food', 'Entertainment', 'Other'];

export default function BillForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    amount: '',
    dueDay: '',
    category: 'Other',
    isPermanent: false,
    paymentUrl: '',
    notes: '',
    owner: 'aaron',
    ...initial,
    amount: initial.amount != null ? String(initial.amount) : '',
    dueDay: initial.dueDay != null ? String(initial.dueDay) : '',
    // A one-time bill carries its full date; older ones only had a month and
    // a day, so rebuild the date from those.
    isRecurring: initial.isRecurring !== false,
    dueDate: initial.dueDate
      || (initial.isRecurring === false && initial.month && initial.dueDay
        ? `${initial.month}-${String(initial.dueDay).padStart(2, '0')}`
        : ''),
    owner: initial.owner || 'aaron',
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    if (!form.isRecurring) {
      if (!form.dueDate) return;
      // Pinned to the month of its date, so it shows up there and nowhere
      // else. dueDay is kept so everything that reads the day still works.
      const month = form.dueDate.slice(0, 7);
      onSave({
        ...form,
        amount: parseFloat(form.amount),
        dueDay: parseInt(form.dueDate.slice(8, 10)),
        isRecurring: false,
        isPermanent: false,
        month,
        startMonth: month,
      });
      return;
    }
    onSave({
      ...form,
      amount: parseFloat(form.amount),
      dueDay: form.dueDay ? parseInt(form.dueDay) : null,
      dueDate: null,
      isRecurring: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="app-label">Bill name *</label>
        <input autoFocus className="app-input" placeholder="e.g. Netflix, Rent, Electric"
          value={form.name} onChange={(e) => set('name', e.target.value)} required />
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.25rem' }}>
        {[[true, 'Monthly'], [false, 'One-time']].map(([val, label]) => (
          <button key={label} type="button" onClick={() => set('isRecurring', val)}
            style={{
              flex: 1, padding: '0.5rem 0', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              backgroundColor: form.isRecurring === val ? 'var(--accent)' : 'transparent',
              color: form.isRecurring === val ? '#fff' : 'var(--subtle)',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="app-label">Amount *</label>
          <input type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
            value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
        </div>
        {form.isRecurring ? (
          <div>
            <label className="app-label">Due day</label>
            <input type="number" min="1" max="31" className="app-input"
              placeholder="e.g. 15"
              value={form.dueDay}
              onChange={(e) => set('dueDay', e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="app-label">Due date *</label>
            <input type="date" className="app-input"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)} required />
          </div>
        )}
      </div>

      {form.isRecurring && (
        <label className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div
            onClick={() => set('isPermanent', !form.isPermanent)}
            style={{
              width: '2.75rem', height: '1.5rem', borderRadius: '9999px',
              backgroundColor: form.isPermanent ? 'var(--accent)' : 'var(--surface)',
              border: '1px solid var(--border)', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem',
              backgroundColor: '#fff', borderRadius: '9999px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.2s', left: form.isPermanent ? 'calc(100% - 1.25rem)' : '2px',
            }} />
          </div>
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
              <CalendarOff size={14} /> Permanent bill
            </p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>No specific due date — always recurring</p>
          </div>
        </label>
      )}

      <div>
        <label className="app-label">Category</label>
        <select className="app-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="app-label flex items-center gap-1.5">
          <Link size={14} /> Payment URL <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span>
        </label>
        <input type="url" className="app-input" placeholder="https://..."
          value={form.paymentUrl} onChange={(e) => set('paymentUrl', e.target.value)} />
      </div>

      <div>
        <label className="app-label">Notes <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
        <textarea rows={2} className="app-input" style={{ resize: 'none' }}
          placeholder="Account numbers, login info, reminders..."
          value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary flex-1">Save Bill</button>
      </div>
    </form>
  );
}
