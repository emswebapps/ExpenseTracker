import { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Pencil, Trash2, MoreVertical, ChevronLeft, ChevronRight, Plus, RefreshCw, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Calendar, Upload, X, AlertCircle, Download, Paperclip, CheckCircle2, Circle, Target, Folder, Handshake } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, monthKey, monthLabel, exportMonthCSV, generateId } from '../utils/helpers';
import Modal from '../components/Modal';
import PurchaseForm from '../components/PurchaseForm';
import BillForm from '../components/BillForm';
import FileUpload from '../components/FileUpload';
import { uploadFile } from '../utils/storageUtils';
import CommitmentForm from '../components/CommitmentForm';
import PlannedExpenseForm from '../components/PlannedExpenseForm';

const PURCHASE_CATEGORIES = [
  'Food & Dining', 'Groceries', 'Gas & Fuel', 'Shopping', 'Entertainment',
  'Health & Fitness', 'Travel', 'Subscriptions', 'Utilities', 'Personal Care',
  'Education', 'Other',
];

function RecurringTemplateForm({ initial = {}, onSave, onCancel, myName, spouseName }) {
  const [merchant, setMerchant] = useState(initial.merchant || '');
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial.category || 'Subscriptions');
  const [person, setPerson] = useState(initial.person || 'me');
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth != null ? String(initial.dayOfMonth) : '1');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!merchant.trim() || !amount) return;
    onSave({
      merchant: merchant.trim(),
      amount: parseFloat(amount),
      category,
      person,
      dayOfMonth: parseInt(dayOfMonth, 10) || 1,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Merchant / Name *</label>
        <input className="app-input" placeholder="e.g. Netflix, Gym, Spotify…" value={merchant} onChange={(e) => setMerchant(e.target.value)} autoFocus required />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Amount *</label>
          <input className="app-input" type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Day of Month</label>
          <input className="app-input" type="number" min="1" max="28" placeholder="1" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="app-label">Category</label>
        <select className="app-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="app-label">Person</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[['me', myName || 'Me'], ['partner', spouseName || 'Partner']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => setPerson(val)} style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: `2px solid ${person === val ? 'var(--accent)' : 'var(--border)'}`, backgroundColor: person === val ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', color: person === val ? 'var(--accent-text)' : 'var(--muted)', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
      </div>
    </form>
  );
}

// ── Smart Purchase Parser ─────────────────────────────────────────────────────

