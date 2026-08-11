import { useState } from 'react';
import { safeExternalUrl } from '../../../utils/helpers';

// ── WishlistItemForm ──────────────────────────────────────────────────────────
// A thing you'd like to buy later: what it is, roughly what it costs, and where
// to find it again.
export function WishlistItemForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [url, setUrl] = useState(initial.url || '');
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : '');
  const [notes, setNotes] = useState(initial.notes || '');

  const badLink = url.trim() !== '' && !safeExternalUrl(url);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || badLink) return;
    onSave({
      name: name.trim(),
      url: safeExternalUrl(url),
      price: price !== '' ? parseFloat(price) : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Item *</label>
        <input className="app-input" placeholder="e.g. Noise-cancelling headphones" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Link <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" type="url" inputMode="url" placeholder="Paste the product page" value={url} onChange={(e) => setUrl(e.target.value)} />
        {badLink && (
          <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.375rem' }}>
            That doesn't look like a web address.
          </p>
        )}
      </div>
      <div>
        <label className="app-label">Price <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div>
        <label className="app-label">Notes <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" placeholder="e.g. size medium, black one" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }} disabled={badLink}>Save Item</button>
      </div>
    </form>
  );
}
