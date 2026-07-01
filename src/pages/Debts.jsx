import { useState } from 'react';
import { Pencil, Trash2, MoreVertical, CreditCard, ChevronLeft, ChevronRight, CheckCircle2, Circle, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, monthKey, monthLabel } from '../utils/helpers';
import Modal from '../components/Modal';
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

function ownerBadge(owner, myName, spouseName) {
  const normalized = normalizeOwner(owner);
  if (normalized === 'joint') return (
    <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', fontWeight: '600' }}>Joint</span>
  );
  return (
    <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--accent-text)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', fontWeight: '600' }}>
      {normalized === 'cameron' ? (spouseName || 'Secondary User') : (myName || 'Primary User')}
    </span>
  );
}

function DebtCard({ debt, month, onTogglePaid, onEdit, onDelete, myName, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isPaid = (debt.paidMonths || {})[month];

  return (
    <div style={{ backgroundColor: isPaid ? 'var(--surface)' : 'var(--surface)', border: `1px solid ${isPaid ? 'var(--positive-text)' : 'var(--border)'}`, borderRadius: '1rem', padding: '1rem', opacity: isPaid ? 0.75 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <button onClick={() => onTogglePaid(debt.id, month)}
          style={{ marginTop: '0.125rem', flexShrink: 0, color: isPaid ? 'var(--positive-text)' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {isPaid ? <CheckCircle2 size={24} /> : <Circle size={24} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <p style={{ fontWeight: '700', fontSize: '1rem', color: isPaid ? 'var(--subtle)' : 'var(--text)', textDecoration: isPaid ? 'line-through' : 'none' }}>{debt.name}</p>
            {ownerBadge(debt.owner, myName, spouseName)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Balance: <span style={{ color: 'var(--text)', fontWeight: '600' }}>{formatCurrency(debt.balance)}</span></span>
            {debt.interestRate != null && (
              <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--subtle)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem' }}>{debt.interestRate}% APR</span>
            )}
          </div>
          {debt.notes && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem', lineHeight: '1.5' }}>{debt.notes}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: '900', color: isPaid ? 'var(--positive-text)' : 'var(--warn)' }}>{formatCurrency(debt.minPayment)}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>min/mo</p>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: 'absolute', right: 0, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                  <button onClick={() => { onEdit(debt); setMenuOpen(false); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button onClick={() => { onDelete(debt.id); setMenuOpen(false); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Debts() {
  const { debts, addDebt, updateDebt, deleteDebt, toggleDebtPaid, settings, selectedMonth: mk, setSelectedMonth: setMk } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState('all');

  const { myName, spouseName } = settings;
  const aaronLabel = myName || 'Primary User';
  const cameronLabel = spouseName || 'Secondary User';

  const filtered = ownerFilter === 'all' ? debts : debts.filter((d) => normalizeOwner(d.owner) === ownerFilter);

  const paidDebts = filtered.filter((d) => (d.paidMonths || {})[mk]);
  const unpaidDebts = filtered.filter((d) => !(d.paidMonths || {})[mk]);

  const sorted = [
    ...unpaidDebts.sort((a, b) => b.balance - a.balance),
    ...paidDebts.sort((a, b) => b.balance - a.balance),
  ];

  const totalBalance = filtered.reduce((s, d) => s + d.balance, 0);
  const totalMin = filtered.reduce((s, d) => s + d.minPayment, 0);

  const aaronDebts = debts.filter((d) => normalizeOwner(d.owner) === 'aaron');
  const cameronDebts = debts.filter((d) => normalizeOwner(d.owner) === 'cameron');
  const jointDebts = debts.filter((d) => normalizeOwner(d.owner) === 'joint');

  const aaronTotal = aaronDebts.reduce((s, d) => s + d.balance, 0);
  const cameronTotal = cameronDebts.reduce((s, d) => s + d.balance, 0);
  const jointTotal = jointDebts.reduce((s, d) => s + d.balance, 0);
  const combinedTotal = debts.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Debts</h1>
          <button onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
            <Plus size={16} /> Add Debt
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setMk(monthOffset(mk, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
          <button onClick={() => setMk(monthOffset(mk, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {debts.length > 0 && (
          <>
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Combined Debt</p>
              <p style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--danger)' }}>{formatCurrency(combinedTotal)}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
                {debts.length} account{debts.length !== 1 ? 's' : ''} · Monthly mins: {formatCurrency(debts.reduce((s, d) => s + d.minPayment, 0))}
              </p>
            </div>

            {(aaronDebts.length > 0 || cameronDebts.length > 0 || jointDebts.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {aaronDebts.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-text)', marginBottom: '0.25rem' }}>{aaronLabel}</p>
                    <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(aaronTotal)}</p>
                    <p style={{ fontSize: '0.625rem', color: 'var(--subtle)' }}>{aaronDebts.length} acct</p>
                  </div>
                )}
                {cameronDebts.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-text)', marginBottom: '0.25rem' }}>{cameronLabel}</p>
                    <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(cameronTotal)}</p>
                    <p style={{ fontSize: '0.625rem', color: 'var(--subtle)' }}>{cameronDebts.length} acct</p>
                  </div>
                )}
                {jointDebts.length > 0 && (
                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Joint</p>
                    <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(jointTotal)}</p>
                    <p style={{ fontSize: '0.625rem', color: 'var(--subtle)' }}>{jointDebts.length} acct</p>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem' }}>
              {[['all', 'All'], ['aaron', aaronLabel], ['cameron', cameronLabel], ['joint', 'Joint']].map(([val, label]) => (
                <button key={val} onClick={() => setOwnerFilter(val)}
                  style={{ flex: 1, padding: '0.5rem 0', borderRadius: '0.625rem', fontSize: '0.8rem', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: ownerFilter === val ? 'var(--surface)' : 'transparent',
                    color: ownerFilter === val ? 'var(--text)' : 'var(--subtle)',
                    boxShadow: ownerFilter === val ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
                  {label}
                </button>
              ))}
            </div>

            {ownerFilter !== 'all' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Balance</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--danger)' }}>{formatCurrency(totalBalance)}</p>
                </div>
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Min/mo</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--warn)' }}>{formatCurrency(totalMin)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <CreditCard size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              {debts.length === 0 ? 'No debts added' : 'No debts for this filter'}
            </p>
            {debts.length === 0 && (
              <>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Track loans, credit cards, and more.</p>
                <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                  <Plus size={18} /> Add Debt
                </button>
              </>
            )}
          </div>
        ) : sorted.map((debt) => (
          <DebtCard key={debt.id} debt={debt} month={mk} onTogglePaid={toggleDebtPaid}
            onEdit={setEditItem} onDelete={deleteDebt} myName={myName} spouseName={spouseName} />
        ))}
      </div>

      {showAdd && (
        <Modal title="Add Debt" onClose={() => setShowAdd(false)}>
          <DebtForm onSave={(data) => { addDebt(data); setShowAdd(false); }} onCancel={() => setShowAdd(false)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}
      {editItem && (
        <Modal title="Edit Debt" onClose={() => setEditItem(null)}>
          <DebtForm initial={editItem} onSave={(data) => { updateDebt(editItem.id, data); setEditItem(null); }} onCancel={() => setEditItem(null)} myName={myName} spouseName={spouseName} />
        </Modal>
      )}
    </div>
  );
}
