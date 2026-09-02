import { useState, useRef } from 'react';
import { X, Loader, ScanLine } from 'lucide-react';

const QUICK_CATEGORIES = [
  'Food & Dining', 'Groceries', 'Gas', 'Shopping',
  'Coffee & Drinks', 'Entertainment', 'Health & Medical', 'Other',
];

// Extract the largest dollar amount from OCR text (likely the receipt total)
function extractAmount(text) {
  const matches = text.match(/\$?\s*(\d{1,4}[.,]\d{2})/g);
  if (!matches) return null;
  const amounts = matches
    .map((m) => parseFloat(m.replace(/[$\s,]/g, '').replace(',', '.')))
    .filter((n) => !isNaN(n) && n > 0 && n < 10000);
  if (!amounts.length) return null;
  return Math.max(...amounts).toFixed(2);
}

// Guess merchant from first non-blank line that looks like a name
function extractMerchant(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    // Skip lines that are mostly numbers/dates
    if (/^\d/.test(line) || line.length < 3 || line.length > 50) continue;
    if (/^\d{1,2}[/-]\d{1,2}/.test(line)) continue;
    return line.replace(/[^a-zA-Z0-9 &'.,-]/g, '').trim();
  }
  return null;
}

export default function PurchaseForm({ initial = {}, onSave, onCancel, myName, spouseName }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    amount: '',
    merchant: '',
    category: 'Food & Dining',
    date: today,
    person: 'aaron',
    notes: '',
    ...initial,
    amount: initial.amount != null ? String(initial.amount) : '',
    person: initial.person === 'me' ? 'aaron' : (initial.person || 'aaron'),
  });
  const [scanPreview, setScanPreview] = useState(null); // { dataUrl, file }
  const [scanning, setScanning] = useState(false);
  const [scanSuggestions, setScanSuggestions] = useState(null); // { amount, merchant }
  const cameraRef = useRef();

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.merchant) return;
    const pendingFile = scanPreview?.file || null;
    onSave({ ...form, amount: parseFloat(form.amount), date: form.date || today }, pendingFile);
  };

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = URL.createObjectURL(file);
    setScanPreview({ dataUrl, file });
    setScanSuggestions(null);
    setScanning(true);

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      const amount = extractAmount(text);
      const merchant = extractMerchant(text);
      setScanSuggestions({ amount, merchant });

      if (amount && !form.amount) set('amount', amount);
      if (merchant && !form.merchant) set('merchant', merchant);
    } catch {
      // OCR unavailable — user fills in manually, receipt still attached
    } finally {
      setScanning(false);
    }
  };

  const clearScan = () => {
    setScanPreview(null);
    setScanSuggestions(null);
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const aaronLabel = myName || 'Primary User';
  const cameronLabel = spouseName || 'Secondary User';
  const personOptions = [['aaron', aaronLabel], ['cameron', cameronLabel]];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* Receipt scan strip */}
      {scanPreview ? (
        <div style={{ position: 'relative', borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)' }}>
          <img src={scanPreview.dataUrl} alt="Receipt" style={{ width: '100%', maxHeight: '10rem', objectFit: 'cover', display: 'block' }} />
          <button type="button" onClick={clearScan}
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', backgroundColor: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={14} />
          </button>
          {scanning && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Loader size={22} style={{ color: '#fff', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ color: '#fff', fontSize: '0.8125rem', fontWeight: 600 }}>Reading receipt…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {scanSuggestions && (
            <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#ccc' }}>
              {scanSuggestions.amount ? <span>Detected: <strong style={{ color: '#10b981' }}>${scanSuggestions.amount}</strong></span> : null}
              {scanSuggestions.merchant ? <span>at <strong style={{ color: '#a5b4fc' }}>{scanSuggestions.merchant}</strong></span> : null}
              {!scanSuggestions.amount && !scanSuggestions.merchant && <span style={{ color: '#f87171' }}>Couldn't read receipt — fill in manually</span>}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => cameraRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--surface2)', border: '1.5px dashed var(--border)', borderRadius: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', width: '100%' }}>
          <ScanLine size={17} style={{ color: 'var(--accent-text)' }} /> Scan receipt (auto-fill)
        </button>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleScan} style={{ display: 'none' }} />

      {/* Amount */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold" style={{ color: 'var(--subtle)' }}>$</span>
        <input
          type="number" min="0" step="0.01" inputMode="decimal" required
          className="app-input"
          style={{ paddingLeft: '2.5rem', fontSize: '1.875rem', fontWeight: 700, borderRadius: '1rem', paddingTop: '1rem', paddingBottom: '1rem' }}
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
        />
      </div>

      <input className="app-input" placeholder="Where? (e.g. Walmart, Amazon)"
        value={form.merchant} onChange={(e) => set('merchant', e.target.value)} required />

      <div className="flex flex-wrap gap-2">
        {QUICK_CATEGORIES.map((cat) => (
          <button key={cat} type="button" onClick={() => set('category', cat)}
            className="px-3 py-2 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: form.category === cat ? 'var(--accent)' : 'var(--surface2)',
              color: form.category === cat ? '#fff' : 'var(--muted)',
              border: `1px solid ${form.category === cat ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            {cat}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="flex gap-2 flex-1">
          {personOptions.map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('person', val)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: form.person === val ? 'var(--accent)' : 'var(--surface2)',
                color: form.person === val ? '#fff' : 'var(--muted)',
                border: `1px solid ${form.person === val ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {label}
            </button>
          ))}
        </div>
        <input type="date" className="app-input" style={{ width: 'auto' }}
          value={form.date} onChange={(e) => set('date', e.target.value)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 2 }}>
          {scanPreview ? 'Save + Attach Receipt' : 'Save'}
        </button>
      </div>
    </form>
  );
}
