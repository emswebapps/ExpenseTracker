import { useState, useMemo, useRef } from 'react';
import {
  ExternalLink, MoreVertical, Pencil, Trash2,
  ChevronLeft, ChevronRight, Receipt, Info, X,
  CalendarOff, AlertTriangle, CreditCard,
  CheckCircle2, Circle, Plus, TrendingDown,
  Wallet, SlidersHorizontal, ChevronDown, ChevronUp, Upload,
  Paperclip,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  formatCurrency, monthKey, monthLabel, getDueDateLabel,
  getBillsForMonth, getBillStatus, getBillStatusColor, isBillOverdueUnpaid,
  calcDebtPayoff, getPayDatesForMonth,
} from '../utils/helpers';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import BillStickyNote from '../components/BillStickyNote';
import FileUpload from '../components/FileUpload';
import BillForm from '../components/BillForm';
import DebtForm from '../components/DebtForm';

function monthOffset(mk, offset) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
}

function normalizeOwner(owner) {
  if (owner === 'mine') return 'aaron';
  if (owner === 'partner') return 'cameron';
  return owner || 'aaron';
}

function OwnerBadge({ owner, myName, spouseName }) {
  const n = normalizeOwner(owner);
  const label = n === 'joint' ? 'Joint' : n === 'cameron' ? (spouseName || 'Secondary User') : (myName || 'Primary User');
  const color = n === 'joint' ? 'var(--muted)' : n === 'cameron' ? '#a78bfa' : 'var(--accent-text)';
  return (
    <span style={{ fontSize: '0.6875rem', color, backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', fontWeight: 600 }}>
      {label}
    </span>
  );
}

const STATUS_CYCLE = { unpaid: 'pending', pending: 'paid', paid: 'unpaid' };
const STATUS_COLORS = { paid: 'var(--positive)', pending: 'var(--warn)', unpaid: 'var(--danger)' };
const STATUS_BG = { paid: 'var(--positive-soft)', pending: '#451a03', unpaid: 'var(--danger-soft)' };

function StatusControl({ status, onSet }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.25rem', marginTop: '0.75rem' }}>
      {['unpaid', 'pending', 'paid'].map((val) => (
        <button key={val} onClick={() => onSet(val)}
          style={{
            flex: 1, padding: '0.375rem 0', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            backgroundColor: status === val ? STATUS_COLORS[val] : 'transparent',
            color: status === val ? '#fff' : 'var(--subtle)',
          }}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </button>
      ))}
    </div>
  );
}

function BillCard({ bill, mk, onSetStatus, onEdit, onDelete, onAttach, myName, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef(null);
  const [showNote, setShowNote] = useState(false);
  const attachCount = (bill.attachments || []).length;
  const status = getBillStatus(bill, mk);
  const isPermanent = bill.isPermanent || (!bill.dueDay && bill.isRecurring);
  const dueDateLabel = !isPermanent && bill.dueDay ? getDueDateLabel(bill.dueDay) : null;
  const isPaid = status === 'paid';
  const overdue = isBillOverdueUnpaid(bill, mk);
  const accentColor = isPaid ? 'var(--positive)' : overdue ? 'var(--danger)' : status === 'pending' ? 'var(--warn)' : 'var(--border2)';

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', backgroundColor: accentColor }} />
      <div style={{ padding: '1rem', paddingLeft: '1.125rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: isPaid ? 'var(--subtle)' : 'var(--text)', textDecoration: isPaid ? 'line-through' : 'none' }}>{bill.name}</p>
              <OwnerBadge owner={bill.owner} myName={myName} spouseName={spouseName} />
              {isPermanent && (
                <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CalendarOff size={9} /> Permanent
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{bill.category}</span>
              {dueDateLabel && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: overdue ? 'var(--danger)' : 'var(--muted)' }}>· {dueDateLabel}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem', flexShrink: 0 }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: isPaid ? 'var(--positive-text)' : status === 'pending' ? 'var(--warn)' : 'var(--text)' }}>
              {formatCurrency(bill.amount)}
            </p>
            <button ref={menuBtnRef} onClick={() => {
              if (!menuOpen && menuBtnRef.current) {
                const rect = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen(!menuOpen);
            }} style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem' }}>
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem' }}>
          {bill.notes && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowNote(!showNote)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.375rem 0.625rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                <Info size={12} /> Note
              </button>
              {showNote && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowNote(false)} />
                  <div style={{ position: 'absolute', left: 0, top: '2.25rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: '0.75rem', minWidth: '14rem', maxWidth: '17rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bill.name}</p>
                      <button onClick={() => setShowNote(false)} style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={13} /></button>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-words' }}>{bill.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
          {bill.paymentUrl && !isPaid && (
            <a href={bill.paymentUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#fff', backgroundColor: 'var(--accent)', padding: '0.375rem 0.75rem', borderRadius: '0.5rem', textDecoration: 'none' }}>
              Pay <ExternalLink size={10} />
            </a>
          )}
          {/* Attachment button — always visible */}
          <button
            onClick={() => onAttach?.(bill)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: attachCount > 0 ? 'var(--accent-text)' : 'var(--muted)', backgroundColor: attachCount > 0 ? 'rgba(99,102,241,0.1)' : 'var(--surface2)', border: `1px solid ${attachCount > 0 ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`, padding: '0.375rem 0.625rem', borderRadius: '0.5rem', cursor: 'pointer', marginLeft: 'auto' }}>
            <Paperclip size={12} />
            {attachCount > 0 ? attachCount : 'Attach'}
          </button>
        </div>

        <StatusControl status={status} onSet={(s) => onSetStatus(bill.id, mk, s)} />
      </div>

      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onEdit(bill); setMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { onDelete(bill.id); setMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DebtCard({ debt, month, onTogglePaid, onEdit, onDelete, myName, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef(null);
  const isPaid = (debt.paidMonths || {})[month];

  return (
    <div style={{ backgroundColor: isPaid ? 'var(--positive-soft)' : 'var(--surface)', border: `1px solid ${isPaid ? 'var(--positive)' : 'var(--border)'}`, borderRadius: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <button onClick={() => onTogglePaid(debt.id, month)} style={{ flexShrink: 0, marginTop: '0.125rem', color: isPaid ? 'var(--positive-text)' : 'var(--border2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {isPaid ? <CheckCircle2 size={24} /> : <Circle size={24} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: isPaid ? 'var(--subtle)' : 'var(--text)', textDecoration: isPaid ? 'line-through' : 'none' }}>{debt.name}</p>
            <OwnerBadge owner={debt.owner} myName={myName} spouseName={spouseName} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Balance: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatCurrency(debt.balance)}</span></span>
            {debt.interestRate != null && (
              <span style={{ fontSize: '0.75rem', color: 'var(--subtle)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem' }}>{debt.interestRate}% APR</span>
            )}
          </div>
          {debt.notes && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem', lineHeight: 1.5 }}>{debt.notes}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: isPaid ? 'var(--positive-text)' : 'var(--warn)' }}>{formatCurrency(debt.minPayment)}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>min/mo</p>
          </div>
          <div style={{ position: 'relative' }}>
            <button ref={menuBtnRef} onClick={() => {
              if (!menuOpen && menuBtnRef.current) {
                const rect = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen(!menuOpen);
            }} style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}>
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                  <button onClick={() => { onEdit(debt); setMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}><Pencil size={14} /> Edit</button>
                  <button onClick={() => { onDelete(debt.id); setMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /> Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bill Calendar ─────────────────────────────────────────────────────────────

const CAL_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildCalGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const days = [];
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--)
    days.push({ date: new Date(year, month - 1, prevLast - i), cur: false });
  for (let d = 1; d <= last.getDate(); d++)
    days.push({ date: new Date(year, month, d), cur: true });
  let n = 1;
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, n++), cur: false });
  return days;
}

function BillCalendarView({ bills, income, mk, onSetStatus, myName, spouseName }) {
  const [y, m] = mk.split('-').map(Number);
  const year = y;
  const month = m - 1;

  const grid = useMemo(() => buildCalGrid(year, month), [year, month]);

  const billsByDay = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      if (b.dueDay) {
        if (!map[b.dueDay]) map[b.dueDay] = [];
        map[b.dueDay].push(b);
      }
    });
    return map;
  }, [bills]);

  const payDayNums = useMemo(() => {
    const nums = new Set();
    income.forEach((item) => {
      getPayDatesForMonth(item, mk).forEach((d) => nums.add(d.getDate()));
    });
    return nums;
  }, [income, mk]);

  const noDueDateBills = useMemo(() =>
    bills.filter((b) => !b.dueDay && !(b.isPermanent || (!b.dueDay && b.isRecurring))),
    [bills]);
  const permanentBills = useMemo(() =>
    bills.filter((b) => b.isPermanent || (!b.dueDay && b.isRecurring)),
    [bills]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const STATUS_CYCLE_MAP = { paid: 'unpaid', unpaid: 'pending', pending: 'paid' };
  const statusColors = { paid: 'var(--positive)', pending: 'var(--warn)', unpaid: 'var(--danger)' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {CAL_DOW.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.625rem', fontWeight: 700, color: 'var(--subtle)', paddingBottom: '0.25rem' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {grid.map(({ date, cur }) => {
          const ds = date.toISOString().slice(0, 10);
          const dayNum = date.getDate();
          const isToday = ds === todayStr;
          const dayBills = cur ? (billsByDay[dayNum] || []) : [];
          const isPayDay = cur && payDayNums.has(dayNum);

          return (
            <div key={ds} style={{
              borderRadius: '0.375rem',
              backgroundColor: dayBills.length > 0 ? 'rgba(239,68,68,0.06)' : isPayDay ? 'rgba(16,185,129,0.08)' : 'transparent',
              border: isToday ? '1.5px solid var(--accent)' : '1px solid transparent',
              padding: '0.2rem 0.125rem', minHeight: '3rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.125rem',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: isToday ? 800 : 500, color: cur ? (isToday ? 'var(--accent-text)' : 'var(--muted)') : 'var(--border2)' }}>
                {dayNum}
              </span>
              {isPayDay && (
                <span style={{ fontSize: '0.5625rem', fontWeight: 800, color: 'var(--positive-text)', backgroundColor: 'var(--positive-soft)', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem', lineHeight: 1.4 }}>
                  Pay
                </span>
              )}
              {dayBills.map((b) => {
                const status = getBillStatus(b, mk);
                return (
                  <span key={b.id} title={`${b.name}: ${formatCurrency(b.amount)}`}
                    onClick={() => onSetStatus(b.id, mk, STATUS_CYCLE_MAP[status])}
                    style={{
                      fontSize: '0.5rem', fontWeight: 700, color: '#fff',
                      backgroundColor: statusColors[status],
                      padding: '0.0625rem 0.25rem', borderRadius: '0.25rem', lineHeight: 1.4,
                      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                    {b.name.length > 7 ? b.name.slice(0, 6) + '…' : b.name}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        {[['var(--positive-soft)', 'var(--positive-text)', 'Pay Day'], ['var(--positive)', '#fff', 'Paid'], ['var(--warn)', '#fff', 'Pending'], ['var(--danger)', '#fff', 'Unpaid']].map(([bg, c, lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: '0.75rem', height: '0.75rem', borderRadius: '0.25rem', backgroundColor: bg, border: `1px solid ${c}` }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>{lbl}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>Tap a bill chip to cycle its status</p>

      {(permanentBills.length > 0 || noDueDateBills.length > 0) && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>No specific due date</p>
          {[...permanentBills, ...noDueDateBills].map((b) => {
            const status = getBillStatus(b, mk);
            return (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>{b.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginLeft: '0.5rem' }}>{formatCurrency(b.amount)}</span>
                </div>
                <span onClick={() => onSetStatus(b.id, mk, STATUS_CYCLE_MAP[status])}
                  style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColors[status], border: `1px solid ${statusColors[status]}`, padding: '0.125rem 0.5rem', borderRadius: '0.375rem', cursor: 'pointer', userSelect: 'none' }}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Budget Envelope Colors ────────────────────────────────────────────────────
const CAT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];
function catColor(idx) { return CAT_COLORS[idx % CAT_COLORS.length]; }

function parseBudgetText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 1) return [];
  const headers = lines[0].split('\t').map((h) => h.trim()).filter(Boolean);
  if (!headers.length) return [];
  const rawAmounts = (lines[1] || '').split('\t').map((a) => a.trim());
  return headers.map((name, i) => {
    const raw = rawAmounts[i] || '';
    const limit = raw ? Math.round(parseFloat(raw.replace(/[$,]/g, '')) * 100) / 100 : 0;
    return { name, monthlyLimit: isNaN(limit) ? 0 : limit };
  }).filter((c) => c.name);
}

function ImportBudgetModal({ existing, onImport, onCancel }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});

  function handleParse() {
    const results = parseBudgetText(text);
    setParsed(results);
    const sel = {};
    results.forEach((_, i) => { sel[i] = true; });
    setSelected(sel);
  }

  function handleImport() {
    const toImport = parsed.filter((_, i) => selected[i]);
    onImport(toImport);
  }

  const existingNames = existing.map((c) => c.name.toLowerCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', margin: 0 }}>
        Paste from Excel: Row 1 = category names, Row 2 = monthly limits (tab-separated).
      </p>
      <textarea
        style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--text)', fontSize: '0.875rem', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
        placeholder={'Leisure\tFood\tMisc\n272.86\t\t'}
        value={text}
        onChange={(e) => { setText(e.target.value); setParsed(null); }}
      />
      {!parsed && (
        <button onClick={handleParse} disabled={!text.trim()} className="app-btn-primary" style={{ alignSelf: 'flex-start' }}>
          Preview
        </button>
      )}
      {parsed && parsed.length === 0 && (
        <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>Could not parse any categories. Check format.</p>
      )}
      {parsed && parsed.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {parsed.map((cat, i) => {
              const isUpdate = existingNames.includes(cat.name.toLowerCase());
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)' }}>
                  <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))} />
                  <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>{cat.name}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>${cat.monthlyLimit.toFixed(2)}/mo</span>
                  {isUpdate && <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>update</span>}
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="button" onClick={handleImport} disabled={!Object.values(selected).some(Boolean)} className="app-btn-primary" style={{ flex: 1 }}>
              Import Selected
            </button>
          </div>
        </>
      )}
      {!parsed && (
        <button type="button" onClick={onCancel} className="app-btn-secondary">Cancel</button>
      )}
    </div>
  );
}

function CategoryForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [limit, setLimit] = useState(initial.monthlyLimit != null ? String(initial.monthlyLimit) : '');
  const isPermanent = !!initial.isPermanent;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!name || !limit) return; onSave({ name, monthlyLimit: parseFloat(limit) }); }} className="flex flex-col gap-4">
      <div>
        <label className="app-label">Category Name {isPermanent ? '' : '*'}</label>
        <input autoFocus={!isPermanent} className="app-input" placeholder="e.g. Gas, Leisure, Food"
          value={name} onChange={(e) => setName(e.target.value)}
          required disabled={isPermanent}
          style={isPermanent ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
      </div>
      <div>
        <label className="app-label">Monthly Limit *</label>
        <input autoFocus={isPermanent} type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
          value={limit} onChange={(e) => setLimit(e.target.value)} required />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}

function SpendForm({ initial = {}, categories = [], defaultCategoryId = '', onSave, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    categoryId: defaultCategoryId,
    amount: '',
    description: '',
    date: todayStr,
    account: '',
    notes: '',
    ...initial,
    amount: initial.amount != null ? String(initial.amount) : '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsCatSelect = !defaultCategoryId || initial.categoryId;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!form.categoryId || !form.description || !form.amount) return; onSave({ ...form, amount: parseFloat(form.amount) }); }} className="flex flex-col gap-4">
      {(needsCatSelect || categories.length > 1) && (
        <div>
          <label className="app-label">Category *</label>
          <select className="app-input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="app-label">Amount *</label>
          <input autoFocus={!needsCatSelect} type="number" min="0" step="0.01" className="app-input" placeholder="0.00"
            value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
        </div>
        <div>
          <label className="app-label">Date</label>
          <input type="date" className="app-input" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="app-label">Description *</label>
        <input className="app-input" placeholder="e.g. Costco, Wedding hotel"
          value={form.description} onChange={(e) => set('description', e.target.value)} required />
      </div>
      <div>
        <label className="app-label">Account / Card</label>
        <input className="app-input" placeholder="e.g. Wells Fargo, Chase"
          value={form.account} onChange={(e) => set('account', e.target.value)} />
      </div>
      <div>
        <label className="app-label">Notes</label>
        <input className="app-input" placeholder="Optional"
          value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="app-btn-secondary flex-1">Cancel</button>
        <button type="submit" className="app-btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}

function simulatePayoffStrategy(debts, extra, strategy) {
  const queue = debts
    .filter((d) => d.balance > 0 && d.minPayment > 0)
    .map((d) => ({ ...d, balance: d.balance }));
  if (strategy === 'snowball') queue.sort((a, b) => a.balance - b.balance);
  else queue.sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));

  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 600;
  while (queue.some((d) => d.balance > 0.01) && months < MAX_MONTHS) {
    months++;
    let surplus = extra;
    for (let i = 0; i < queue.length; i++) {
      const d = queue[i];
      if (d.balance <= 0.01) continue;
      const interest = d.balance * ((d.interestRate || 0) / 100 / 12);
      totalInterest += interest;
      d.balance += interest;
      const isFirst = queue.slice(0, i).every((d2) => d2.balance <= 0.01);
      const payment = Math.min(d.balance, d.minPayment + (isFirst ? surplus : 0));
      d.balance -= payment;
      if (isFirst) surplus = Math.max(0, surplus - Math.max(0, payment - d.minPayment));
    }
  }
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return { months, totalInterest, payoffDate };
}

function DebtPayoffPlanner({ debts }) {
  const [extra, setExtra] = useState('0');
  const extraAmt = Math.max(0, parseFloat(extra) || 0);
  const validDebts = debts.filter((d) => d.balance > 0 && d.minPayment > 0);

  const snowball = validDebts.length > 0 ? simulatePayoffStrategy(validDebts, extraAmt, 'snowball') : null;
  const avalanche = validDebts.length > 0 ? simulatePayoffStrategy(validDebts, extraAmt, 'avalanche') : null;
  const interestSaved = snowball && avalanche ? snowball.totalInterest - avalanche.totalInterest : 0;

  const snowOrder = [...validDebts].sort((a, b) => a.balance - b.balance);
  const avalOrder = [...validDebts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem' }}>
        <TrendingDown size={13} style={{ color: 'var(--positive-text)' }} />
        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', fontWeight: 700 }}>Payoff Planner</span>
      </div>

      {/* Per-debt at minimums */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>
        {debts.map((d) => {
          const result = calcDebtPayoff(d.balance, d.interestRate, d.minPayment);
          if (!result) return null;
          const payoffMon = result.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return (
            <div key={d.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)', marginBottom: '0.5rem' }}>{d.name}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem' }}>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>Paid off</p>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--positive-text)' }}>{payoffMon}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{result.months} mo at minimum</p>
                </div>
                <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem' }}>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>Total interest</p>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 800, color: result.totalInterest > 0 ? 'var(--danger)' : 'var(--positive-text)' }}>{formatCurrency(result.totalInterest)}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>at min payment</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategy comparison */}
      {validDebts.length > 1 && (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)', marginBottom: '0.75rem' }}>Snowball vs Avalanche</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.875rem' }}>
            <label style={{ fontSize: '0.8125rem', color: 'var(--subtle)', flexShrink: 0 }}>Extra/mo:</label>
            <input type="number" inputMode="decimal" placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)}
              className="app-input" style={{ maxWidth: '8rem' }} />
          </div>
          {snowball && avalanche && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              {[
                { label: '❄️ Snowball', subtitle: 'Lowest balance first', result: snowball, order: snowOrder },
                { label: '🌋 Avalanche', subtitle: 'Highest APR first', result: avalanche, order: avalOrder },
              ].map(({ label, subtitle, result, order }) => (
                <div key={label} style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.75rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '0.125rem' }}>{label}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.5rem' }}>{subtitle}</p>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--positive-text)' }}>
                    {result.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.375rem' }}>{result.months} months</p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(result.totalInterest)} interest</p>
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.375rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.2rem' }}>Order:</p>
                    {order.map((d, i) => (
                      <p key={d.id} style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{i + 1}. {d.name}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {interestSaved > 1 && (
            <div style={{ marginTop: '0.75rem', backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid var(--positive-text)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--positive-text)', fontWeight: 700 }}>
                Avalanche saves you {formatCurrency(interestSaved)} in interest vs snowball
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillsDebts() {
  const {
    bills, addBill, updateBill, deleteBill, setBillStatusDirect,
    debts, addDebt, updateDebt, deleteDebt, toggleDebtPaid,
    budget, setBudgetForMonth,
    budgetCategories, addBudgetCategory, updateBudgetCategory, deleteBudgetCategory, persistBudgetCategories,
    budgetSpends, addBudgetSpend, updateBudgetSpend, deleteBudgetSpend,
    settings, income,
    billStickyNotes, setBillStickyNote,
    selectedMonth: mk, setSelectedMonth: setMk,
  } = useApp();
  const { user } = useAuth();
  const [tab, setTab] = useState('bills');
  const [showAddBill, setShowAddBill] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [attachBillId, setAttachBillId] = useState(null);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [editDebt, setEditDebt] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [calView, setCalView] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { message, onConfirm }

  // Budget tab state
  const [showImportBudget, setShowImportBudget] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [showAddSpend, setShowAddSpend] = useState(null); // null | { categoryId }
  const [editSpend, setEditSpend] = useState(null);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [editBudgetAmt, setEditBudgetAmt] = useState(false);
  const [budgetAmtInput, setBudgetAmtInput] = useState('');

  const { myName, spouseName } = settings;
  const aaronLabel = myName || 'Primary User';
  const cameronLabel = spouseName || 'Secondary User';

  const monthBills = getBillsForMonth(bills, mk);
  const ownerFiltered = ownerFilter ? monthBills.filter((b) => normalizeOwner(b.owner) === ownerFilter) : monthBills;
  const filteredBills = ownerFiltered;
  const sortedBills = [...filteredBills].sort((a, b) => {
    const order = { unpaid: 0, pending: 1, paid: 2 };
    const aS = getBillStatus(a, mk), bS = getBillStatus(b, mk);
    if (order[aS] !== order[bS]) return order[aS] - order[bS];
    if (isBillOverdueUnpaid(a, mk) !== isBillOverdueUnpaid(b, mk)) return isBillOverdueUnpaid(a, mk) ? -1 : 1;
    return (a.dueDay || 99) - (b.dueDay || 99);
  });

  const billTotals = {
    unpaid: monthBills.filter((b) => getBillStatus(b, mk) === 'unpaid').reduce((s, b) => s + b.amount, 0),
    pending: monthBills.filter((b) => getBillStatus(b, mk) === 'pending').reduce((s, b) => s + b.amount, 0),
    paid: monthBills.filter((b) => getBillStatus(b, mk) === 'paid').reduce((s, b) => s + b.amount, 0),
  };
  const overdueCount = monthBills.filter((b) => isBillOverdueUnpaid(b, mk)).length;

  const filteredDebts = ownerFilter ? debts.filter((d) => normalizeOwner(d.owner) === ownerFilter) : debts;
  const sortedDebts = [
    ...filteredDebts.filter((d) => !(d.paidMonths || {})[mk]).sort((a, b) => b.balance - a.balance),
    ...filteredDebts.filter((d) => (d.paidMonths || {})[mk]).sort((a, b) => b.balance - a.balance),
  ];

  const ownerGroups = ['aaron', 'cameron', 'joint'].map((o) => ({
    key: o, label: o === 'aaron' ? aaronLabel : o === 'cameron' ? cameronLabel : 'Joint',
    balance: debts.filter((d) => normalizeOwner(d.owner) === o).reduce((s, d) => s + d.balance, 0),
    count: debts.filter((d) => normalizeOwner(d.owner) === o).length,
  })).filter((g) => g.count > 0);

  const toggleOwner = (val) => setOwnerFilter((cur) => cur === val ? null : val);

  const requestDeleteBill = (id) => {
    const bill = bills.find((b) => b.id === id);
    setConfirmDelete({ message: `Delete "${bill?.name || 'this bill'}"? This can't be undone.`, onConfirm: () => deleteBill(id) });
  };
  const requestDeleteDebt = (id) => {
    const debt = debts.find((d) => d.id === id);
    setConfirmDelete({ message: `Delete "${debt?.name || 'this debt'}"? This can't be undone.`, onConfirm: () => deleteDebt(id) });
  };
  const requestDeleteCategory = (cat) => {
    setConfirmDelete({ message: `Delete the "${cat.name}" envelope? Its logged spends will remain but won't be categorized.`, onConfirm: () => deleteBudgetCategory(cat.id) });
  };
  const requestDeleteSpend = (sp) => {
    setConfirmDelete({ message: `Delete this ${formatCurrency(sp.amount)} spend${sp.description ? ` ("${sp.description}")` : ''}?`, onConfirm: () => deleteBudgetSpend(sp.id) });
  };

  // Budget envelope computed values
  const monthBudgetSpends = useMemo(() => budgetSpends.filter((s) => s.month === mk), [budgetSpends, mk]);
  const categoryData = useMemo(() => budgetCategories.map((cat, idx) => {
    const spends = monthBudgetSpends.filter((s) => s.categoryId === cat.id).sort((a, b) => b.date.localeCompare(a.date));
    const spent = spends.reduce((sum, s) => sum + s.amount, 0);
    return { ...cat, spent, remaining: cat.monthlyLimit - spent, spends, color: catColor(idx) };
  }), [budgetCategories, monthBudgetSpends]);
  const catIds = useMemo(() => new Set(budgetCategories.map((c) => c.id)), [budgetCategories]);
  const orphanedSpends = useMemo(() => monthBudgetSpends.filter((s) => !catIds.has(s.categoryId)), [monthBudgetSpends, catIds]);
  const totalBudgetLimit = budgetCategories.reduce((s, c) => s + c.monthlyLimit, 0);
  const totalBudgetSpent = monthBudgetSpends.reduce((s, sp) => s + sp.amount, 0);
  const hardSetAmount = budget?.[mk] || 0;

  const sectionLabel = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' };

  return (
    <div className="app-page">
      <BillStickyNote
        mk={mk}
        monthLabel={monthLabel(mk)}
        note={billStickyNotes[mk]}
        onChange={(patch) => setBillStickyNote(mk, patch)}
      />
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>Bills & Debts</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {tab === 'budget' && (
              <>
                <button onClick={() => setShowImportBudget(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
                  <Upload size={15} />
                </button>
                <button onClick={() => setShowManageCategories(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
                  <SlidersHorizontal size={15} />
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (tab === 'bills') setShowAddBill(true);
                else if (tab === 'debts') setShowAddDebt(true);
                else if (tab === 'budget') {
                  if (budgetCategories.length === 0) setShowManageCategories(true);
                  else setShowAddSpend({ categoryId: '' });
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} />
              {tab === 'bills' ? 'Add Bill' : tab === 'debts' ? 'Add Debt' : budgetCategories.length === 0 ? 'Setup' : 'Add Spend'}
            </button>
          </div>
        </div>

        {/* Segmented tabs */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem', marginBottom: '1rem' }}>
          {[['bills', <Receipt size={14} />, 'Bills'], ['budget', <Wallet size={14} />, 'Budget'], ['debts', <CreditCard size={14} />, 'Debts']].map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--subtle)',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setMk(monthOffset(mk, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
          <button onClick={() => setMk(monthOffset(mk, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}><ChevronRight size={20} /></button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        {/* Owner filter */}
        {(tab === 'bills' ? monthBills : debts).length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {[['aaron', aaronLabel, 'var(--accent)'], ['cameron', cameronLabel, '#a78bfa'], ['joint', 'Joint', '#10b981']].map(([val, label, activeColor]) => (
              <button key={val} onClick={() => toggleOwner(val)}
                style={{ flex: 1, padding: '0.5rem 0', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  backgroundColor: ownerFilter === val ? activeColor : 'var(--surface2)',
                  color: ownerFilter === val ? '#fff' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Bills ── */}
        {tab === 'bills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
              <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.625rem', padding: '0.1875rem', gap: '0.125rem' }}>
                {[['List', false], ['Cal', true]].map(([lbl, v]) => (
                  <button key={lbl} onClick={() => setCalView(v)}
                    style={{ padding: '0.3rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                      backgroundColor: calView === v ? 'var(--surface)' : 'transparent',
                      color: calView === v ? 'var(--text)' : 'var(--subtle)' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {calView ? (
              monthBills.length > 0 ? (
                <BillCalendarView bills={ownerFiltered} income={income} mk={mk}
                  onSetStatus={setBillStatusDirect} myName={myName} spouseName={spouseName} />
              ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                  <Receipt size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No bills yet</p>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Track recurring bills and mark them paid each month</p>
                  <button onClick={() => setShowAddBill(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                    <Plus size={18} /> Add First Bill
                  </button>
                </div>
              )
            ) : (<>
            {overdueCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: '0.875rem', padding: '0.75rem 1rem' }}>
                <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <p style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 600 }}>
                  {overdueCount} bill{overdueCount > 1 ? 's are' : ' is'} overdue
                </p>
              </div>
            )}

            {sortedBills.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <Receipt size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  {monthBills.length === 0 ? 'No bills yet' : 'No bills for this filter'}
                </p>
                {monthBills.length === 0 && (
                  <>
                    <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Track recurring bills and mark them paid each month</p>
                    <button onClick={() => setShowAddBill(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                      <Plus size={18} /> Add First Bill
                    </button>
                  </>
                )}
              </div>
            ) : sortedBills.map((bill) => (
              <BillCard key={bill.id} bill={bill} mk={mk} onSetStatus={setBillStatusDirect}
                onEdit={setEditBill} onDelete={requestDeleteBill} onAttach={(b) => setAttachBillId(b.id)}
                myName={myName} spouseName={spouseName} />
            ))}
            </>)}
          </div>
        )}

        {/* ── Budget Envelopes ── */}
        {tab === 'budget' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {budgetCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <Wallet size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No budget envelopes yet</p>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Create categories like Gas, Leisure, or Food with monthly limits</p>
                <button onClick={() => setShowManageCategories(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                  <Plus size={18} /> Set Up Envelopes
                </button>
              </div>
            ) : (
              <>
                {/* Month overview */}
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <p style={{ ...sectionLabel }}>Monthly Budget (Fixed)</p>
                    <button onClick={() => { setEditBudgetAmt(true); setBudgetAmtInput(hardSetAmount ? String(hardSetAmount) : ''); }}
                      style={{ padding: '0.25rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  {editBudgetAmt ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                        <input type="number" inputMode="decimal" min="0" step="1" placeholder="0"
                          value={budgetAmtInput} onChange={(e) => setBudgetAmtInput(e.target.value)}
                          autoFocus className="app-input" style={{ paddingLeft: '1.75rem' }} />
                      </div>
                      <button onClick={() => { setBudgetForMonth(mk, parseFloat(budgetAmtInput) || 0); setEditBudgetAmt(false); }}
                        style={{ padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                        Set
                      </button>
                      <button onClick={() => setEditBudgetAmt(false)}
                        style={{ padding: '0.5rem', color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: '0.75rem', cursor: 'pointer' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>
                        {hardSetAmount > 0 ? `Budget set: ${formatCurrency(hardSetAmount)}` : 'Tap ✎ to set your monthly budget'}
                      </p>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: hardSetAmount > 0 && totalBudgetSpent > hardSetAmount ? 'var(--danger)' : 'var(--text)' }}>
                      {hardSetAmount > 0 ? formatCurrency(hardSetAmount - totalBudgetSpent) : '—'}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--subtle)', paddingBottom: '0.3rem' }}>available</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '9999px', backgroundColor: 'var(--border)', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, hardSetAmount > 0 ? (totalBudgetSpent / hardSetAmount) * 100 : 0)}%`, borderRadius: '9999px',
                      backgroundColor: hardSetAmount > 0 && totalBudgetSpent >= hardSetAmount ? 'var(--danger)' : hardSetAmount > 0 && totalBudgetSpent / hardSetAmount > 0.75 ? 'var(--warn)' : 'var(--accent)' }} />
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>
                    {formatCurrency(totalBudgetSpent)} spent{hardSetAmount > 0 ? ` of ${formatCurrency(hardSetAmount)} budgeted` : ''}
                  </p>
                  {budgetCategories.length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                      Envelopes below are for planning only and don't reduce the budget above
                    </p>
                  )}
                </div>

                {/* Category cards */}
                {categoryData.map((cat) => {
                  const pct = cat.monthlyLimit > 0 ? Math.min(100, (cat.spent / cat.monthlyLimit) * 100) : 0;
                  const over = cat.spent > cat.monthlyLimit;
                  const warn = !over && pct >= 75;
                  const barColor = over ? 'var(--danger)' : warn ? 'var(--warn)' : cat.color;
                  const isExpanded = expandedCats.has(cat.id);
                  const toggleExpand = () => setExpandedCats((prev) => {
                    const next = new Set(prev);
                    next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                    return next;
                  });

                  return (
                    <div key={cat.id} style={{ backgroundColor: 'var(--surface)', border: `1px solid var(--border)`, borderRadius: '1rem', overflow: 'hidden' }}>
                      {/* Color bar */}
                      <div style={{ height: '3px', backgroundColor: cat.color }} />
                      <div style={{ padding: '1rem' }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{cat.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--subtle)' }}>{formatCurrency(cat.monthlyLimit)}/mo</span>
                            <button onClick={() => { setEditCategory(cat); setShowManageCategories(true); }} style={{ padding: '0.25rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={13} /></button>
                            {!cat.isPermanent && <button onClick={() => requestDeleteCategory(cat)} style={{ padding: '0.25rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={13} /></button>}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{ height: '6px', borderRadius: '9999px', backgroundColor: 'var(--border)', overflow: 'hidden', marginBottom: '0.375rem' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: '9999px', backgroundColor: barColor, transition: 'width 0.3s' }} />
                        </div>

                        {/* Spent / remaining */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>
                            {formatCurrency(cat.spent)} spent
                          </span>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: over ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--positive-text)' }}>
                            {over ? `${formatCurrency(cat.spent - cat.monthlyLimit)} over` : `${formatCurrency(cat.remaining)} left`}
                          </span>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => setShowAddSpend({ categoryId: cat.id })}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', padding: '0.5rem', borderRadius: '0.75rem', fontSize: '0.8125rem', fontWeight: 700, border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer' }}>
                            <Plus size={14} /> Add Spend
                          </button>
                          {cat.spends.length > 0 && (
                            <button onClick={toggleExpand}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer' }}>
                              {cat.spends.length} {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          )}
                        </div>

                        {/* Expanded spend list */}
                        {isExpanded && cat.spends.length > 0 && (
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {cat.spends.map((sp) => (
                              <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.description}</p>
                                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                                    {new Date(sp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {sp.account ? ` · ${sp.account}` : ''}
                                    {sp.notes ? ` · ${sp.notes}` : ''}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                  <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{formatCurrency(sp.amount)}</span>
                                  <button onClick={() => setEditSpend(sp)} style={{ padding: '0.25rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}><Pencil size={12} /></button>
                                  <button onClick={() => requestDeleteSpend(sp)} style={{ padding: '0.25rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Orphaned / uncategorized spends */}
                {orphanedSpends.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                      <div>
                        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--warn)' }}>Uncategorized Spends</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.1rem' }}>These have no matching category and are affecting your budget.</p>
                      </div>
                      <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--warn)' }}>{formatCurrency(orphanedSpends.reduce((s, sp) => s + sp.amount, 0))}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {orphanedSpends.sort((a, b) => b.date?.localeCompare(a.date || '') || 0).map((sp) => (
                        <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.description || '—'}</p>
                            {sp.date && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{new Date(sp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{formatCurrency(sp.amount)}</span>
                            <button onClick={() => requestDeleteSpend(sp)} style={{ padding: '0.25rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add category shortcut */}
                <button onClick={() => setShowManageCategories(true)}
                  style={{ padding: '0.875rem', border: '1px dashed var(--border)', borderRadius: '0.875rem', color: 'var(--muted)', background: 'none', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Plus size={16} /> Add / Manage Envelopes
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Debts ── */}
        {tab === 'debts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {debts.length > 0 && (
              <>
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '0.25rem' }}>
                  <p style={{ ...sectionLabel, marginBottom: '0.25rem' }}>Combined Debt</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--danger)' }}>{formatCurrency(debts.reduce((s, d) => s + d.balance, 0))}</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>{debts.length} account{debts.length !== 1 ? 's' : ''} · mins: {formatCurrency(debts.reduce((s, d) => s + d.minPayment, 0))}/mo</p>
                </div>

                {ownerGroups.length > 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ownerGroups.length}, 1fr)`, gap: '0.5rem', marginBottom: '0.25rem' }}>
                    {ownerGroups.map((g) => (
                      <div key={g.key} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.75rem', textAlign: 'center' }}>
                        <p style={{ ...sectionLabel, marginBottom: '0.25rem' }}>{g.label}</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{formatCurrency(g.balance)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {sortedDebts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <CreditCard size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  {debts.length === 0 ? 'No debts added' : 'No debts for this filter'}
                </p>
                {debts.length === 0 && (
                  <>
                    <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Track loans, credit cards, and minimum payments</p>
                    <button onClick={() => setShowAddDebt(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                      <Plus size={18} /> Add First Debt
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {sortedDebts.map((debt) => (
                  <DebtCard key={debt.id} debt={debt} month={mk} onTogglePaid={toggleDebtPaid}
                    onEdit={setEditDebt} onDelete={requestDeleteDebt} myName={myName} spouseName={spouseName} />
                ))}

                {/* Debt payoff planner */}
                {debts.length > 0 && <DebtPayoffPlanner debts={debts} />}
              </>
            )}
          </div>
        )}
      </div>

      {showAddBill && (
        <Modal title="Add Bill" onClose={() => setShowAddBill(false)}>
          <BillForm onSave={(data) => { addBill({ ...data, month: mk, startMonth: mk }); setShowAddBill(false); }} onCancel={() => setShowAddBill(false)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}
      {editBill && (
        <Modal title="Edit Bill" onClose={() => setEditBill(null)}>
          <BillForm initial={editBill} onSave={(data) => { updateBill(editBill.id, data); setEditBill(null); }} onCancel={() => setEditBill(null)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}
      {attachBillId && (() => {
        const bill = bills.find((b) => b.id === attachBillId);
        if (!bill) return null;
        return (
          <Modal title={`Receipts · ${bill.name}`} onClose={() => setAttachBillId(null)}>
            <FileUpload
              storagePath={`users/${user?.uid}/bills/${bill.id}`}
              attachments={bill.attachments || []}
              onAdd={(att) => updateBill(bill.id, { attachments: [...(bill.attachments || []), att] })}
              onRemove={(id) => updateBill(bill.id, { attachments: (bill.attachments || []).filter((a) => a.id !== id) })}
            />
          </Modal>
        );
      })()}
      {showAddDebt && (
        <Modal title="Add Debt" onClose={() => setShowAddDebt(false)}>
          <DebtForm onSave={(data) => { addDebt(data); setShowAddDebt(false); }} onCancel={() => setShowAddDebt(false)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}
      {editDebt && (
        <Modal title="Edit Debt" onClose={() => setEditDebt(null)}>
          <DebtForm initial={editDebt} onSave={(data) => { updateDebt(editDebt.id, data); setEditDebt(null); }} onCancel={() => setEditDebt(null)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}

      {/* ── Budget modals ── */}
      {showImportBudget && (
        <Modal title="Import Budget" onClose={() => setShowImportBudget(false)}>
          <ImportBudgetModal
            existing={budgetCategories}
            onImport={(toImport) => {
              const updated = [...budgetCategories];
              toImport.forEach(({ name, monthlyLimit }) => {
                const idx = updated.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
                if (idx >= 0) {
                  updated[idx] = { ...updated[idx], monthlyLimit };
                } else {
                  updated.push({ id: Date.now() + Math.random(), name, monthlyLimit });
                }
              });
              persistBudgetCategories(updated);
              setShowImportBudget(false);
            }}
            onCancel={() => setShowImportBudget(false)}
          />
        </Modal>
      )}
      {showManageCategories && (
        <Modal title="Manage Envelopes" onClose={() => { setShowManageCategories(false); setEditCategory(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {budgetCategories.map((cat, idx) => (
              editCategory?.id === cat.id ? (
                <div key={cat.id} style={{ border: '1px solid var(--accent)', borderRadius: '0.875rem', padding: '0.875rem' }}>
                  <CategoryForm initial={cat} onSave={(data) => { updateBudgetCategory(cat.id, data); setEditCategory(null); }} onCancel={() => setEditCategory(null)} />
                </div>
              ) : (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', border: '1px solid var(--border)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: catColor(idx), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)' }}>{cat.name}</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{formatCurrency(cat.monthlyLimit)}/mo</p>
                  </div>
                  <button onClick={() => setEditCategory(cat)} style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={14} /></button>
                  {!cat.isPermanent && <button onClick={() => requestDeleteCategory(cat)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={14} /></button>}
                </div>
              )
            ))}
            {editCategory?.id === '__new__' ? (
              <div style={{ border: '1px solid var(--accent)', borderRadius: '0.875rem', padding: '0.875rem' }}>
                <CategoryForm onSave={(data) => { addBudgetCategory(data); setEditCategory(null); }} onCancel={() => setEditCategory(null)} />
              </div>
            ) : (
              <button onClick={() => setEditCategory({ id: '__new__' })}
                style={{ padding: '0.875rem', border: '1px dashed var(--border)', borderRadius: '0.875rem', color: 'var(--muted)', background: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Plus size={16} /> Add Envelope
              </button>
            )}
            <button onClick={() => { setShowManageCategories(false); setEditCategory(null); }} className="app-btn-secondary">Done</button>
          </div>
        </Modal>
      )}

      {showAddSpend && (
        <Modal title="Add Spend" onClose={() => setShowAddSpend(null)}>
          <SpendForm
            defaultCategoryId={showAddSpend.categoryId}
            categories={budgetCategories}
            onSave={(data) => {
              addBudgetSpend({ ...data, month: mk });
              setShowAddSpend(null);
            }}
            onCancel={() => setShowAddSpend(null)}
          />
        </Modal>
      )}

      {editSpend && (
        <Modal title="Edit Spend" onClose={() => setEditSpend(null)}>
          <SpendForm
            initial={editSpend}
            categories={budgetCategories}
            onSave={(data) => {
              updateBudgetSpend(editSpend.id, { ...data, month: mk });
              setEditSpend(null);
            }}
            onCancel={() => setEditSpend(null)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.message}
          onConfirm={() => { confirmDelete.onConfirm(); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
