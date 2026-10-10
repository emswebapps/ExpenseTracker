import { useState } from 'react';

const FREQUENCIES = ['monthly', 'biweekly', 'weekly', 'semimonthly'];

export default function IncomeForm({ initial = {}, onSave, onCancel, jobs = [] }) {
  const [form, setForm] = useState({
    source: '',
    amount: '',
    grossAmount: '',
    isRecurring: true,
    frequency: 'biweekly',
    startDate: '',
    person: 'me',
    notes: '',
    linkedJobId: '',
    includeInAvailability: true,
    ...initial,
    amount: initial.amount != null ? String(initial.amount) : '',
    grossAmount: initial.grossAmount != null ? String(initial.grossAmount) : '',
    includeInAvailability: initial.includeInAvailability !== false,
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const net = parseFloat(form.amount) || 0;
  const gross = parseFloat(form.grossAmount) || 0;
  const mult = form.frequency === 'weekly' ? 52 : form.frequency === 'biweekly' ? 26 : form.frequency === 'semimonthly' ? 24 : 12;
  const annualNet = net * mult;
  const annualGross = gross * mult;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.source || !form.amount) return;
    onSave({
      ...form,
      amount: parseFloat(form.amount),
      grossAmount: form.grossAmount !== '' ? parseFloat(form.grossAmount) : null,
      linkedJobId: form.linkedJobId || null,
      includeInAvailability: form.includeInAvailability,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="app-label">Source *</label>
        <input className="app-input" placeholder="e.g. Paycheck, Freelance, Side job"
          value={form.source} onChange={(e) => set('source', e.target.value)} required />
      </div>

      {/* Gross / Net pay side by side */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label className="app-label">Gross Pay *</label>
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Before taxes &amp; deductions</p>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.9375rem' }}>$</span>
              <input type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
                value={form.grossAmount} onChange={(e) => set('grossAmount', e.target.value)}
                style={{ paddingLeft: '1.75rem' }} />
            </div>
          </div>
          <div>
            <label className="app-label">Net Pay (take-home) *</label>
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>After taxes &amp; deductions</p>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.9375rem' }}>$</span>
              <input type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
                value={form.amount} onChange={(e) => set('amount', e.target.value)} required
                style={{ paddingLeft: '1.75rem' }} />
            </div>
          </div>
        </div>

        {/* Annual summary row */}
        {(net > 0 || gross > 0) && (
          <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {gross > 0 && (
              <div>
                <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Annual Gross</p>
                <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '0.9375rem' }}>
                  ${annualGross.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {net > 0 && (
              <div>
                <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Annual Net</p>
                <p style={{ fontWeight: '700', color: 'var(--positive-text)', fontSize: '0.9375rem' }}>
                  ${annualNet.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="app-label">Frequency</label>
        <select className="app-input" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>{f === 'biweekly' ? 'Biweekly (every 2 weeks)' : f === 'semimonthly' ? 'Semimonthly (twice/month)' : f.charAt(0).toUpperCase() + f.slice(1)}</option>
          ))}
        </select>
      </div>

      {form.frequency !== 'monthly' && (
        <div>
          <label className="app-label">
            Next or most recent pay date
            <span className="ml-1 text-xs" style={{ color: 'var(--subtle)' }}>(used to calculate schedule)</span>
          </label>
          <input type="date" className="app-input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
      )}

      {jobs.length > 0 && (
        <div>
          <label className="app-label">
            Link to Job <span className="ml-1" style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(enables hours toggle)</span>
          </label>
          <select className="app-input" value={form.linkedJobId || ''} onChange={(e) => set('linkedJobId', e.target.value)}>
            <option value="">None</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="app-label">Notes</label>
        <input className="app-input" placeholder="Optional" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>Factor into Availability</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>Include net pay in Dashboard available amount</p>
        </div>
        <button type="button" onClick={() => set('includeInAvailability', !form.includeInAvailability)}
          style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            backgroundColor: form.includeInAvailability ? 'var(--accent)' : 'var(--border2)' }}>
          <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
            left: form.includeInAvailability ? 'calc(100% - 1.25rem)' : '2px' }} />
        </button>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={() => set('isRecurring', !form.isRecurring)}
          style={{
            width: '2.75rem', height: '1.5rem', borderRadius: '9999px',
            backgroundColor: form.isRecurring ? 'var(--accent)' : 'var(--surface2)',
            border: '1px solid var(--border)',
            position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background-color 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem',
            backgroundColor: '#fff', borderRadius: '9999px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.2s', left: form.isRecurring ? 'calc(100% - 1.25rem)' : '2px',
          }} />
        </div>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Recurring income</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}
