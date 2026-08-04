import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { loadSharedView } from '../utils/firestoreSync';
import { formatCurrency, monthKey, getBillStatus, isTaskList } from '../utils/helpers';
import {
  TrendingUp, Receipt, ShoppingBag, CreditCard, PiggyBank,
  CheckSquare, Square, ShoppingCart, X, ListChecks, Lock,
} from 'lucide-react';

/* ─── tiny helpers ─────────────────────────────────────────────────── */
function fmt(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Row({ left, right, sub, dim }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid #232330' }}>
      <div>
        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: dim ? '#555' : '#f0f0f2', textDecoration: dim ? 'line-through' : 'none' }}>{left}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.1rem' }}>{sub}</p>}
      </div>
      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: dim ? '#444' : '#f0f0f2', flexShrink: 0, marginLeft: '1rem' }}>{right}</p>
    </div>
  );
}

/* ─── bottom drawer ────────────────────────────────────────────────── */
function Drawer({ open, onClose, title, icon: Icon, color, children }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 40, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: '#15151c',
        borderRadius: '1.5rem 1.5rem 0 0',
        border: '1px solid #2a2a38',
        borderBottom: 'none',
        maxHeight: '82svh',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0' }}>
          <div style={{ width: '2.5rem', height: '0.25rem', backgroundColor: '#333344', borderRadius: '9999px' }} />
        </div>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem 0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.75rem', backgroundColor: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} style={{ color }} />
            </div>
            <p style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#f0f0f2' }}>{title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '0.25rem', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>
        {/* scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 1.25rem 3rem', flex: 1 }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ─── icon tile ────────────────────────────────────────────────────── */
function Tile({ icon: Icon, label, value, sub, color, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        background: `linear-gradient(145deg, ${color}14 0%, #1a1a24 100%)`,
        border: `1px solid ${color}33`,
        borderRadius: '1.25rem',
        padding: '1.1rem 1rem',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        transition: 'transform 0.1s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.75rem', backgroundColor: color + '28', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f0f0f2', lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.15rem' }}>{sub}</p>}
      </div>
      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color }}>{label}</p>
    </button>
  );
}

/* ─── pin gate ─────────────────────────────────────────────────────── */
function PinGate({ correctPin, token, onUnlock }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);
  const [remember, setRemember] = useState(true);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => { setTimeout(() => refs[0].current?.focus(), 120); }, []);

  const tryUnlock = (pin) => {
    if (pin === correctPin) {
      if (remember) localStorage.setItem('finance_pin_' + token, pin);
      onUnlock();
    } else {
      setShake(true);
      setError(true);
      setDigits(['', '', '', '']);
      setTimeout(() => { setShake(false); refs[0].current?.focus(); }, 600);
    }
  };

  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...digits];
    next[i] = val.slice(-1);
    setDigits(next);
    setError(false);
    if (val && i < 3) refs[i + 1].current?.focus();
    if (val && i === 3) tryUnlock([...next.slice(0, 3), val.slice(-1)].join(''));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus();
  };

  const pin = digits.join('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backgroundColor: 'rgba(14,14,20,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div style={{ width: '100%', maxWidth: '22rem', backgroundColor: '#15151c', border: '1px solid #2a2a38', borderRadius: '1.75rem', padding: '2.25rem 1.75rem', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ width: '4rem', height: '4rem', borderRadius: '1.25rem', backgroundColor: '#6366f118', border: '1px solid #6366f133', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Lock size={26} style={{ color: '#818cf8' }} />
          </div>
          <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f0f0f2', marginBottom: '0.35rem' }}>Family Finance</p>
          <p style={{ fontSize: '0.875rem', color: '#555' }}>Enter PIN to view</p>
        </div>

        {/* 4 digit boxes */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: error ? '0.75rem' : '1.5rem', animation: shake ? 'pin-shake 0.5s' : 'none' }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{ width: '3.25rem', height: '3.75rem', textAlign: 'center', fontSize: '1.75rem', fontWeight: 900, backgroundColor: '#0e0e14', border: `2px solid ${error ? '#f43f5e' : d ? '#6366f1' : '#2a2a38'}`, borderRadius: '1rem', color: '#f0f0f2', outline: 'none', caretColor: 'transparent', transition: 'border-color 0.15s' }}
            />
          ))}
        </div>

        {error && <p style={{ textAlign: 'center', color: '#f43f5e', fontSize: '0.8125rem', marginBottom: '1rem', fontWeight: 600 }}>Incorrect PIN — try again</p>}

        {/* remember toggle */}
        <button
          onClick={() => setRemember(!remember)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 0', background: 'none', border: 'none', cursor: 'pointer', borderTop: '1px solid #232330', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#888' }}>Remember this device</span>
          <div style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', backgroundColor: remember ? '#6366f1' : '#2a2a38', transition: 'background-color 0.2s', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '0.1875rem', left: remember ? '1.3125rem' : '0.1875rem', width: '1.125rem', height: '1.125rem', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
          </div>
        </button>

        <button
          onClick={() => tryUnlock(pin)}
          disabled={pin.length < 4}
          style={{ width: '100%', padding: '0.9375rem', backgroundColor: pin.length === 4 ? '#6366f1' : '#1a1a24', color: pin.length === 4 ? '#fff' : '#444', border: 'none', borderRadius: '1rem', fontSize: '1rem', fontWeight: 700, cursor: pin.length === 4 ? 'pointer' : 'default', transition: 'background-color 0.2s, color 0.2s' }}>
          Unlock
        </button>
      </div>
      <style>{`@keyframes pin-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-7px)} 80%{transform:translateX(7px)} }`}</style>
    </div>
  );
}