const SKIP_PATTERNS = /^(date|bill|amount|totals?|total|joint\s*charges?|cost|#|\s*$)/i;

function parseMDY(str) {
  const m = str.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function parseISO(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function parseAmount(str) {
  const n = parseFloat(str.replace(/[$,\s]/g, ''));
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

function parsePurchaseText(text) {
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || SKIP_PATTERNS.test(line)) continue;

    let entry = null;

    // Try tab then comma delimiters
    for (const sep of ['\t', ',']) {
      if (!line.includes(sep)) continue;
      const parts = line.split(sep).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;

      // Date | Merchant | Amount
      if (parts.length >= 3) {
        const dateFirst = parseMDY(parts[0]) || parseISO(parts[0]);
        if (dateFirst) {
          const amt = parseAmount(parts[parts.length - 1]);
          if (amt) {
            const merchant = parts.slice(1, parts.length - 1).join(' ').trim();
            if (merchant && !SKIP_PATTERNS.test(merchant)) { entry = { date: dateFirst, merchant, amount: amt }; break; }
          }
        }
        // Merchant | Amount | Date
        const dateLast = parseMDY(parts[parts.length - 1]) || parseISO(parts[parts.length - 1]);
        if (dateLast) {
          const amt = parseAmount(parts[parts.length - 2]);
          if (amt) {
            const merchant = parts.slice(0, parts.length - 2).join(' ').trim();
            if (merchant && !SKIP_PATTERNS.test(merchant)) { entry = { date: dateLast, merchant, amount: amt }; break; }
          }
        }
      }

      // Merchant | Amount  (most common — no date)
      const lastAmt = parseAmount(parts[parts.length - 1]);
      if (lastAmt && !parseMDY(parts[parts.length - 1]) && !parseISO(parts[parts.length - 1])) {
        const merchant = parts.slice(0, parts.length - 1).join(' ').trim();
        if (merchant && !SKIP_PATTERNS.test(merchant)) { entry = { date: today, merchant, amount: lastAmt }; break; }
      }
    }

    // Fallback: whitespace-only (no tab/comma) — only runs when delimiter loop found nothing
    if (!entry) {
      const tokens = line.split(/\s+/);
      if (tokens.length >= 2) {
        const lastAmt = parseAmount(tokens[tokens.length - 1]);
        if (lastAmt && !parseMDY(tokens[tokens.length - 1])) {
          const merchant = tokens.slice(0, tokens.length - 1).join(' ').trim();
          if (merchant && !SKIP_PATTERNS.test(merchant)) entry = { date: today, merchant, amount: lastAmt };
        }
      }
    }

    if (entry) results.push(entry);
  }

  return results;
}

function ImportPurchasesModal({ onImport, onCancel, myName, spouseName, existingPurchases = [] }) {
  const [person, setPerson] = useState('me');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Other');

  const isDuplicate = (e) => existingPurchases.some(
    (p) => p.date === e.date && p.merchant === e.merchant && Math.abs(p.amount - e.amount) < 0.01
  );

  const handleParse = () => {
    const entries = parsePurchaseText(text);
    if (!entries.length) {
      setError('No purchases detected. Make sure each line has a merchant and amount.');
      return;
    }
    setError('');
    setParsed(entries);
  };

  const removeEntry = (idx) => setParsed((prev) => prev.filter((_, i) => i !== idx));

  const handleImport = () => {
    if (!parsed?.length) return;
    onImport(parsed.map((e) => ({ ...e, person, category: defaultCategory })));
  };

  const personLabels = [['me', myName || 'Me'], ['cameron', spouseName || 'Partner']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!parsed ? (
        <>
          {/* Person selector */}
          <div>
            <label className="app-label">Purchases are for</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {personLabels.map(([val, label]) => (
                <button key={val} type="button" onClick={() => setPerson(val)}
                  style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: `2px solid ${person === val ? 'var(--accent)' : 'var(--border)'}`, backgroundColor: person === val ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', color: person === val ? 'var(--accent-text)' : 'var(--muted)', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Text area */}
          <div>
            <label className="app-label">Paste from Excel or type entries</label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              placeholder={'Examples:\n01.15.2026\tWalmart\t45.23\n01.16.2026\tStarbucks\t8.50\nAmazon 23.99\n9.99 Spotify'}
              style={{ width: '100%', minHeight: '10rem', padding: '0.875rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--text)', fontSize: '0.8125rem', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
              Accepts: Excel copy (MM.DD.YYYY tab Merchant tab Amount), comma-separated, or Merchant Amount per line
            </p>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(244,63,94,0.1)', border: '1px solid var(--danger)', borderRadius: '0.75rem', padding: '0.75rem' }}>
              <AlertCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="button" onClick={handleParse} className="app-btn-primary" style={{ flex: 2 }} disabled={!text.trim()}>
              Parse Entries →
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontWeight: '700', color: 'var(--text)' }}>{parsed.length} entr{parsed.length === 1 ? 'y' : 'ies'} found</p>
            <button onClick={() => setParsed(null)} style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>← Edit text</button>
          </div>

          {/* Category picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <label className="app-label" style={{ margin: 0, flexShrink: 0 }}>Category</label>
            <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}
              className="app-input" style={{ flex: 1, margin: 0 }}>
              {PURCHASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden', maxHeight: '16rem', overflowY: 'auto' }}>
            {parsed.map((e, i) => {
              const dup = isDuplicate(e);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', borderBottom: i < parsed.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: dup ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.merchant}</p>
                      {dup && <span style={{ fontSize: '0.6rem', fontWeight: '700', color: 'var(--warn)', backgroundColor: 'rgba(245,158,11,0.15)', padding: '0.1rem 0.35rem', borderRadius: '0.3rem', flexShrink: 0 }}>DUP</span>}
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>{e.date}</p>
                  </div>
                  <p style={{ fontSize: '0.9375rem', fontWeight: '700', color: 'var(--text)', flexShrink: 0 }}>${e.amount.toFixed(2)}</p>
                  <button onClick={() => removeEntry(i)} style={{ padding: '0.25rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {parsed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>All entries removed.</p>
              <button onClick={() => setParsed(null)} style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>← Edit text</button>
            </div>
          ) : (
            <button type="button" onClick={handleImport} className="app-btn-primary">
              Import {parsed.length} Purchase{parsed.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function monthOffset(mk, offset) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
}

function PurchaseRow({ purchase, onEdit, onDelete, onAttach, myName, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef(null);
  const isAaron = purchase.person === 'aaron' || purchase.person === 'me';
  const personLabel = isAaron ? (myName || 'Primary User') : (spouseName || 'Secondary User');
  const dateLabel = new Date(purchase.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const attachCount = (purchase.attachments || []).length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem' }}>
          <p style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{purchase.merchant}</p>
          <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', flexShrink: 0 }}>
            {purchase.category}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--subtle)' }}>
          <span>{dateLabel}</span>
          <span>·</span>
          <span style={{ color: 'var(--accent-text)' }}>{personLabel}</span>
          {purchase.notes && <span>· {purchase.notes}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
        <button
          onClick={() => onAttach?.(purchase)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: attachCount > 0 ? 'var(--accent-text)' : 'var(--subtle)', backgroundColor: attachCount > 0 ? 'rgba(99,102,241,0.1)' : 'transparent', border: `1px solid ${attachCount > 0 ? 'rgba(99,102,241,0.3)' : 'transparent'}`, padding: '0.25rem 0.375rem', borderRadius: '0.375rem', cursor: 'pointer' }}>
          <Paperclip size={11} />
          {attachCount > 0 && attachCount}
        </button>
        <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(purchase.amount)}</p>
        <div style={{ position: 'relative' }}>
          <button ref={menuBtnRef} onClick={() => {
            if (!menuOpen && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            }
            setMenuOpen(!menuOpen);
          }} style={{ padding: '0.25rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <button onClick={() => { onEdit(purchase); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => { onAttach?.(purchase); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Paperclip size={13} /> Receipt
                </button>
                <button onClick={() => { onDelete(purchase.id); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Commitments Tab ──────────────────────────────────────────────────────────

function AgreementForm({ initial = {}, onSave, onCancel, myName, spouseName }) {
  const [form, setForm] = useState({ description: '', amount: '', person: 'me', date: new Date().toISOString().slice(0, 10), notes: '', ...initial, amount: initial.amount != null ? String(initial.amount) : '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.description.trim()) return;
    onSave({ ...form, amount: form.amount ? parseFloat(form.amount) : null });
  };
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Description *</label>
        <input autoFocus className="app-input" placeholder="e.g. Aaron owes Cameron $50 for groceries" value={form.description} onChange={(e) => set('description', e.target.value)} required />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Amount <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
          <input type="number" min="0" step="0.01" className="app-input" placeholder="0.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Date</label>
          <input type="date" className="app-input" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="app-label">Who</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[['me', myName || 'Me'], ['partner', spouseName || 'Partner'], ['both', 'Both']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('person', val)}
              style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: `2px solid ${form.person === val ? 'var(--accent)' : 'var(--border)'}`, backgroundColor: form.person === val ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', color: form.person === val ? 'var(--accent-text)' : 'var(--muted)', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="app-label">Notes <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
        <textarea rows={2} className="app-input" style={{ resize: 'none' }} placeholder="Context, terms, etc." value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Deal</button>
      </div>
    </form>
  );
}

function CommitmentsTab({ commitments, addCommitment, updateCommitment, deleteCommitment, toggleCommitment, agreements, addAgreement, updateAgreement, deleteAgreement, myName, spouseName }) {
  const [showAddC, setShowAddC] = useState(false);
  const [editC, setEditC] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [editDeal, setEditDeal] = useState(null);
  const [showSettled, setShowSettled] = useState(false);

  const open = commitments.filter((c) => !c.completed);
  const done = commitments.filter((c) => c.completed);
  const active = agreements.filter((a) => a.status !== 'settled');
  const settled = agreements.filter((a) => a.status === 'settled');

  const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const myLabel = myName || 'Me';
  const partnerLabel = spouseName || 'Partner';

  return (
    <div style={{ padding: '0 1rem 2rem' }}>
      {/* Commitments / To-dos */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: '700' }}>To-dos &amp; Commitments</p>
          <button onClick={() => setShowAddC(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {commitments.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--subtle)' }} />
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1rem' }}>Nothing here yet. Add commitments and to-dos to track.</p>
            <button onClick={() => setShowAddC(true)} className="app-btn-primary" style={{ maxWidth: '12rem', margin: '0 auto', fontSize: '0.875rem' }}>
              <Plus size={14} /> Add Commitment
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            {open.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', padding: '1rem', borderBottom: i < open.length - 1 || done.length > 0 ? '1px solid var(--border)' : 'none' }}>
                <button onClick={() => toggleCommitment(c.id)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border2)', paddingTop: '0.1rem' }}>
                  <Circle size={22} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text)' }}>{c.description}</p>
                  <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    {c.amount != null && <span style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: '700' }}>{formatCurrency(c.amount)}</span>}
                    {c.endDate && <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Due {formatDate(c.endDate)}</span>}
                    <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{c.person === 'me' ? myLabel : c.person === 'partner' ? partnerLabel : 'Both'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button onClick={() => setEditC(c)} style={{ padding: '0.375rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={14} /></button>
                  <button onClick={() => deleteCommitment(c.id)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {done.length > 0 && (
              <button onClick={() => setShowDone(!showDone)} style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: open.length > 0 ? '1px solid var(--border)' : 'none', borderBottom: showDone ? '1px solid var(--border)' : 'none' }}>
                {showDone ? '▾' : '▸'} {done.length} completed
              </button>
            )}
            {showDone && done.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderBottom: i < done.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.55 }}>
                <button onClick={() => toggleCommitment(c.id)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--positive)' }}>
                  <CheckCircle2 size={22} />
                </button>
                <p style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--muted)', textDecoration: 'line-through' }}>{c.description}</p>
                <button onClick={() => deleteCommitment(c.id)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deals / Agreements */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: '700' }}>Financial Deals</p>
          <button onClick={() => setShowAddDeal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {agreements.length === 0 ? (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
            <Handshake size={32} style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--subtle)' }} />
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1rem' }}>No deals recorded. Log who owes what between you and your partner.</p>
            <button onClick={() => setShowAddDeal(true)} className="app-btn-primary" style={{ maxWidth: '12rem', margin: '0 auto', fontSize: '0.875rem' }}>
              <Plus size={14} /> Log a Deal
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            {active.map((ag, i) => (
              <div key={ag.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', borderBottom: i < active.length - 1 || settled.length > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text)' }}>{ag.description}</p>
                  <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    {ag.amount != null && ag.amount > 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: '700' }}>{formatCurrency(ag.amount)}</span>}
                    <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{ag.person === 'me' ? myLabel : ag.person === 'partner' ? partnerLabel : 'Both'}{ag.date ? ` · ${formatDate(ag.date)}` : ''}</span>
                  </div>
                  {ag.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>{ag.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => updateAgreement(ag.id, { status: 'settled' })}
                    style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.35rem 0.625rem', borderRadius: '0.5rem', backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--positive-text)', border: 'none', cursor: 'pointer' }}>
                    Settle
                  </button>
                  <button onClick={() => setEditDeal(ag)} style={{ padding: '0.35rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={13} /></button>
                  <button onClick={() => deleteAgreement(ag.id)} style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {settled.length > 0 && (
              <>
                <button onClick={() => setShowSettled(!showSettled)} style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: active.length > 0 ? '1px solid var(--border)' : 'none', borderBottom: showSettled ? '1px solid var(--border)' : 'none' }}>
                  {showSettled ? '▾' : '▸'} {settled.length} settled
                </button>
                {showSettled && settled.map((ag, i) => (
                  <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < settled.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.5 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', textDecoration: 'line-through' }}>{ag.description}</p>
                    </div>
                    <button onClick={() => deleteAgreement(ag.id)} style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showAddC && (
        <Modal title="Add Commitment" onClose={() => setShowAddC(false)}>
          <CommitmentForm
            onSave={(d) => { addCommitment(d); setShowAddC(false); }}
            onCancel={() => setShowAddC(false)}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {editC && (
        <Modal title="Edit Commitment" onClose={() => setEditC(null)}>
          <CommitmentForm
            initial={editC}
            onSave={(d) => { updateCommitment(editC.id, d); setEditC(null); }}
            onCancel={() => setEditC(null)}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {showAddDeal && (
        <Modal title="Log a Deal" onClose={() => setShowAddDeal(false)}>
          <AgreementForm
            onSave={(d) => { addAgreement(d); setShowAddDeal(false); }}
            onCancel={() => setShowAddDeal(false)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {editDeal && (
        <Modal title="Edit Deal" onClose={() => setEditDeal(null)}>
          <AgreementForm
            initial={editDeal}
            onSave={(d) => { updateAgreement(editDeal.id, d); setEditDeal(null); }}
            onCancel={() => setEditDeal(null)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────

function GoalsTab({ plannedExpenses, addPlannedExpense, updatePlannedExpense, deletePlannedExpense, savings }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editGoal, setEditGoal] = useState(null);

  const active = plannedExpenses.filter((pe) => pe.status !== 'completed');
  const done = plannedExpenses.filter((pe) => pe.status === 'completed');
  const [showDone, setShowDone] = useState(false);

  const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div style={{ padding: '0 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: '700' }}>Planned Expenses &amp; Goals</p>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
          <Plus size={15} /> Add
        </button>
      </div>
      {active.length === 0 && done.length === 0 ? (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
          <Target size={32} style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--subtle)' }} />
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1rem' }}>No goals yet. Plan upcoming trips, purchases, or events and link them to savings.</p>
          <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '12rem', margin: '0 auto', fontSize: '0.875rem' }}>
            <Plus size={14} /> Add Goal
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginBottom: active.length > 0 ? '1.5rem' : 0 }}>
          {active.map((pe, i) => {
            const linked = savings.find((s) => s.id === pe.fromSavingsId);
            return (
              <div key={pe.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', borderBottom: i < active.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{pe.name}</p>
                  <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: '700', color: 'var(--accent-text)' }}>{formatCurrency(pe.amount)}</span>
                    {pe.targetDate && <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{formatDate(pe.targetDate)}</span>}
                    {linked && <span style={{ fontSize: '0.8125rem', color: 'var(--positive-text)' }}>from {linked.name}</span>}
                  </div>
                  {pe.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>{pe.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button onClick={() => updatePlannedExpense(pe.id, { status: 'completed' })}
                    style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.35rem 0.625rem', borderRadius: '0.5rem', backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--positive-text)', border: 'none', cursor: 'pointer' }}>
                    Done
                  </button>
                  <button onClick={() => setEditGoal(pe)} style={{ padding: '0.35rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={13} /></button>
                  <button onClick={() => deletePlannedExpense(pe.id)} style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {done.length > 0 && (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <button onClick={() => setShowDone(!showDone)} style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: showDone ? '1px solid var(--border)' : 'none' }}>
            {showDone ? '▾' : '▸'} {done.length} completed goal{done.length !== 1 ? 's' : ''}
          </button>
          {showDone && done.map((pe, i) => (
            <div key={pe.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < done.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.55 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--positive)', flexShrink: 0 }} />
              <p style={{ flex: 1, fontSize: '0.875rem', color: 'var(--muted)', textDecoration: 'line-through' }}>{pe.name}</p>
              <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'var(--muted)' }}>{formatCurrency(pe.amount)}</span>
              <button onClick={() => deletePlannedExpense(pe.id)} style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Goal" onClose={() => setShowAdd(false)}>
          <PlannedExpenseForm
            savings={savings}
            onSave={(d) => { addPlannedExpense(d); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
          />
        </Modal>
      )}
      {editGoal && (
        <Modal title="Edit Goal" onClose={() => setEditGoal(null)}>
          <PlannedExpenseForm
            initial={editGoal}
            savings={savings}
            onSave={(d) => { updatePlannedExpense(editGoal.id, d); setEditGoal(null); }}
            onCancel={() => setEditGoal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────

function ProjectForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', notes: '', reviewDate: '', dueDate: '', ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, reviewDate: form.reviewDate || null, dueDate: form.dueDate || null });
  };
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Project Name *</label>
        <input autoFocus className="app-input" placeholder="e.g. Kitchen renovation, Career planning" value={form.name} onChange={(e) => set('name', e.target.value)} required />
      </div>
      <div>
        <label className="app-label">Notes</label>
        <textarea rows={5} className="app-input" style={{ resize: 'vertical', minHeight: '8rem' }} placeholder="Details, steps, ideas, links..." value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Review Date <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
          <input type="date" className="app-input" value={form.reviewDate || ''} onChange={(e) => set('reviewDate', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Target Date <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>(optional)</span></label>
          <input type="date" className="app-input" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
      </div>
    </form>
  );
}

function ProjectsTab({ projects, addProject, updateProject, deleteProject }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const active = projects.filter((p) => !p.completed);
  const done = projects.filter((p) => p.completed);

  const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div style={{ padding: '0 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: '700' }}>Projects &amp; Plans</p>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
          <Plus size={15} /> New
        </button>
      </div>
      {active.length === 0 && done.length === 0 ? (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
          <Folder size={32} style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--subtle)' }} />
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1rem' }}>No projects yet. Keep notes, plans, and ideas for bigger things you're working on.</p>
          <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '12rem', margin: '0 auto', fontSize: '0.875rem' }}>
            <Plus size={14} /> New Project
          </button>
        </div>
      ) : (
        <>
          {active.map((p) => (
            <div key={p.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '1.0625rem', fontWeight: '700', color: 'var(--text)', marginBottom: '0.125rem' }}>{p.name}</p>
                  <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginBottom: p.notes ? '0.75rem' : 0 }}>
                    {p.reviewDate && <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Review {formatDate(p.reviewDate)}</span>}
                    {p.dueDate && <span style={{ fontSize: '0.75rem', color: 'var(--accent-text)' }}>Due {formatDate(p.dueDate)}</span>}
                  </div>
                  {p.notes && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{p.notes}</p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
                  <button onClick={() => setEditProject(p)} style={{ padding: '0.375rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={14} /></button>
                  <button onClick={() => deleteProject(p.id)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={14} /></button>
                </div>
              </div>
              <button onClick={() => updateProject(p.id, { completed: true })}
                style={{ marginTop: '0.875rem', width: '100%', padding: '0.625rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer' }}>
                Mark Complete
              </button>
            </div>
          ))}
        </>
      )}
      {done.length > 0 && (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginTop: '0.75rem' }}>
          <button onClick={() => setShowDone(!showDone)} style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: showDone ? '1px solid var(--border)' : 'none' }}>
            {showDone ? '▾' : '▸'} {done.length} completed project{done.length !== 1 ? 's' : ''}
          </button>
          {showDone && done.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < done.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.55 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--positive)', flexShrink: 0 }} />
              <p style={{ flex: 1, fontSize: '0.875rem', color: 'var(--muted)', textDecoration: 'line-through' }}>{p.name}</p>
              <button onClick={() => updateProject(p.id, { completed: false })} style={{ fontSize: '0.75rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Reopen</button>
              <button onClick={() => deleteProject(p.id)} style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="New Project" onClose={() => setShowAdd(false)}>
          <ProjectForm
            onSave={(d) => { addProject(d); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
          />
        </Modal>
      )}
      {editProject && (
        <Modal title="Edit Project" onClose={() => setEditProject(null)}>
          <ProjectForm
            initial={editProject}
            onSave={(d) => { updateProject(editProject.id, d); setEditProject(null); }}
            onCancel={() => setEditProject(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Purchases() {
  const { purchases, addPurchase, bulkAddPurchases, updatePurchase, deletePurchase, settings, setSettings, bills, addBill, income, recurringTemplates, addRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, commitments, addCommitment, updateCommitment, deleteCommitment, toggleCommitment, agreements, addAgreement, updateAgreement, deleteAgreement, plannedExpenses, addPlannedExpense, updatePlannedExpense, deletePlannedExpense, savings, projects, addProject, updateProject, deleteProject } = useApp();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [planTab, setPlanTab] = useState('spending');
  const [mk, setMk] = useState(() => monthKey(new Date()));
  const [showAdd, setShowAdd] = useState(() => searchParams.get('new') === '1');
  const [editItem, setEditItem] = useState(null);
  const [attachPurchaseId, setAttachPurchaseId] = useState(null);
  const [personFilter, setPersonFilter] = useState('all');
  const [showRecurring, setShowRecurring] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [addRecurringBill, setAddRecurringBill] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showLimitEdit, setShowLimitEdit] = useState(false);
  const [limitInput, setLimitInput] = useState('');

  const { myName, spouseName, monthlySpendingBudget, purchasesInAvailable } = settings;
  const spendingLimit = monthlySpendingBudget || 0;
  const aaronLabel = myName || 'Primary User';
  const cameronLabel = spouseName || 'Secondary User';

  const monthPurchases = purchases.filter((p) => {
    if (!p.date) return false;
    return p.date.startsWith(mk);
  });

  const normalPerson = (p) => (p.person === 'me' ? 'aaron' : p.person);

  const filtered = personFilter === 'all'
    ? monthPurchases
    : monthPurchases.filter((p) => normalPerson(p) === personFilter);

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));

  const totalAll = monthPurchases.reduce((s, p) => s + p.amount, 0);

  const limitPct = spendingLimit > 0 ? Math.min(100, (totalAll / spendingLimit) * 100) : 0;
  const limitColor = limitPct >= 90 ? 'var(--danger)' : limitPct >= 70 ? 'var(--warn)' : 'var(--positive)';
  const limitBorderColor = limitPct >= 90 ? 'rgba(244,63,94,0.25)' : limitPct >= 70 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)';
  const limitBg = limitPct >= 90 ? 'rgba(244,63,94,0.06)' : limitPct >= 70 ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)';
  const totalAaron = monthPurchases.filter((p) => normalPerson(p) === 'aaron').reduce((s, p) => s + p.amount, 0);
  const totalCameron = monthPurchases.filter((p) => normalPerson(p) === 'cameron').reduce((s, p) => s + p.amount, 0);

  const byCategory = {};
  filtered.forEach((p) => {
    byCategory[p.category] = (byCategory[p.category] || 0) + p.amount;
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const filteredTotal = filtered.reduce((s, p) => s + p.amount, 0);

  const recurringCandidates = useMemo(() => {
    const byMerchant = {};
    purchases.forEach((p) => {
      if (!p.merchant || !p.date) return;
      const key = p.merchant.toLowerCase().trim();
      if (!byMerchant[key]) byMerchant[key] = { merchant: p.merchant, months: new Set(), amounts: [] };
      byMerchant[key].months.add(p.date.slice(0, 7));
      byMerchant[key].amounts.push(p.amount);
    });
    const billNames = new Set(bills.map((b) => b.name.toLowerCase().trim()));
    return Object.values(byMerchant)
      .filter((v) => v.months.size >= 2 && !billNames.has(v.merchant.toLowerCase().trim()))
      .map((v) => ({
        merchant: v.merchant,
        monthCount: v.months.size,
        avgAmount: Math.round((v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length) * 100) / 100,
      }))
      .sort((a, b) => b.monthCount - a.monthCount)
      .slice(0, 10);
  }, [purchases, bills]);

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Spending</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {planTab === 'spending' && (
              <>
                <button onClick={() => exportMonthCSV(mk, { bills, income, purchases })}
                  title={`Export ${mk} to CSV`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
                  <Download size={15} />
                </button>
                <button onClick={() => setShowImport(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface)', color: 'var(--accent-text)', border: '1px solid var(--accent)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
                  <Upload size={15} /> Import
                </button>
                <button onClick={() => setShowAdd(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
                  <Plus size={16} /> Log
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem', marginBottom: '1rem' }}>
          {[['spending', 'Spending'], ['commitments', 'Pledges'], ['goals', 'Goals'], ['projects', 'Projects']].map(([t, label]) => (
            <button key={t} onClick={() => setPlanTab(t)}
              style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: planTab === t ? 'var(--surface)' : 'transparent',
                color: planTab === t ? 'var(--text)' : 'var(--subtle)',
                boxShadow: planTab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {planTab === 'spending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={() => setMk(monthOffset(mk, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronLeft size={20} />
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
            <button onClick={() => setMk(monthOffset(mk, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {planTab === 'commitments' && <CommitmentsTab
        commitments={commitments} addCommitment={addCommitment} updateCommitment={updateCommitment} deleteCommitment={deleteCommitment} toggleCommitment={toggleCommitment}
        agreements={agreements} addAgreement={addAgreement} updateAgreement={updateAgreement} deleteAgreement={deleteAgreement}
        myName={myName} spouseName={spouseName}
      />}
      {planTab === 'goals' && <GoalsTab
        plannedExpenses={plannedExpenses} addPlannedExpense={addPlannedExpense} updatePlannedExpense={updatePlannedExpense} deletePlannedExpense={deletePlannedExpense}
        savings={savings}
      />}
      {planTab === 'projects' && <ProjectsTab
        projects={projects} addProject={addProject} updateProject={updateProject} deleteProject={deleteProject}
      />}

      {planTab === 'spending' && <div style={{ padding: '0 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[['all', 'All', 'var(--accent)'], ['aaron', aaronLabel, 'var(--accent)'], ['cameron', cameronLabel, '#a78bfa']].map(([val, label, activeColor]) => (
            <button key={val} onClick={() => setPersonFilter(val)}
              style={{ flex: 1, padding: '0.5rem 0', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: personFilter === val ? activeColor : 'var(--surface2)',
                color: personFilter === val ? '#fff' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ backgroundColor: spendingLimit > 0 ? limitBg : 'var(--surface)', border: `1px solid ${spendingLimit > 0 ? limitBorderColor : 'var(--border)'}`, borderRadius: '1rem', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div>
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: '700', marginBottom: '0.25rem' }}>Total Spent</p>
              <p style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>{formatCurrency(totalAll)}</p>
            </div>
            {spendingLimit > 0 && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', fontWeight: '600', textAlign: 'right', marginTop: '0.25rem' }}>
                of {formatCurrency(spendingLimit)}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: spendingLimit > 0 ? '0.875rem' : 0 }}>
            <div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', fontWeight: '600', marginBottom: '0.125rem' }}>{aaronLabel}</p>
              <p style={{ fontSize: '0.9375rem', fontWeight: '800', color: 'var(--text)' }}>{formatCurrency(totalAaron)}</p>
            </div>
            <div style={{ width: '1px', backgroundColor: 'var(--border)', alignSelf: 'stretch' }} />
            <div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', fontWeight: '600', marginBottom: '0.125rem' }}>{cameronLabel}</p>
              <p style={{ fontSize: '0.9375rem', fontWeight: '800', color: 'var(--text)' }}>{formatCurrency(totalCameron)}</p>
            </div>
          </div>
          {spendingLimit > 0 ? (
            <>
              <div style={{ height: '6px', backgroundColor: 'var(--surface2)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div style={{ height: '100%', width: `${limitPct}%`, backgroundColor: limitColor, borderRadius: '999px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: '700', color: limitColor }}>
                  {totalAll > spendingLimit ? `${formatCurrency(totalAll - spendingLimit)} over` : `${formatCurrency(spendingLimit - totalAll)} left`}
                </p>
                <button onClick={() => { setLimitInput(String(spendingLimit)); setShowLimitEdit(true); }}
                  style={{ fontSize: '0.75rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                  Edit limit
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', fontWeight: '600' }}>Show in Available</span>
                <button onClick={() => setSettings({ ...settings, purchasesInAvailable: !purchasesInAvailable })}
                  style={{ width: '2.5rem', height: '1.375rem', borderRadius: '999px', border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.2s', position: 'relative',
                    backgroundColor: purchasesInAvailable ? 'var(--accent)' : 'var(--surface2)' }}>
                  <span style={{ position: 'absolute', top: '0.1875rem', width: '1rem', height: '1rem', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s',
                    left: purchasesInAvailable ? '1.25rem' : '0.1875rem' }} />
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => { setLimitInput(''); setShowLimitEdit(true); }}
              style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem' }}>
              <Plus size={13} /> Set spending limit
            </button>
          )}
        </div>

        {topCategories.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.125rem', scrollbarWidth: 'none' }}>
            {topCategories.map(([cat, amt]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0, padding: '0.375rem 0.75rem', borderRadius: '999px', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text)' }}>{cat}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--subtle)', fontWeight: '700' }}>{formatCurrency(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <ShoppingBag size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              {monthPurchases.length === 0 ? 'No purchases yet' : 'No purchases for this filter'}
            </p>
            {monthPurchases.length === 0 && (
              <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Tap Add to log day-to-day spending.</p>
            )}
            {monthPurchases.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                <Plus size={18} /> Log Purchase
              </button>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            {sorted.map((p, i) => (
              <div key={p.id} style={i === sorted.length - 1 ? { borderBottom: 'none' } : {}}>
                <PurchaseRow purchase={p} onEdit={setEditItem} onDelete={deletePurchase}
                  onAttach={(p) => setAttachPurchaseId(p.id)}
                  myName={myName} spouseName={spouseName} />
              </div>
            ))}
            {personFilter !== 'all' && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '600' }}>
                  Total ({personFilter === 'aaron' ? aaronLabel : cameronLabel})
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(filteredTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>}

      {planTab === 'spending' && <div style={{ padding: '0 1rem', marginTop: '1rem' }}>
        <button onClick={() => setShowTemplates(!showTemplates)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
          {showTemplates ? <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
          <Calendar size={13} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Recurring Auto-Log ({recurringTemplates.length})</span>
        </button>
        {showTemplates && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginBottom: '0.25rem' }}>
            {recurringTemplates.length === 0 ? (
              <div style={{ padding: '1.25rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>Auto-log recurring expenses (subscriptions, gym, etc.) each month.</p>
                <button onClick={() => setShowAddTemplate(true)} className="app-btn-primary" style={{ maxWidth: '12rem', margin: '0 auto', fontSize: '0.8125rem' }}>
                  <Plus size={14} /> Add Template
                </button>
              </div>
            ) : (
              <>
                {recurringTemplates.map((t, i) => {
                  const currentMk = monthKey(new Date());
                  const logged = t.lastLoggedMonth === currentMk;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < recurringTemplates.length - 1 ? '1px solid var(--border)' : 'none', opacity: t.active ? 1 : 0.55 }}>
                      <button onClick={() => updateRecurringTemplate(t.id, { active: !t.active })} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: t.active ? 'var(--accent-text)' : 'var(--muted)', display: 'flex' }}>
                        {t.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)' }}>{t.merchant}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                          {formatCurrency(t.amount)} · day {t.dayOfMonth} · {t.category}
                          {logged && <span style={{ color: 'var(--positive)', marginLeft: '0.375rem' }}>✓ logged</span>}
                        </p>
                      </div>
                      <button onClick={() => setEditTemplate(t)} style={{ flexShrink: 0, padding: '0.25rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteRecurringTemplate(t.id)} style={{ flexShrink: 0, padding: '0.25rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
                <div style={{ padding: '0.625rem 1rem', backgroundColor: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setShowAddTemplate(true)} style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Plus size={13} /> Add template
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>}

      {planTab === 'spending' && recurringCandidates.length > 0 && (
        <div style={{ padding: '0 1rem', marginTop: '1rem' }}>
          <button onClick={() => setShowRecurring(!showRecurring)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
            {showRecurring ? <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
            <RefreshCw size={13} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Likely Recurring ({recurringCandidates.length})</span>
          </button>
          {showRecurring && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
              {recurringCandidates.map((r, i) => (
                <div key={r.merchant} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: i < recurringCandidates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)' }}>{r.merchant}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>avg {formatCurrency(r.avgAmount)} · {r.monthCount} months</p>
                  </div>
                  <button onClick={() => setAddRecurringBill({ name: r.merchant, amount: r.avgAmount })}
                    style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.35rem 0.625rem', borderRadius: '0.5rem', backgroundColor: 'rgba(99,102,241,0.12)', color: 'var(--accent-text)', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                    + Bill
                  </button>
                </div>
              ))}
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--surface2)' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>These merchants appear in 2+ months and aren't in your bills list</p>
              </div>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title="Log Purchase" onClose={() => setShowAdd(false)}>
          <PurchaseForm
            onSave={async (data, pendingFile) => {
              const id = generateId();
              addPurchase({ ...data, id });
              setShowAdd(false);
              if (pendingFile && user?.uid) {
                try {
                  const att = await uploadFile(`users/${user.uid}/purchases/${id}`, pendingFile);
                  updatePurchase(id, { attachments: [att] });
                } catch { /* receipt upload failed silently */ }
              }
            }}
            onCancel={() => setShowAdd(false)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {editItem && (
        <Modal title="Edit Purchase" onClose={() => setEditItem(null)}>
          <PurchaseForm
            initial={editItem}
            onSave={(data) => { updatePurchase(editItem.id, data); setEditItem(null); }}
            onCancel={() => setEditItem(null)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {showAddTemplate && (
        <Modal title="New Recurring Template" onClose={() => setShowAddTemplate(false)}>
          <RecurringTemplateForm
            onSave={(data) => { addRecurringTemplate(data); setShowAddTemplate(false); }}
            onCancel={() => setShowAddTemplate(false)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {editTemplate && (
        <Modal title="Edit Template" onClose={() => setEditTemplate(null)}>
          <RecurringTemplateForm
            initial={editTemplate}
            onSave={(data) => { updateRecurringTemplate(editTemplate.id, data); setEditTemplate(null); }}
            onCancel={() => setEditTemplate(null)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {addRecurringBill && (
        <Modal title="Add as Bill" onClose={() => setAddRecurringBill(null)}>
          <BillForm
            initial={{ name: addRecurringBill.name, amount: addRecurringBill.amount, isRecurring: true }}
            onSave={(data) => { addBill({ ...data, month: mk, startMonth: mk }); setAddRecurringBill(null); }}
            onCancel={() => setAddRecurringBill(null)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {showImport && (
        <Modal title="Import Purchases" onClose={() => setShowImport(false)}>
          <ImportPurchasesModal
            onImport={(entries) => {
              bulkAddPurchases(entries);
              setShowImport(false);
            }}
            onCancel={() => setShowImport(false)}
            existingPurchases={purchases}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {attachPurchaseId && (() => {
        const purchase = purchases.find((p) => p.id === attachPurchaseId);
        if (!purchase) return null;
        return (
          <Modal title={`Receipt · ${purchase.merchant}`} onClose={() => setAttachPurchaseId(null)}>
            <FileUpload
              storagePath={`users/${user?.uid}/purchases/${purchase.id}`}
              attachments={purchase.attachments || []}
              accept="image/*,.pdf"
              onAdd={(att) => updatePurchase(purchase.id, { attachments: [...(purchase.attachments || []), att] })}
              onRemove={(id) => updatePurchase(purchase.id, { attachments: (purchase.attachments || []).filter((a) => a.id !== id) })}
            />
          </Modal>
        );
      })()}
      {showLimitEdit && (
        <Modal title="Monthly Spending Limit" onClose={() => setShowLimitEdit(false)}>
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
              Set a cap on logged purchases for the month. The bar turns yellow at 70% and red at 90%.
            </p>
            <input
              type="number"
              inputMode="decimal"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              placeholder="e.g. 2000"
              autoFocus
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--text)', fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.75rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {spendingLimit > 0 && (
                <button onClick={() => { setSettings({ ...settings, monthlySpendingBudget: 0 }); setShowLimitEdit(false); }}
                  style={{ flex: 1, padding: '0.875rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--danger)', fontSize: '0.9375rem', fontWeight: '700', cursor: 'pointer' }}>
                  Remove Limit
                </button>
              )}
              <button onClick={() => { setSettings({ ...settings, monthlySpendingBudget: parseFloat(limitInput) || 0 }); setShowLimitEdit(false); }}
                className="app-btn-primary" style={{ flex: 2 }}>
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
