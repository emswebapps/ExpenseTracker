import { useState } from 'react';

// ── GroceryItemForm ───────────────────────────────────────────────────────────
export function GroceryItemForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [qty, setQty] = useState(initial.qty || '');
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), qty: qty.trim() || null, price: price !== '' ? parseFloat(price) : null });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Item *</label>
        <input className="app-input" placeholder="e.g. Milk, Chicken breast…" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Qty <span style={{ color: 'var(--subtle)' }}>(opt)</span></label>
          <input className="app-input" placeholder="e.g. 2, 3 lbs" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Price <span style={{ color: 'var(--subtle)' }}>(opt)</span></label>
          <input className="app-input" type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Item</button>
      </div>
    </form>
  );
}
