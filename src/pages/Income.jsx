import { useState } from 'react';
import { Pencil, Trash2, MoreVertical, TrendingUp, RefreshCw, ChevronLeft, ChevronRight, Plus, Calculator, Clock, Paperclip } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, monthKey, monthLabel, getIncomeForMonth } from '../utils/helpers';
import Modal from '../components/Modal';
import FileUpload from '../components/FileUpload';
import IncomeForm from '../components/IncomeForm';
import { PlanningContent } from './Planning';
import { WorkTimeContent } from './WorkTime';

function monthOffset(mk, offset) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
}

function monthlyAmount(item) {
  const mult = item.frequency === 'weekly' ? 4.33 : item.frequency === 'biweekly' ? 2.17 : 1;
  return item.amount * mult;
}

function IncomeCard({ item, onEdit, onDelete, onAttach, spouseEnabled, spouseName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const monthly = monthlyAmount(item);
  const attachCount = (item.attachments || []).length;

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <p style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{item.source}</p>
            {item.isRecurring && <RefreshCw size={13} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.25rem 0.625rem', borderRadius: '0.5rem' }}>
              {item.frequency}
            </span>
            {spouseEnabled && (
              <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.25rem 0.625rem', borderRadius: '0.5rem' }}>
                {item.person === 'spouse' ? (spouseName || 'Spouse') : 'Me'}
              </span>
            )}
            {item.notes && <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{item.notes}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--positive-text)' }}>{formatCurrency(monthly)}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>/mo</p>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)}
            style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        {item.frequency !== 'monthly'
          ? <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{formatCurrency(item.amount)} per paycheck</p>
          : <span />}
        <button
          onClick={() => onAttach?.(item)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: attachCount > 0 ? 'var(--accent-text)' : 'var(--muted)', backgroundColor: attachCount > 0 ? 'rgba(99,102,241,0.1)' : 'var(--surface2)', border: `1px solid ${attachCount > 0 ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`, padding: '0.375rem 0.625rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
          <Paperclip size={12} />
          {attachCount > 0 ? attachCount : 'Attach'}
        </button>
      </div>
      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'absolute', right: '0.75rem', top: '3rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onEdit(item); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { onDelete(item.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Income() {
  const { income, addIncome, updateIncome, deleteIncome, settings, selectedMonth: mk, setSelectedMonth: setMk } = useApp();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [attachItemId, setAttachItemId] = useState(null);
  const [viewMode, setViewMode] = useState('income');

  const monthIncome = getIncomeForMonth(income, mk);
  const totalMonthly = monthIncome.reduce((s, i) => s + monthlyAmount(i), 0);
  const myTotal = monthIncome.filter((i) => i.person !== 'spouse').reduce((s, i) => s + monthlyAmount(i), 0);
  const spouseTotal = monthIncome.filter((i) => i.person === 'spouse').reduce((s, i) => s + monthlyAmount(i), 0);

  return (
    <div className="app-page">
      <div className="app-header">
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Income</h1>
        </div>

        {/* Tab bar — full width so Work Time doesn't wrap */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem', marginBottom: '1rem' }}>
          {[['income', 'Income'], ['planning', 'Planning'], ['worktime', 'Work Time']].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: viewMode === mode ? 'var(--surface)' : 'transparent',
                color: viewMode === mode ? 'var(--text)' : 'var(--subtle)',
                boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'income' && (
          <>
            {/* Month navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setMk(monthOffset(mk, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                <ChevronLeft size={20} />
              </button>
              <span style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
              <button onClick={() => setMk(monthOffset(mk, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Total card */}
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Total Monthly Income</p>
              <p style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--positive-text)' }}>{formatCurrency(totalMonthly)}</p>
              {settings.spouseEnabled && (
                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Me: <span style={{ color: 'var(--text)', fontWeight: '600' }}>{formatCurrency(myTotal)}</span></span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{settings.spouseName || 'Spouse'}: <span style={{ color: 'var(--text)', fontWeight: '600' }}>{formatCurrency(spouseTotal)}</span></span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {viewMode === 'worktime' ? (
        <WorkTimeContent />
      ) : viewMode === 'income' ? (
        <div style={{ padding: '0 1rem' }}>
          {monthIncome.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <TrendingUp size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
              <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No income yet</p>
              <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Add your income sources to get started.</p>
              <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
                <Plus size={18} /> Add Income
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button onClick={() => setShowAdd(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
                  <Plus size={16} /> Add Income
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {monthIncome.map((item) => (
                  <IncomeCard key={item.id} item={item} onEdit={setEditItem} onDelete={deleteIncome}
                    onAttach={(i) => setAttachItemId(i.id)}
                    spouseEnabled={settings.spouseEnabled} spouseName={settings.spouseName} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '0 1rem' }}>
          <PlanningContent />
        </div>
      )}

      {showAdd && (
        <Modal title="Add Income" onClose={() => setShowAdd(false)}>
          <IncomeForm onSave={(data) => { addIncome({ ...data, month: mk }); setShowAdd(false); }} onCancel={() => setShowAdd(false)}
            spouseEnabled={settings.spouseEnabled} spouseName={settings.spouseName} />
        </Modal>
      )}
      {editItem && (
        <Modal title="Edit Income" onClose={() => setEditItem(null)}>
          <IncomeForm initial={editItem} onSave={(data) => { updateIncome(editItem.id, data); setEditItem(null); }} onCancel={() => setEditItem(null)}
            spouseEnabled={settings.spouseEnabled} spouseName={settings.spouseName} />
        </Modal>
      )}
      {attachItemId && (() => {
        const item = income.find((i) => i.id === attachItemId);
        if (!item) return null;
        return (
          <Modal title={`Documents · ${item.source}`} onClose={() => setAttachItemId(null)}>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '1rem' }}>W-2s, W-4s, paystubs, offer letters</p>
            <FileUpload
              storagePath={`users/${user?.uid}/income/${item.id}`}
              attachments={item.attachments || []}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onAdd={(att) => updateIncome(item.id, { attachments: [...(item.attachments || []), att] })}
              onRemove={(id) => updateIncome(item.id, { attachments: (item.attachments || []).filter((a) => a.id !== id) })}
            />
          </Modal>
        );
      })()}
    </div>
  );
}
