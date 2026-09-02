import { useState } from 'react';
import {
  ExternalLink, MoreVertical, Pencil, Trash2,
  ChevronLeft, ChevronRight, Receipt, Info, X,
  CalendarOff, AlertTriangle, Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatCurrency, monthKey, monthLabel, getDueDateLabel,
  getBillsForMonth, getBillStatus, getBillStatusColor, isBillOverdueUnpaid,
} from '../utils/helpers';
import Modal from '../components/Modal';
import BillForm from '../components/BillForm';

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
  if (normalized === 'cameron') return (
    <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--accent-text)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', fontWeight: '600' }}>{spouseName || 'Secondary User'}</span>
  );
  return (
    <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--accent-text)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', fontWeight: '600' }}>{myName || 'Primary User'}</span>
  );
}


function BillCard({ bill, mk, onSetStatus, onEdit, onDelete, myName, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const status = getBillStatus(bill, mk);
  const statusColor = getBillStatusColor(status, bill.dueDay);
  const isPermanent = bill.isPermanent || (!bill.dueDay && bill.isRecurring);
  const dueDateLabel = !isPermanent && bill.dueDay ? getDueDateLabel(bill.dueDay) : null;
  const isPaid = status === 'paid';
  const overdue = isBillOverdueUnpaid(bill, mk);

  const accentColor = isPaid ? 'var(--positive-text)' : status === 'pending' ? 'var(--warn)' : overdue ? 'var(--danger)' : 'var(--border)';

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '0.25rem', backgroundColor: accentColor }} />
      <div style={{ padding: '1rem', paddingLeft: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
              <p style={{ fontWeight: '700', fontSize: '1rem', lineHeight: 1.3, color: isPaid ? 'var(--subtle)' : 'var(--text)', textDecoration: isPaid ? 'line-through' : 'none' }}>{bill.name}</p>
              {ownerBadge(bill.owner, myName, spouseName)}
              {isPermanent && (
                <span style={{ fontSize: '0.625rem', backgroundColor: 'var(--surface2)', color: 'var(--subtle)', border: '1px solid var(--border)', padding: '0.125rem 0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CalendarOff size={9} /> Permanent
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{bill.category}</p>
              {dueDateLabel && <span style={{ fontSize: '0.75rem', fontWeight: '600', color: statusColor }}>· {dueDateLabel}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem', flexShrink: 0 }}>
            <p style={{ fontSize: '1.25rem', fontWeight: '900', color: isPaid ? 'var(--positive-text)' : status === 'pending' ? 'var(--warn)' : 'var(--text)' }}>
              {formatCurrency(bill.amount)}
            </p>
            <button onClick={() => setMenuOpen(!menuOpen)}
              style={{ padding: '0.25rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
              <MoreVertical size={16} />
            </button>
          </div>
        </div>

        {(bill.notes || (bill.paymentUrl && !isPaid)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem' }}>
            {bill.notes && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowNote(!showNote)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)', backgroundColor: 'var(--surface2)', padding: '0.375rem 0.625rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}>
                  <Info size={13} /> Note
                </button>
                {showNote && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowNote(false)} />
                    <div style={{ position: 'absolute', left: 0, top: '2.25rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: '0.75rem', minWidth: '13.75rem', maxWidth: '17.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bill.name} — Note</p>
                        <button onClick={() => setShowNote(false)} style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
                      </div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-words' }}>{bill.notes}</p>
                    </div>
                  </>
                )}
              </div>
            )}
            {bill.paymentUrl && !isPaid && (
              <a href={bill.paymentUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', backgroundColor: 'var(--accent)', color: '#fff', padding: '0.375rem 0.75rem', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: '600' }}>
                Pay <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        {/* Status control */}
        <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--surface2)', padding: '0.25rem', borderRadius: '0.75rem', marginTop: '0.75rem' }}>
          {[
            { val: 'unpaid', label: 'Unpaid', color: 'var(--danger)' },
            { val: 'pending', label: 'Pending', color: 'var(--warn)' },
            { val: 'paid', label: 'Paid', color: 'var(--positive-text)' },
          ].map(({ val, label, color }) => (
            <button key={val} onClick={() => onSetStatus(bill.id, mk, val)}
              style={{ flex: 1, padding: '0.375rem 0', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: status === val ? color : 'transparent',
                color: status === val ? '#fff' : 'var(--subtle)',
                boxShadow: status === val ? '0 1px 4px rgba(0,0,0,0.2)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'absolute', right: '0.75rem', top: '3rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onEdit(bill); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { onDelete(bill.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Bills() {
  const { bills, addBill, updateBill, deleteBill, setBillStatusDirect, settings, selectedMonth: mk, setSelectedMonth: setMk } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null);

  const { myName, spouseName } = settings;
  const aaronLabel = myName || 'Primary User';
  const cameronLabel = spouseName || 'Secondary User';

  const monthBills = getBillsForMonth(bills, mk);

  const filtered = ownerFilter
    ? monthBills.filter((b) => normalizeOwner(b.owner) === ownerFilter)
    : monthBills;

  const sorted = [...filtered].sort((a, b) => {
    const order = { unpaid: 0, pending: 1, paid: 2 };
    const aStatus = getBillStatus(a, mk);
    const bStatus = getBillStatus(b, mk);
    if (order[aStatus] !== order[bStatus]) return order[aStatus] - order[bStatus];
    const aOverdue = isBillOverdueUnpaid(a, mk) ? -1 : 0;
    const bOverdue = isBillOverdueUnpaid(b, mk) ? -1 : 0;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return (a.dueDay || 99) - (b.dueDay || 99);
  });

  const totals = {
    unpaid: monthBills.filter((b) => getBillStatus(b, mk) === 'unpaid').reduce((s, b) => s + b.amount, 0),
    pending: monthBills.filter((b) => getBillStatus(b, mk) === 'pending').reduce((s, b) => s + b.amount, 0),
    paid: monthBills.filter((b) => getBillStatus(b, mk) === 'paid').reduce((s, b) => s + b.amount, 0),
  };

  const overdueCount = monthBills.filter((b) => isBillOverdueUnpaid(b, mk)).length;

  const toggleOwner = (val) => setOwnerFilter((cur) => (cur === val ? null : val));

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Bills</h1>
          <button onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
            <Plus size={16} /> Add Bill
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

        {monthBills.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Unpaid</p>
                <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--danger)' }}>{formatCurrency(totals.unpaid)}</p>
              </div>
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Pending</p>
                <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--warn)' }}>{formatCurrency(totals.pending)}</p>
              </div>
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Paid</p>
                <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--positive-text)' }}>{formatCurrency(totals.paid)}</p>
              </div>
            </div>

            {overdueCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem', marginBottom: '0.75rem' }}>
                <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <p style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: '600' }}>
                  {overdueCount} bill{overdueCount > 1 ? 's are' : ' is'} overdue this month
                </p>
              </div>
            )}

            <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem' }}>
              {[['aaron', aaronLabel], ['cameron', cameronLabel], ['joint', 'Joint']].map(([val, label]) => (
                <button key={val} onClick={() => toggleOwner(val)}
                  style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: ownerFilter === val ? 'var(--surface)' : 'transparent',
                    color: ownerFilter === val ? 'var(--text)' : 'var(--subtle)',
                    boxShadow: ownerFilter === val ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <Receipt size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              {monthBills.length === 0 ? 'No bills yet' : 'No bills for this person'}
            </p>
            {monthBills.length === 0 && (
              <>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Tap Add Bill to get started.</p>
                <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                  <Plus size={18} /> Add Bill
                </button>
              </>
            )}
          </div>
        ) : (
          sorted.map((bill) => (
            <BillCard key={bill.id} bill={bill} mk={mk} onSetStatus={setBillStatusDirect}
              onEdit={setEditBill} onDelete={deleteBill} myName={myName} spouseName={spouseName} />
          ))
        )}
      </div>

      {showAdd && (
        <Modal title="Add Bill" onClose={() => setShowAdd(false)}>
          <BillForm
            onSave={(data) => { addBill({ ...data, month: mk, startMonth: mk }); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
      {editBill && (
        <Modal title="Edit Bill" onClose={() => setEditBill(null)}>
          <BillForm
            initial={editBill}
            onSave={(data) => { updateBill(editBill.id, data); setEditBill(null); }}
            onCancel={() => setEditBill(null)}
            myName={myName}
            spouseName={spouseName}
          />
        </Modal>
      )}
    </div>
  );
}
