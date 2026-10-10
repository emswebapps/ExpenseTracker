import { useState } from 'react';

export default function CommitmentForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({ description: '', amount: '', person: 'me', endDate: '', ...initial });
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.description) return;
    onSave({ ...form, amount: form.amount ? parseFloat(form.amount) : null, endDate: form.endDate || null });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="app-label">What's the commitment? *</label>
        <input autoFocus className="app-input" placeholder="e.g. Transfer $300 to vacation fund"
          value={form.description} onChange={(e) => set('description', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="app-label">Amount <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
          <input type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
            value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div>
          <label className="app-label">End Date <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
          <input type="date" className="app-input"
            value={form.endDate || ''} onChange={(e) => set('endDate', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}