/* ─── loading / error ──────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e0e14' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', border: '3px solid #222', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ color: '#555', fontSize: '0.875rem', marginTop: '1rem' }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── main dashboard ───────────────────────────────────────────────── */
function ReadOnlyDashboard({ data }) {
  const [active, setActive] = useState(null);
  const open = (key) => setActive(key);
  const close = () => setActive(null);

  const mk = monthKey(new Date());
  const {
    settings = {}, bills = [], income = [], purchases = [],
    debts = [], savings = [], commitments = [],
    shoppingLists = [], shoppingItems = [],
  } = data;
  const { myName = 'Me', spouseName = 'Partner' } = settings;

  /* derived */
  const monthBills = bills.filter((b) => (!b.startMonth || b.startMonth <= mk) && (!b.endMonth || b.endMonth >= mk));
  const paidBills = monthBills.filter((b) => getBillStatus(b, mk) === 'paid');
  const totalBills = monthBills.reduce((s, b) => s + (b.amount || 0), 0);

  const mult = (f) => f === 'weekly' ? 4.33 : f === 'biweekly' ? 2.17 : 1;
  const totalIncome = income.reduce((s, i) => s + (i.amount || 0) * mult(i.frequency), 0);

  const monthPurchases = purchases.filter((p) => p.date?.startsWith(mk));
  const totalSpending = monthPurchases.reduce((s, p) => s + (p.amount || 0), 0);
  const meSpent = monthPurchases.filter((p) => p.person === 'me' || p.person === 'aaron').reduce((s, p) => s + p.amount, 0);
  const partnerSpent = monthPurchases.filter((p) => p.person !== 'me' && p.person !== 'aaron').reduce((s, p) => s + p.amount, 0);

  const totalDebt = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const totalSavings = savings.reduce((s, sv) => s + (sv.balance || 0), 0);
  const netWorth = totalSavings - totalDebt;

  const todoLists = shoppingLists.filter((l) => isTaskList(l.type));
  const shoppingOnlyLists = shoppingLists.filter((l) => !isTaskList(l.type));
  const incompleteCount = shoppingItems.filter((i) => todoLists.some((l) => l.id === i.listId) && (i.status === 'pending' || !i.status)).length;

  const sharedAt = data.updatedAt
    ? new Date(data.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div style={{ minHeight: '100svh', backgroundColor: '#0e0e14', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── header ── */}
      <div style={{ padding: '1.25rem 1.25rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.625rem' }}>
          <img src="/ExpenseTracker/app-icon.jpeg" alt="" style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', objectFit: 'cover' }} />
          <div>
            <p style={{ fontSize: '1.0625rem', fontWeight: 900, color: '#f0f0f2', letterSpacing: '-0.01em' }}>Family Finance</p>
            <p style={{ fontSize: '0.75rem', color: '#555' }}>
              Shared by {myName}{sharedAt ? ` · ${sharedAt}` : ''}
            </p>
          </div>
        </div>
        <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '0.75rem', padding: '0.5rem 0.875rem', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: '#d97706' }}>Read-only snapshot · tap a card to explore</p>
        </div>

        {/* ── net worth summary bar ── */}
        <div style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a38', borderRadius: '1.25rem', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#555', marginBottom: '0.2rem' }}>Net Worth</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 900, color: netWorth >= 0 ? '#10b981' : '#f43f5e', lineHeight: 1 }}>{formatCurrency(netWorth)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#555', marginBottom: '0.2rem' }}>Available</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f0f0f2', lineHeight: 1 }}>{formatCurrency(totalIncome - totalBills)}</p>
          </div>
        </div>
      </div>

      {/* ── icon grid ── */}
      <div style={{ padding: '0 1.25rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Tile
          icon={TrendingUp} label="Income" color="#10b981"
          value={formatCurrency(totalIncome)}
          sub={`${income.length} source${income.length !== 1 ? 's' : ''}`}
          onClick={() => open('income')}
        />
        <Tile
          icon={Receipt} label="Bills" color="#6366f1"
          value={`${paidBills.length}/${monthBills.length}`}
          sub={`${formatCurrency(totalBills)} total`}
          onClick={() => open('bills')}
        />
        <Tile
          icon={ShoppingBag} label="Spending" color="#f59e0b"
          value={formatCurrency(totalSpending)}
          sub={`${monthPurchases.length} purchase${monthPurchases.length !== 1 ? 's' : ''} this month`}
          onClick={() => open('spending')}
        />
        <Tile
          icon={PiggyBank} label="Savings" color="#06b6d4"
          value={formatCurrency(totalSavings)}
          sub={`${savings.length} account${savings.length !== 1 ? 's' : ''}`}
          onClick={() => open('savings')}
        />
        <Tile
          icon={CreditCard} label="Debts" color="#f43f5e"
          value={formatCurrency(totalDebt)}
          sub={`${debts.length} account${debts.length !== 1 ? 's' : ''}`}
          onClick={() => open('debts')}
        />
        <Tile
          icon={shoppingOnlyLists.length > 0 ? ShoppingCart : ListChecks}
          label="Lists"
          color="#a78bfa"
          value={String(shoppingLists.length)}
          sub={incompleteCount > 0 ? `${incompleteCount} items pending` : 'all done'}
          onClick={() => open('lists')}
        />
      </div>

      {/* ══ drawers ══ */}

      {/* Income */}
      <Drawer open={active === 'income'} onClose={close} title="Income" icon={TrendingUp} color="#10b981">
        <div style={{ marginBottom: '1rem', backgroundColor: '#10b98118', border: '1px solid #10b98133', borderRadius: '1rem', padding: '1rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#10b981', marginBottom: '0.25rem' }}>Total Monthly</p>
          <p style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981' }}>{formatCurrency(totalIncome)}</p>
        </div>
        {income.map((i, idx) => {
          const mo = (i.amount || 0) * mult(i.frequency);
          const person = i.person === 'spouse' ? spouseName : myName;
          return (
            <Row key={i.id || idx}
              left={i.source || i.name}
              sub={`${i.frequency} · ${person}`}
              right={formatCurrency(mo) + '/mo'}
            />
          );
        })}
      </Drawer>

      {/* Bills */}
      <Drawer open={active === 'bills'} onClose={close} title="Bills" icon={Receipt} color="#6366f1">
        <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, backgroundColor: '#10b98118', border: '1px solid #10b98133', borderRadius: '0.875rem', padding: '0.75rem' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#10b981', marginBottom: '0.2rem' }}>Paid</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{paidBills.length}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: '#f59e0b18', border: '1px solid #f59e0b33', borderRadius: '0.875rem', padding: '0.75rem' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f59e0b', marginBottom: '0.2rem' }}>Unpaid</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b' }}>{monthBills.length - paidBills.length}</p>
          </div>
          <div style={{ flex: 1, backgroundColor: '#6366f118', border: '1px solid #6366f133', borderRadius: '0.875rem', padding: '0.75rem' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a5b4fc', marginBottom: '0.2rem' }}>Total</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#a5b4fc' }}>{formatCurrency(totalBills)}</p>
          </div>
        </div>
        {[...monthBills].sort((a, b) => (getBillStatus(a, mk) === 'paid') - (getBillStatus(b, mk) === 'paid')).map((b, i) => {
          const paid = getBillStatus(b, mk) === 'paid';
          return (
            <div key={b.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid #232330' }}>
              {paid
                ? <CheckSquare size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                : <Square size={16} style={{ color: '#555', flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: paid ? '#555' : '#f0f0f2', textDecoration: paid ? 'line-through' : 'none' }}>{b.name}</p>
                {b.dueDay && <p style={{ fontSize: '0.7rem', color: '#555' }}>Due day {b.dueDay}</p>}
              </div>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: paid ? '#444' : '#f0f0f2' }}>{formatCurrency(b.amount)}</p>
            </div>
          );
        })}
      </Drawer>

      {/* Spending */}
      <Drawer open={active === 'spending'} onClose={close} title="Spending" icon={ShoppingBag} color="#f59e0b">
        <div style={{ marginBottom: '1rem', backgroundColor: '#f59e0b10', border: '1px solid #f59e0b33', borderRadius: '1rem', padding: '1rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#f59e0b', marginBottom: '0.2rem' }}>This Month</p>
          <p style={{ fontSize: '2rem', fontWeight: 900, color: '#f0f0f2' }}>{formatCurrency(totalSpending)}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8rem', color: '#777' }}>
            <span>{myName}: <strong style={{ color: '#f0f0f2' }}>{formatCurrency(meSpent)}</strong></span>
            <span>{spouseName}: <strong style={{ color: '#f0f0f2' }}>{formatCurrency(partnerSpent)}</strong></span>
          </div>
        </div>
        {[...monthPurchases].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p, i) => (
          <Row key={p.id || i}
            left={p.merchant || '—'}
            sub={`${fmt(p.date)} · ${p.category || ''} · ${p.person === 'me' || p.person === 'aaron' ? myName : spouseName}`}
            right={formatCurrency(p.amount)}
          />
        ))}
        {monthPurchases.length === 0 && <p style={{ color: '#555', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No purchases this month</p>}
      </Drawer>

      {/* Savings */}
      <Drawer open={active === 'savings'} onClose={close} title="Savings" icon={PiggyBank} color="#06b6d4">
        <div style={{ marginBottom: '1rem', backgroundColor: '#06b6d418', border: '1px solid #06b6d433', borderRadius: '1rem', padding: '1rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#06b6d4', marginBottom: '0.2rem' }}>Total Saved</p>
          <p style={{ fontSize: '2rem', fontWeight: 900, color: '#06b6d4' }}>{formatCurrency(totalSavings)}</p>
        </div>
        {savings.map((sv, i) => {
          const pct = sv.goal ? Math.min(100, (sv.balance / sv.goal) * 100) : null;
          return (
            <div key={sv.id || i} style={{ padding: '0.75rem 0', borderBottom: '1px solid #232330' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: pct !== null ? '0.5rem' : 0 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f0f2' }}>{sv.name}</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#06b6d4' }}>{formatCurrency(sv.balance)}</p>
              </div>
              {pct !== null && (
                <>
                  <div style={{ height: '0.375rem', backgroundColor: '#232330', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#06b6d4', borderRadius: '9999px' }} />
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.25rem' }}>{pct.toFixed(0)}% of {formatCurrency(sv.goal)} goal</p>
                </>
              )}
            </div>
          );
        })}
        {savings.length === 0 && <p style={{ color: '#555', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No savings accounts</p>}
      </Drawer>

      {/* Debts */}
      <Drawer open={active === 'debts'} onClose={close} title="Debts" icon={CreditCard} color="#f43f5e">
        <div style={{ marginBottom: '1rem', backgroundColor: '#f43f5e10', border: '1px solid #f43f5e33', borderRadius: '1rem', padding: '1rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#f43f5e', marginBottom: '0.2rem' }}>Total Owed</p>
          <p style={{ fontSize: '2rem', fontWeight: 900, color: '#f43f5e' }}>{formatCurrency(totalDebt)}</p>
        </div>
        {debts.map((d, i) => (
          <Row key={d.id || i}
            left={d.name}
            sub={[d.interestRate > 0 ? `${d.interestRate}% APR` : null, d.minPayment ? `Min: ${formatCurrency(d.minPayment)}/mo` : null].filter(Boolean).join(' · ')}
            right={formatCurrency(d.balance)}
          />
        ))}
        {debts.length === 0 && <p style={{ color: '#555', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No debts</p>}
      </Drawer>

      {/* Lists */}
      <Drawer open={active === 'lists'} onClose={close} title="Lists" icon={ShoppingCart} color="#a78bfa">
        {shoppingLists.length === 0 && (
          <p style={{ color: '#555', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No lists shared</p>
        )}
        {shoppingLists.map((list) => {
          const items = shoppingItems.filter((i) => i.listId === list.id);
          const isTodo = isTaskList(list.type);
          const done = isTodo
            ? items.filter((i) => i.status === 'done' || i.status === 'completed')
            : items.filter((i) => i.checked);
          const pending = isTodo
            ? items.filter((i) => i.status === 'pending' || !i.status)
            : items.filter((i) => !i.checked);
          const priced = items.filter((i) => i.price != null);
          const total = priced.reduce((s, i) => s + (i.price || 0), 0);

          return (
            <div key={list.id} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f0f0f2' }}>{list.name}</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {priced.length > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa' }}>{formatCurrency(total)}</span>}
                  <span style={{ fontSize: '0.7rem', color: '#555' }}>{done.length}/{items.length}</span>
                </div>
              </div>
              {/* progress bar */}
              {items.length > 0 && (
                <div style={{ height: '0.25rem', backgroundColor: '#232330', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ height: '100%', width: `${items.length > 0 ? (done.length / items.length) * 100 : 0}%`, backgroundColor: '#a78bfa', borderRadius: '9999px' }} />
                </div>
              )}
              {pending.map((item, i) => (
                <div key={item.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.4rem 0', borderBottom: '1px solid #1e1e28' }}>
                  <Square size={14} style={{ color: '#444', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.875rem', color: '#f0f0f2', flex: 1 }}>{item.name}{item.qty ? ` ×${item.qty}` : ''}</p>
                  {item.price != null && <p style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>{formatCurrency(item.price)}</p>}
                </div>
              ))}
              {done.map((item, i) => (
                <div key={item.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.4rem 0', borderBottom: '1px solid #1e1e28', opacity: 0.45 }}>
                  <CheckSquare size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.875rem', color: '#888', textDecoration: 'line-through', flex: 1 }}>{item.name}{item.qty ? ` ×${item.qty}` : ''}</p>
                  {item.price != null && <p style={{ fontSize: '0.8rem', color: '#555' }}>{formatCurrency(item.price)}</p>}
                </div>
              ))}
            </div>
          );
        })}
      </Drawer>
    </div>
  );
}

/* ─── route component ──────────────────────────────────────────────── */
export default function SharedView() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!token) { setState('error'); return; }
    loadSharedView(token)
      .then((d) => {
        if (!d) { setState('error'); return; }
        setData(d);
        // Auto-unlock if no PIN set or saved PIN matches
        const saved = localStorage.getItem('finance_pin_' + token);
        if (!d.sharePin || saved === d.sharePin) setUnlocked(true);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'error') return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e0e14' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</p>
        <p style={{ color: '#f0f0f2', fontWeight: 700, marginBottom: '0.5rem' }}>Link not found or expired</p>
        <p style={{ color: '#555', fontSize: '0.875rem' }}>Ask the owner to regenerate the share link.</p>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: unlocked ? 'none' : 'blur(14px) brightness(0.35)', pointerEvents: unlocked ? 'auto' : 'none', userSelect: unlocked ? 'auto' : 'none', transition: 'filter 0.4s ease' }}>
        <ReadOnlyDashboard data={data} />
      </div>
      {!unlocked && data && (
        <PinGate correctPin={data.sharePin || '3419'} token={token} onUnlock={() => setUnlocked(true)} />
      )}
    </div>
  );
}
