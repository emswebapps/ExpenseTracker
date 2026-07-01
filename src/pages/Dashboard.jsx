import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, TrendingUp, Receipt, CreditCard,
  CalendarDays, Plus, Pencil, Trash2, CheckSquare, Square,
  MoreVertical, Bell, LayoutDashboard, Link, Plane, AlertTriangle,
  Wallet, PiggyBank, Settings, BarChart2, Users, LayoutGrid,
  ChevronDown, ChevronUp, FileText, Zap, Share2, Check, RefreshCw, FolderOpen,
} from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { storage } from '../utils/storage';
import { useApp } from '../context/AppContext';
import {
  formatCurrency, monthKey, monthLabel, getBillsForMonth, getIncomeForMonth,
  getPayDatesForMonth, getNextPayDate, getBillStatus, isBillOverdueUnpaid,
  isReminderOverdue, isReminderSoon, formatDate, getSpendingHistory, getCategoryTotals,
} from '../utils/helpers';
import Modal from '../components/Modal';
import SavingsForm from '../components/SavingsForm';
import CommitmentForm from '../components/CommitmentForm';
import PlannedExpenseForm from '../components/PlannedExpenseForm';

function monthOffset(mk, offset) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
}

function monthlyAmount(item) {
  const mult = item.frequency === 'weekly' ? 4.33 : item.frequency === 'biweekly' ? 2.17 : 1;
  return item.amount * mult;
}

function formatDateShort(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SectionLabel({ children }) {
  return <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>{children}</p>;
}

function SavingCard({ saving, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pct = saving.goal ? Math.min(100, (saving.balance / saving.goal) * 100) : null;

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: '700', color: 'var(--text)' }}>{saving.name}</p>
          {saving.notes && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.125rem' }}>{saving.notes}</p>}
          {pct !== null ? (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: '600', color: 'var(--text)' }}>{formatCurrency(saving.balance)}</span>
                <span>Goal: {formatCurrency(saving.goal)}</span>
              </div>
              <div style={{ height: '0.5rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: 'var(--positive-text)', borderRadius: '9999px', width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>{pct.toFixed(0)}% of goal</p>
            </div>
          ) : (
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--positive-text)', marginTop: '0.25rem' }}>{formatCurrency(saving.balance)}</p>
          )}
          {saving.monthlyContribution && (
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>+{formatCurrency(saving.monthlyContribution)}/mo</p>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', right: 0, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <button onClick={() => { onEdit(saving); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => { onDelete(saving.id); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CommitmentRow({ commitment, onToggle, onEdit, onDelete, myLabel, partnerLabel }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const personLabel = commitment.person === 'me' ? myLabel : commitment.person === 'partner' ? partnerLabel : 'Both';
  const isOverdue = !commitment.completed && commitment.endDate && new Date(commitment.endDate + 'T12:00:00') < new Date();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', opacity: commitment.completed ? 0.5 : 1, backgroundColor: isOverdue ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
      <button onClick={() => onToggle(commitment.id)}
        style={{ flexShrink: 0, color: commitment.completed ? 'var(--positive-text)' : isOverdue ? 'var(--danger)' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
        {commitment.completed ? <CheckSquare size={22} /> : <Square size={22} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: '600', color: commitment.completed ? 'var(--subtle)' : isOverdue ? 'var(--danger)' : 'var(--text)', textDecoration: commitment.completed ? 'line-through' : 'none' }}>{commitment.description}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{personLabel}</span>
          {commitment.amount && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatCurrency(commitment.amount)}</span>}
          {commitment.endDate && (
            <span style={{ fontSize: '0.75rem', color: isOverdue ? 'var(--danger)' : 'var(--subtle)', fontWeight: isOverdue ? '700' : '400' }}>
              {isOverdue ? '⚠ overdue · ' : '· by '}{new Date(commitment.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ padding: '0.375rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
            <div style={{ position: 'absolute', right: 0, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <button onClick={() => { onEdit(commitment); setMenuOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => { onDelete(commitment.id); setMenuOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PinnedNoteCard({ note, billName }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = note.content.length > 120;
  const overdue = isReminderOverdue(note.reminderDate);
  const soon = !overdue && isReminderSoon(note.reminderDate);

  const borderColor = overdue ? 'var(--danger)' : soon ? 'var(--warn)' : 'var(--border)';
  const bgColor = overdue ? 'rgba(239,68,68,0.05)' : soon ? 'rgba(245,158,11,0.05)' : 'var(--surface)';

  return (
    <div style={{ borderRadius: '0.75rem', border: `1px solid ${borderColor}`, padding: '0.875rem', backgroundColor: bgColor }}>
      {note.reminderDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', marginBottom: '0.5rem', color: overdue ? 'var(--danger)' : soon ? 'var(--warn)' : 'var(--subtle)' }}>
          <Bell size={11} /> {overdue ? 'Overdue: ' : soon ? 'Due soon: ' : ''}{formatDate(note.reminderDate)}
        </div>
      )}
      {note.title && <p style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text)', marginBottom: '0.25rem' }}>{note.title}</p>}
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-words' }}>
        {isLong && !expanded ? note.content.slice(0, 120) + '…' : note.content}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} style={{ fontSize: '0.75rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem' }}>
          {expanded ? 'less' : 'more'}
        </button>
      )}
      {billName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--subtle)' }}>
          <Link size={10} /> {billName}
        </div>
      )}
    </div>
  );
}

function PlannedExpenseCard({ pe, savings, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fromSavings = savings.find((s) => s.id === pe.fromSavingsId);
  const targetLabel = pe.targetDate
    ? new Date(pe.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ marginTop: '0.125rem', width: '2rem', height: '2rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Plane size={14} style={{ color: 'var(--accent-text)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text)' }}>{pe.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem', flexWrap: 'wrap' }}>
          {targetLabel && <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{targetLabel}</span>}
          {fromSavings && (
            <span style={{ fontSize: '0.75rem', color: 'var(--positive-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <PiggyBank size={10} /> {fromSavings.name}
            </span>
          )}
        </div>
        {fromSavings && pe.amount > 0 && (
          <div style={{ marginTop: '0.375rem' }}>
            <div style={{ height: '0.3rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: fromSavings.balance >= pe.amount ? 'var(--positive-text)' : 'var(--accent)', borderRadius: '9999px', width: `${Math.min(100, (fromSavings.balance / pe.amount) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.15rem' }}>
              {formatCurrency(fromSavings.balance)} saved · {Math.min(100, Math.round((fromSavings.balance / pe.amount) * 100))}%
            </p>
          </div>
        )}
        {pe.notes && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pe.notes}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <p style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(pe.amount)}</p>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ padding: '0.25rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', right: 0, zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <button onClick={() => { onEdit(pe); setMenuOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => { onDelete(pe.id); setMenuOpen(false); }}
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

export default function Dashboard() {
  const {
    bills, income, budget, setBudgetForMonth, debts, savings, addSaving, updateSaving, deleteSaving,
    commitments, addCommitment, updateCommitment, deleteCommitment, toggleCommitment,
    plannedExpenses, addPlannedExpense, updatePlannedExpense, deletePlannedExpense,
    notes, settings, setSettings, purchases,
    budgetCategories, budgetSpends, addBudgetSpend,
    agreements, addAgreement, updateAgreement, deleteAgreement,
    setBillStatusDirect, addBill,
    selectedMonth: mk, setSelectedMonth: setMk,
  } = useApp();

  const [showAddSaving, setShowAddSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(null);
  const [showAddCommitment, setShowAddCommitment] = useState(false);
  const [editCommitment, setEditCommitment] = useState(null);
  const [showDoneCommitments, setShowDoneCommitments] = useState(false);
  const [showAddPlanned, setShowAddPlanned] = useState(false);
  const [editPlanned, setEditPlanned] = useState(null);
  const [viewMode, setViewMode] = useState('joint');
  const [showCustomize, setShowCustomize] = useState(false);
  const [showQuickSpend, setShowQuickSpend] = useState(false);
  const [qsCatId, setQsCatId] = useState('');
  const [qsAmount, setQsAmount] = useState('');
  const [qsDesc, setQsDesc] = useState('');
  const [showAddAgreement, setShowAddAgreement] = useState(false);
  const [editAgreement, setEditAgreement] = useState(null);
  const [agDesc, setAgDesc] = useState('');
  const [agAmount, setAgAmount] = useState('');
  const [agPerson, setAgPerson] = useState('both');
  const [agDate, setAgDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [agNotes, setAgNotes] = useState('');

  const [showExport, setShowExport] = useState(false);
  const [expandedEnvCat, setExpandedEnvCat] = useState(null);
  const [netWorthHistory, setNetWorthHistory] = useState(() => storage.getNetWorthHistory());

  const DEFAULT_COLLAPSED = { savings: true, netWorth: true, spendingTrend: true, topCategories: true, spendingByPerson: true };
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const s = localStorage.getItem('dashboardCollapsed');
      return s ? { ...DEFAULT_COLLAPSED, ...JSON.parse(s) } : DEFAULT_COLLAPSED;
    } catch { return DEFAULT_COLLAPSED; }
  });
  const isCollapsed = (key) => collapsed[key] === true;
  const toggleCollapsed = (key) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    localStorage.setItem('dashboardCollapsed', JSON.stringify(next));
  };

  // Section visibility helpers — default true if key not set
  const sectionPrefs = settings.dashboardSections || {};
  const sec = (key) => sectionPrefs[key] !== false;
  const toggleSec = (key) => setSettings({ ...settings, dashboardSections: { ...sectionPrefs, [key]: !sec(key) } });
  const navigate = useNavigate();

  const { spouseName, myName, monthlySpendingBudget, monthlySavingsTarget, purchasesInAvailable } = settings;
  const partnerLabel = spouseName || 'Secondary User';
  const aaronLabel = myName || 'Primary User';

  const allMonthBills = getBillsForMonth(bills, mk);
  const monthIncome = getIncomeForMonth(income, mk);

  // Normalize owner to canonical key
  const normOwner = (b) => {
    const o = b.owner;
    if (o === 'mine' || o === 'aaron') return 'primary';
    if (o === 'partner' || o === 'cameron') return 'secondary';
    return 'joint';
  };

  // Filter bills and income by viewMode
  const monthBills = viewMode === 'primary'
    ? allMonthBills.filter((b) => normOwner(b) === 'primary')
    : viewMode === 'secondary'
      ? allMonthBills.filter((b) => normOwner(b) === 'secondary')
      : allMonthBills;

  const viewIncome = (viewMode === 'primary'
    ? monthIncome.filter((i) => i.person !== 'spouse')
    : viewMode === 'secondary'
      ? monthIncome.filter((i) => i.person === 'spouse')
      : monthIncome
  ).filter((i) => i.includeInAvailability !== false);

  const paidBills = monthBills.filter((b) => getBillStatus(b, mk) === 'paid');
  const unpaidBills = monthBills.filter((b) => getBillStatus(b, mk) === 'unpaid');
  const pendingBills = monthBills.filter((b) => getBillStatus(b, mk) === 'pending');
  const overdueBills = allMonthBills.filter((b) => isBillOverdueUnpaid(b, mk));

  const totalBills = monthBills.reduce((s, b) => s + b.amount, 0);
  const paidTotal = paidBills.reduce((s, b) => s + b.amount, 0);
  const unpaidTotal = unpaidBills.reduce((s, b) => s + b.amount, 0);

  const myIncome = monthIncome.filter((i) => i.person !== 'spouse').reduce((s, i) => s + monthlyAmount(i), 0);
  const partnerIncome = monthIncome.filter((i) => i.person === 'spouse').reduce((s, i) => s + monthlyAmount(i), 0);
  const monthlyIncome = viewIncome.reduce((s, i) => s + monthlyAmount(i), 0);

  const totalDebtMins = viewMode === 'primary'
    ? debts.filter((d) => normOwner(d) === 'primary').reduce((s, d) => s + d.minPayment, 0)
    : viewMode === 'secondary'
      ? debts.filter((d) => normOwner(d) === 'secondary').reduce((s, d) => s + d.minPayment, 0)
      : debts.reduce((s, d) => s + d.minPayment, 0);

  const activePlannedTotal = plannedExpenses
    .filter((pe) => pe.status !== 'completed')
    .reduce((s, pe) => s + pe.amount, 0);

  const monthPurchases = purchases.filter((p) => p.date && p.date.startsWith(mk));
  const monthSpent = monthPurchases.reduce((s, p) => s + p.amount, 0);

  // Budget envelope totals — must be declared before availableToSpend
  const monthBudgetSpends = budgetSpends.filter((s) => (s.month || s.monthKey) === mk);
  const totalEnvelopeLimit = budgetCategories.reduce((s, c) => s + (c.monthlyLimit || 0), 0);
  const totalEnvelopeSpent = monthBudgetSpends.reduce((s, sp) => s + (sp.amount || 0), 0);
  const totalEnvelopeRemaining = totalEnvelopeLimit - totalEnvelopeSpent;

  const availableToSpend = monthlyIncome - totalBills - totalDebtMins - activePlannedTotal - (purchasesInAvailable ? monthSpent : 0) - totalEnvelopeSpent;

  const spendingBudget = monthlySpendingBudget || 0;
  const savingsTarget = monthlySavingsTarget || 0;
  const unallocated = availableToSpend - spendingBudget - savingsTarget;

  const isCurrentMonth = mk === monthKey(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payDates = monthIncome
    .filter((i) => i.startDate && i.frequency !== 'monthly')
    .flatMap((i) => getPayDatesForMonth(i, mk).map((d) => ({ date: d, source: i.source, amount: i.amount, past: d < today })))
    .sort((a, b) => a.date - b.date);

  const nextPaychecks = isCurrentMonth
    ? monthIncome
        .filter((i) => i.startDate && i.frequency !== 'monthly')
        .map((i) => ({ ...getNextPayDate(i), source: i.source, amount: i.amount }))
        .filter(Boolean)
        .sort((a, b) => a.daysUntil - b.daysUntil)
    : [];

  const openCommitments = commitments.filter((c) => !c.completed);
  const doneCommitments = commitments.filter((c) => c.completed);
  const totalSavings = savings.reduce((s, a) => s + a.balance, 0);

  const pinnedNotes = notes.filter((n) => n.pinnedToDashboard);

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = totalSavings - totalDebt;

  const spendingHistory = getSpendingHistory(purchases, 6);
  const categoryTotals = getCategoryTotals(purchases, mk);

  const aaronSpent = monthPurchases.filter((p) => p.person === 'aaron' || p.person === 'me').reduce((s, p) => s + p.amount, 0);
  const cameronSpent = monthPurchases.filter((p) => p.person === 'cameron' || p.person === 'partner').reduce((s, p) => s + p.amount, 0);

  const activeAgreements = agreements.filter((a) => a.status !== 'settled');
  const settledAgreements = agreements.filter((a) => a.status === 'settled');

  const openAgreementEditor = (ag) => {
    setAgDesc(ag ? ag.description || '' : '');
    setAgAmount(ag ? (ag.amount != null ? String(ag.amount) : '') : '');
    setAgPerson(ag ? ag.person || 'both' : 'both');
    setAgDate(ag ? ag.date || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setAgNotes(ag ? ag.notes || '' : '');
    if (ag) setEditAgreement(ag); else setShowAddAgreement(true);
  };
  const closeAgreementEditor = () => { setShowAddAgreement(false); setEditAgreement(null); setAgDesc(''); setAgAmount(''); setAgPerson('both'); setAgDate(new Date().toISOString().slice(0, 10)); setAgNotes(''); };

  // Bill reminders — request notification permission and alert on due-soon bills
  useEffect(() => {
    if (!('Notification' in window)) return;
    const lastCheck = localStorage.getItem('lastBillReminderCheck');
    const today = new Date().toDateString();
    if (lastCheck === today) return;
    const dueSoon = bills.filter((b) => {
      if (!b.dueDay || getBillStatus(b, monthKey()) !== 'unpaid') return false;
      const diff = b.dueDay - new Date().getDate();
      return diff >= 0 && diff <= 3;
    });
    if (dueSoon.length === 0) return;
    const show = () => {
      localStorage.setItem('lastBillReminderCheck', today);
      dueSoon.forEach((b) => {
        const diff = b.dueDay - new Date().getDate();
        new Notification('Bill Due Soon', {
          body: `${b.name} — ${formatCurrency(b.amount)} due ${diff === 0 ? 'today' : `in ${diff} day${diff > 1 ? 's' : ''}`}`,
          icon: '/ExpenseTracker/app-icon.jpeg',
          badge: '/ExpenseTracker/app-icon.jpeg',
        });
      });
    };
    if (Notification.permission === 'granted') {
      show();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => { if (p === 'granted') show(); });
    }
  }, [bills]);

  // Auto-snapshot net worth once per month (device-local)
  useEffect(() => {
    if (totalSavings === 0 && totalDebt === 0) return;
    const currentMk = monthKey(new Date());
    const existing = netWorthHistory.find((h) => h.mk === currentMk);
    if (existing && existing.value === netWorth) return;
    const next = [...netWorthHistory.filter((h) => h.mk !== currentMk), { mk: currentMk, value: netWorth }]
      .sort((a, b) => a.mk.localeCompare(b.mk))
      .slice(-12);
    setNetWorthHistory(next);
    storage.setNetWorthHistory(next);
  }, [netWorth]); // eslint-disable-line

  const sectionCard = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginBottom: '0' };
  const sectionWrap = { marginBottom: '1.25rem' };

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Finance Manager</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setShowExport(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
              <Share2 size={15} />
            </button>
            <button onClick={() => setShowCustomize(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
              <LayoutGrid size={15} />
            </button>
            <RouterLink to="/vault"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', textDecoration: 'none' }}>
              <FolderOpen size={15} />
            </RouterLink>
            <RouterLink to="/settings"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', textDecoration: 'none' }}>
              <Settings size={15} />
            </RouterLink>
          </div>
        </div>
        {/* View mode toggle */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem', marginBottom: '0.75rem' }}>
          {[['primary', aaronLabel, 'var(--accent)', 'rgba(99,102,241,0.15)'], ['secondary', partnerLabel, '#a78bfa', 'rgba(167,139,250,0.15)'], ['joint', 'Joint', '#10b981', 'rgba(16,185,129,0.15)']].map(([mode, label, activeColor, inactiveBg]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ flex: 1, padding: '0.5rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: viewMode === mode ? activeColor : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--subtle)',
                boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.2)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setMk(monthOffset(mk, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
          <button onClick={() => setMk(monthOffset(mk, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>

        {/* Overdue bills alert */}
        {overdueBills.length > 0 && isCurrentMonth && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)', borderRadius: '1rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--danger)' }}>Overdue Bills</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {overdueBills.slice(0, 3).map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--danger)' }}>{b.name}</span>
                  <span style={{ color: 'var(--danger)', fontWeight: '700' }}>{formatCurrency(b.amount)}</span>
                </div>
              ))}
              {overdueBills.length > 3 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>+{overdueBills.length - 3} more overdue</p>
              )}
            </div>
          </div>
        )}

        {/* Bills status — shown at top */}
        {sec('billsStatus') && <div style={sectionWrap}>
          <button onClick={() => toggleCollapsed('billsStatus')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
            {isCollapsed('billsStatus') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Bills Status</span>
            {isCollapsed('billsStatus') && (
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: unpaidBills.length > 0 ? 'var(--danger)' : 'var(--positive-text)' }}>
                {unpaidBills.length > 0 ? `${unpaidBills.length} unpaid` : `${paidBills.length} paid`}
              </span>
            )}
          </button>
          {!isCollapsed('billsStatus') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: unpaidBills.length > 0 ? '0.625rem' : '0' }}>
                {[
                  { label: 'Unpaid', color: 'var(--danger)', amount: unpaidTotal, count: unpaidBills.length, status: 'unpaid' },
                  { label: 'Pending', color: 'var(--warn)', amount: pendingBills.reduce((s, b) => s + b.amount, 0), count: pendingBills.length, status: 'pending' },
                  { label: 'Paid', color: 'var(--positive-text)', amount: paidTotal, count: paidBills.length, status: 'paid' },
                ].map(({ label, color, amount, count, status }) => (
                  <button key={status} onClick={() => navigate(`/bills?status=${status}`)}
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = color}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>{label}</p>
                    <p style={{ fontSize: '1rem', fontWeight: '700', color }}>{formatCurrency(amount)}</p>
                    <p style={{ fontSize: '0.625rem', color: 'var(--subtle)' }}>{count} bill{count !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
              {unpaidBills.length > 0 && (
                <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
                  {unpaidBills.map((b, i) => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: i < unpaidBills.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</p>
                        {b.dueDay && <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>Due the {b.dueDay}{b.dueDay === 1 ? 'st' : b.dueDay === 2 ? 'nd' : b.dueDay === 3 ? 'rd' : 'th'}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                        <p style={{ fontSize: '0.9375rem', fontWeight: '700', color: 'var(--danger)' }}>{formatCurrency(b.amount)}</p>
                        <button onClick={() => setBillStatusDirect(b.id, mk, 'paid')}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700', padding: '0.35rem 0.625rem', borderRadius: '0.5rem', backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--positive-text)', border: 'none', cursor: 'pointer' }}>
                          <Check size={11} /> Pay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>}

        {/* Pinned notes */}
        {sec('pinnedNotes') && pinnedNotes.length > 0 && (
          <div style={sectionWrap}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.75rem' }}>
              <LayoutDashboard size={13} style={{ color: 'var(--accent-text)' }} />
              <SectionLabel>Pinned Notes</SectionLabel>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pinnedNotes.map((note) => {
                const billName = note.linkedBillId ? bills.find((b) => b.id === note.linkedBillId)?.name : null;
                return <PinnedNoteCard key={note.id} note={note} billName={billName} />;
              })}
            </div>
          </div>
        )}

        {/* Hero summary card — Available at top, compact 2-col grid below */}
        <div style={{ ...sectionCard, borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
          {/* Available — prominent at top */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Available</p>
            <p style={{ fontSize: '2.5rem', fontWeight: '900', letterSpacing: '-0.02em', color: availableToSpend >= 0 ? 'var(--text)' : 'var(--danger)' }}>
              {formatCurrency(availableToSpend)}
            </p>
          </div>
          {/* 2-column breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: (spendingBudget > 0 || savingsTarget > 0) ? '0.75rem' : 0 }}>
            <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <TrendingUp size={11} style={{ color: 'var(--positive-text)' }} />
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Income</span>
              </div>
              <p style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)' }}>{formatCurrency(monthlyIncome)}</p>
              {viewMode === 'joint' && partnerIncome > 0 && (
                <p style={{ fontSize: '0.65rem', color: 'var(--subtle)', marginTop: '0.1rem' }}>{aaronLabel} + {partnerLabel}</p>
              )}
            </div>
            <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <Receipt size={11} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Bills</span>
              </div>
              <p style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)' }}>− {formatCurrency(totalBills)}</p>
            </div>
            {totalDebtMins > 0 && (
              <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <CreditCard size={11} style={{ color: 'var(--warn)' }} />
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Debt Mins</span>
                </div>
                <p style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)' }}>− {formatCurrency(totalDebtMins)}</p>
              </div>
            )}
            {activePlannedTotal > 0 && (
              <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <Plane size={11} style={{ color: 'var(--accent-text)' }} />
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Planned</span>
                </div>
                <p style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)' }}>− {formatCurrency(activePlannedTotal)}</p>
              </div>
            )}
          </div>
          {/* Budget targets */}
          {(spendingBudget > 0 || savingsTarget > 0) && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {spendingBudget > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Wallet size={12} style={{ color: 'var(--accent-text)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Spending budget</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-text)' }}>{formatCurrency(spendingBudget)}</span>
                </div>
              )}
              {savingsTarget > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <PiggyBank size={12} style={{ color: 'var(--positive-text)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Savings target</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--positive-text)' }}>{formatCurrency(savingsTarget)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Unallocated</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: unallocated >= 0 ? 'var(--text)' : 'var(--danger)' }}>{formatCurrency(unallocated)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Budget envelope pot card — collapsible */}
        {sec('envelopes') && (totalEnvelopeLimit > 0 || spendingBudget > 0) && (() => {
          const envBudget = spendingBudget > 0 ? spendingBudget : totalEnvelopeLimit;
          const envRemaining = envBudget - totalEnvelopeSpent;
          const catIds = new Set(budgetCategories.map((c) => c.id));
          const orphanedSpends = monthBudgetSpends.filter((s) => !catIds.has(s.categoryId));
          const orphanedTotal = orphanedSpends.reduce((s, sp) => s + (sp.amount || 0), 0);
          return (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1.25rem', marginBottom: '1.25rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', paddingBottom: isCollapsed('envelopes') ? '0.875rem' : '0.625rem' }}>
                <button onClick={() => toggleCollapsed('envelopes')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left' }}>
                  {isCollapsed('envelopes') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
                  <Wallet size={14} style={{ color: 'var(--accent-text)' }} />
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Envelopes — {monthLabel(mk)}</span>
                  {isCollapsed('envelopes') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: envRemaining >= 0 ? 'var(--text)' : 'var(--danger)' }}>{formatCurrency(envRemaining)} left</span>}
                </button>
                {!isCollapsed('envelopes') && (
                  <button onClick={() => setShowQuickSpend(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.4rem 0.75rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer' }}>
                    <Zap size={13} /> Quick Add
                  </button>
                )}
              </div>
              {!isCollapsed('envelopes') && (
                <div style={{ padding: '0 1.25rem 1rem' }}>
                  {spendingBudget === 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--warn)', marginBottom: '0.5rem', backgroundColor: 'rgba(245,158,11,0.08)', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: '1px solid rgba(245,158,11,0.2)' }}>
                      No spending budget set. Set one in Settings to use this as a hard budget limit.
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                    <div>
                      <p style={{ fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.02em', color: envRemaining >= 0 ? 'var(--text)' : 'var(--danger)' }}>
                        {formatCurrency(envRemaining)}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>remaining of {formatCurrency(envBudget)}</p>
                    </div>
                    <p style={{ fontSize: '0.875rem', fontWeight: '700', color: totalEnvelopeSpent > envBudget ? 'var(--danger)' : 'var(--muted)' }}>
                      {formatCurrency(totalEnvelopeSpent)} spent
                    </p>
                  </div>
                  <div style={{ height: '0.5rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '9999px', transition: 'width 0.3s',
                      backgroundColor: totalEnvelopeSpent > envBudget ? 'var(--danger)' : totalEnvelopeSpent > envBudget * 0.8 ? 'var(--warn)' : 'var(--accent)',
                      width: `${Math.min(100, envBudget > 0 ? (totalEnvelopeSpent / envBudget) * 100 : 0)}%` }} />
                  </div>
                  {/* Per-category breakdown */}
                  {budgetCategories.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                      {budgetCategories.map((cat) => {
                        const catSpends = monthBudgetSpends.filter((s) => s.categoryId === cat.id);
                        const catSpent = catSpends.reduce((s, sp) => s + (sp.amount || 0), 0);
                        const catLimit = cat.monthlyLimit || 0;
                        const catPct = catLimit > 0 ? Math.min(100, (catSpent / catLimit) * 100) : 0;
                        const isExpanded = expandedEnvCat === cat.id;
                        return (
                          <div key={cat.id}>
                            <button onClick={() => setExpandedEnvCat(isExpanded ? null : cat.id)}
                              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0', textAlign: 'left' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text)' }}>{cat.name}</span>
                                <span style={{ fontSize: '0.75rem', color: catSpent > catLimit ? 'var(--danger)' : 'var(--subtle)' }}>
                                  {formatCurrency(catSpent)} / {formatCurrency(catLimit)}
                                </span>
                              </div>
                              <div style={{ height: '0.3rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '9999px', transition: 'width 0.3s',
                                  backgroundColor: catSpent > catLimit ? 'var(--danger)' : catPct > 80 ? 'var(--warn)' : 'var(--accent)',
                                  width: `${catPct}%` }} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.25rem' }}>
                                {catSpends.length === 0 ? (
                                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', textAlign: 'center', padding: '0.25rem 0' }}>No spends logged yet</p>
                                ) : (
                                  catSpends.sort((a, b) => b.date?.localeCompare(a.date || '') || 0).map((sp) => (
                                    <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', borderBottom: '1px solid var(--border)' }}>
                                      <div>
                                        <p style={{ fontSize: '0.8125rem', color: 'var(--text)', fontWeight: '500' }}>{sp.description || '—'}</p>
                                        {sp.date && <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>{new Date(sp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                                      </div>
                                      <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(sp.amount)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Orphaned / uncategorized spends */}
                      {orphanedTotal > 0 && (
                        <div>
                          <button onClick={() => setExpandedEnvCat(expandedEnvCat === '__orphan' ? null : '__orphan')}
                            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                              <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--warn)' }}>Uncategorized</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--warn)' }}>{formatCurrency(orphanedTotal)}</span>
                            </div>
                            <div style={{ height: '0.3rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: '9999px', backgroundColor: 'var(--warn)', width: '100%' }} />
                            </div>
                          </button>
                          {expandedEnvCat === '__orphan' && (
                            <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.25rem' }}>
                              <p style={{ fontSize: '0.7rem', color: 'var(--warn)', marginBottom: '0.375rem' }}>These spends have no matching category. Go to Bills &amp; Budget to reassign or delete them.</p>
                              {orphanedSpends.sort((a, b) => b.date?.localeCompare(a.date || '') || 0).map((sp) => (
                                <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
                                  <div>
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--text)', fontWeight: '500' }}>{sp.description || '—'}</p>
                                    {sp.date && <p style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>{new Date(sp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                                  </div>
                                  <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--warn)' }}>{formatCurrency(sp.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Savings */}
        {sec('savings') && <div style={sectionWrap}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed('savings') ? '0' : '0.75rem' }}>
            <button onClick={() => toggleCollapsed('savings')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', flex: 1, padding: '0 0 0.75rem 0', textAlign: 'left' }}>
              {isCollapsed('savings') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Savings</span>
              {isCollapsed('savings') && savings.length > 0 && <span style={{ fontSize: '0.875rem', color: 'var(--positive-text)', fontWeight: '700' }}>{formatCurrency(totalSavings)}</span>}
            </button>
            {!isCollapsed('savings') && (
              <button onClick={() => setShowAddSaving(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', paddingBottom: '0.75rem' }}>
                <Plus size={14} /> Add
              </button>
            )}
          </div>
          {!isCollapsed('savings') && (savings.length === 0 ? (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>No savings accounts yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {savings.map((s) => (
                <SavingCard key={s.id} saving={s} onEdit={setEditSaving} onDelete={deleteSaving} />
              ))}
            </div>
          ))}
        </div>}


        {/* Spending vs budget */}
        {sec('spending') && spendingBudget > 0 && (
          <div style={sectionWrap}>
            <button onClick={() => toggleCollapsed('spending')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
              {isCollapsed('spending') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Spending This Month</span>
              {isCollapsed('spending') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: monthSpent > spendingBudget ? 'var(--danger)' : 'var(--text)' }}>{formatCurrency(monthSpent)} / {formatCurrency(spendingBudget)}</span>}
            </button>
            {!isCollapsed('spending') && (
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                  <div>
                    <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.125rem' }}>Spent</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: '700', color: monthSpent > spendingBudget ? 'var(--danger)' : 'var(--text)' }}>{formatCurrency(monthSpent)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.125rem' }}>Budget</p>
                    <p style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--accent-text)' }}>{formatCurrency(spendingBudget)}</p>
                  </div>
                </div>
                <div style={{ height: '0.5rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '9999px', transition: 'width 0.3s',
                    backgroundColor: monthSpent > spendingBudget ? 'var(--danger)' : monthSpent > spendingBudget * 0.8 ? 'var(--warn)' : 'var(--accent)',
                    width: `${Math.min(100, (monthSpent / spendingBudget) * 100)}%`,
                  }} />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
                  {formatCurrency(Math.max(0, spendingBudget - monthSpent))} remaining
                </p>
              </div>
            )}
          </div>
        )}

        {/* Next paycheck banner */}
        {sec('nextPaycheck') && isCurrentMonth && nextPaychecks.length > 0 && nextPaychecks[0].daysUntil <= 7 && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '1rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <CalendarDays size={18} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--accent-text)' }}>
                {nextPaychecks[0].daysUntil === 0
                  ? `Payday today — ${nextPaychecks[0].source}`
                  : `Payday in ${nextPaychecks[0].daysUntil}d — ${nextPaychecks[0].source}`}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.125rem' }}>{formatCurrency(nextPaychecks[0].amount)} per paycheck</p>
            </div>
          </div>
        )}

        {/* Pay schedule */}
        {sec('payDates') && payDates.length > 0 && (
          <div style={sectionWrap}>
            <button onClick={() => toggleCollapsed('payDates')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
              {isCollapsed('payDates') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <CalendarDays size={13} style={{ color: 'var(--accent-text)' }} />
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Pay Dates — {monthLabel(mk)}</span>
              {isCollapsed('payDates') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--muted)' }}>{payDates.length} dates</span>}
            </button>
            {!isCollapsed('payDates') && (
              <div style={{ ...sectionCard }}>
                {payDates.map((pd, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', opacity: pd.past ? 0.4 : 1, borderBottom: i < payDates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <CalendarDays size={14} style={{ color: 'var(--accent-text)' }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)' }}>{pd.source}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{formatDateShort(pd.date)}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{formatCurrency(pd.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Planned expenses */}
        {sec('plannedExpenses') && <div style={sectionWrap}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed('plannedExpenses') ? '0' : '0.75rem' }}>
            <button onClick={() => toggleCollapsed('plannedExpenses')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', flex: 1, padding: '0 0 0.75rem 0', textAlign: 'left' }}>
              {isCollapsed('plannedExpenses') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Planned Expenses</span>
              {isCollapsed('plannedExpenses') && activePlannedTotal > 0 && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(activePlannedTotal)}</span>}
            </button>
            {!isCollapsed('plannedExpenses') && (
              <button onClick={() => setShowAddPlanned(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', paddingBottom: '0.75rem' }}>
                <Plus size={14} /> Add
              </button>
            )}
          </div>
          {!isCollapsed('plannedExpenses') && (plannedExpenses.filter((pe) => pe.status !== 'completed').length === 0 ? (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center' }}>
              <Plane size={28} style={{ margin: '0 auto 0.5rem', display: 'block', color: 'var(--subtle)' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>No planned expenses — add trips, purchases, or events from savings.</p>
            </div>
          ) : (
            <div style={{ ...sectionCard }}>
              {plannedExpenses.filter((pe) => pe.status !== 'completed').map((pe, i, arr) => (
                <div key={pe.id} style={i === arr.length - 1 ? { borderBottom: 'none' } : {}}>
                  <PlannedExpenseCard pe={pe} savings={savings} onEdit={setEditPlanned} onDelete={deletePlannedExpense} />
                </div>
              ))}
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--surface2)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '600' }}>Total Planned</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{formatCurrency(plannedExpenses.filter((pe) => pe.status !== 'completed').reduce((s, pe) => s + pe.amount, 0))}</span>
              </div>
            </div>
          ))}
        </div>}

        {/* Commitments & Agreements — merged section */}
        {sec('commitments') && <div style={sectionWrap}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed('commitments') ? '0' : '0.75rem' }}>
            <button onClick={() => toggleCollapsed('commitments')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', flex: 1, padding: '0 0 0.75rem 0', textAlign: 'left' }}>
              {isCollapsed('commitments') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Commitments &amp; Agreements</span>
              {isCollapsed('commitments') && (openCommitments.length > 0 || activeAgreements.length > 0) && (
                <span style={{ fontSize: '0.875rem', color: 'var(--accent-text)', fontWeight: '700' }}>
                  {[openCommitments.length > 0 && `${openCommitments.length} to-do`, activeAgreements.length > 0 && `${activeAgreements.length} deal${activeAgreements.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
            {!isCollapsed('commitments') && (
              <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.75rem' }}>
                <button onClick={() => setShowAddCommitment(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                  <Plus size={13} /> To-do
                </button>
                <button onClick={() => openAgreementEditor(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                  <Plus size={13} /> Deal
                </button>
              </div>
            )}
          </div>
          {!isCollapsed('commitments') && (
            <>
              {commitments.length === 0 && agreements.length === 0 ? (
                <div style={{ backgroundColor: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Nothing here yet — add to-dos or log financial deals.</p>
                </div>
              ) : (
                <>
                  {commitments.length > 0 && (
                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginBottom: agreements.length > 0 ? '0.625rem' : '0' }}>
                      {openCommitments.map((c, i) => (
                        <div key={c.id} style={{ borderBottom: i < openCommitments.length - 1 || doneCommitments.length > 0 ? '1px solid var(--border)' : 'none' }}>
                          <CommitmentRow commitment={c} onToggle={toggleCommitment}
                            onEdit={setEditCommitment} onDelete={deleteCommitment} myLabel={aaronLabel} partnerLabel={partnerLabel} />
                        </div>
                      ))}
                      {doneCommitments.length > 0 && (
                        <button onClick={() => setShowDoneCommitments(!showDoneCommitments)}
                          style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: showDoneCommitments ? '1px solid var(--border)' : 'none' }}>
                          {showDoneCommitments ? '▾' : '▸'} {doneCommitments.length} completed
                        </button>
                      )}
                      {showDoneCommitments && doneCommitments.map((c, i) => (
                        <div key={c.id} style={{ borderBottom: i < doneCommitments.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <CommitmentRow commitment={c} onToggle={toggleCommitment}
                            onEdit={setEditCommitment} onDelete={deleteCommitment} myLabel={aaronLabel} partnerLabel={partnerLabel} />
                        </div>
                      ))}
                    </div>
                  )}
                  {agreements.length > 0 && (
                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
                      {activeAgreements.map((ag, i) => (
                        <div key={ag.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: i < activeAgreements.length - 1 || settledAgreements.length > 0 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: '600', color: 'var(--text)', fontSize: '0.9375rem' }}>{ag.description}</p>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                              {ag.amount != null && ag.amount > 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: '700' }}>{formatCurrency(ag.amount)}</span>}
                              <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                                {ag.person === 'me' ? aaronLabel : ag.person === 'partner' ? partnerLabel : 'Both'} · {ag.date ? formatDate(ag.date) : ''}
                              </span>
                            </div>
                            {ag.notes && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.2rem' }}>{ag.notes}</p>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                            <button onClick={() => updateAgreement(ag.id, { status: 'settled' })}
                              style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--positive-text)', border: 'none', cursor: 'pointer' }}>
                              Settle
                            </button>
                            <button onClick={() => openAgreementEditor(ag)}
                              style={{ padding: '0.35rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteAgreement(ag.id)}
                              style={{ padding: '0.35rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {settledAgreements.length > 0 && (
                        <div style={{ padding: '0.625rem 1rem', backgroundColor: 'var(--surface2)' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{settledAgreements.length} settled deal{settledAgreements.length !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>}

        {/* Net Worth */}
        {sec('netWorth') && <div style={sectionWrap}>
          <button onClick={() => toggleCollapsed('netWorth')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
            {isCollapsed('netWorth') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
            <BarChart2 size={13} style={{ color: 'var(--positive-text)' }} />
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Net Worth</span>
            {isCollapsed('netWorth') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: netWorth >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>{formatCurrency(netWorth)}</span>}
          </button>
          {!isCollapsed('netWorth') && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Savings</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--positive-text)' }}>{formatCurrency(totalSavings)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Debt</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--danger)' }}>− {formatCurrency(totalDebt)}</p>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: '600' }}>Net Worth</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '900', color: netWorth >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>{formatCurrency(netWorth)}</p>
              </div>
              {netWorthHistory.length >= 2 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.375rem' }}>12-Month Trend</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={netWorthHistory.map((h) => ({ mk: h.mk, value: h.value }))} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--positive-text)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--positive-text)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="mk" tick={{ fill: 'var(--subtle)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                      <Tooltip
                        cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.75rem', color: 'var(--text)' }}
                        formatter={(v) => [formatCurrency(v), 'Net Worth']}
                      />
                      <Area type="monotone" dataKey="value" stroke="var(--positive-text)" strokeWidth={2} fill="url(#nwGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>}

        {/* 6-month spending chart */}
        {sec('spendingTrend') && spendingHistory.some((m) => m.amount > 0) && (
          <div style={sectionWrap}>
            <button onClick={() => toggleCollapsed('spendingTrend')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
              {isCollapsed('spendingTrend') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <TrendingUp size={13} style={{ color: 'var(--accent-text)' }} />
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Spending Trend</span>
              {isCollapsed('spendingTrend') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--muted)' }}>{formatCurrency(monthSpent)} this month</span>}
            </button>
            {!isCollapsed('spendingTrend') && (
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={spendingHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fill: 'var(--subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--subtle)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                    <Tooltip
                      cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                      contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.8125rem', color: 'var(--text)' }}
                      formatter={(v) => [formatCurrency(v), 'Spent']}
                    />
                    <Bar dataKey="amount" radius={[5, 5, 0, 0]}>
                      {spendingHistory.map((entry) => (
                        <Cell key={entry.mk} fill={entry.mk === mk ? 'var(--accent)' : 'var(--surface2)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Category breakdown */}
        {sec('topCategories') && categoryTotals.length > 0 && (
          <div style={sectionWrap}>
            <button onClick={() => toggleCollapsed('topCategories')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
              {isCollapsed('topCategories') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Top Categories — {monthLabel(mk)}</span>
              {isCollapsed('topCategories') && categoryTotals[0] && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--muted)' }}>{categoryTotals[0].cat}</span>}
            </button>
            {!isCollapsed('topCategories') && (
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {categoryTotals.slice(0, 5).map(({ cat, amt }) => {
                  const pct = monthSpent > 0 ? (amt / monthSpent) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: '600' }}>{cat}</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: '700' }}>{formatCurrency(amt)}</span>
                      </div>
                      <div style={{ height: '0.375rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', backgroundColor: 'var(--accent)', borderRadius: '9999px', width: `${pct}%`, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Partner view */}
        {sec('spendingByPerson') && (aaronSpent > 0 || cameronSpent > 0) && (
          <div style={sectionWrap}>
            <button onClick={() => toggleCollapsed('spendingByPerson')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '0 0 0.75rem 0' }}>
              {isCollapsed('spendingByPerson') ? <ChevronDown size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} /> : <ChevronUp size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
              <Users size={13} style={{ color: 'var(--accent-text)' }} />
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Spending by Person — {monthLabel(mk)}</span>
              {isCollapsed('spendingByPerson') && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--muted)' }}>{aaronLabel} {formatCurrency(aaronSpent)} · {partnerLabel} {formatCurrency(cameronSpent)}</span>}
            </button>
            {!isCollapsed('spendingByPerson') && (
              <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
                {[
                  { label: aaronLabel, amt: aaronSpent, color: 'var(--accent)' },
                  { label: partnerLabel, amt: cameronSpent, color: '#a78bfa' },
                ].map(({ label, amt, color }) => {
                  const pct = monthSpent > 0 ? (amt / monthSpent) * 100 : 0;
                  return (
                    <div key={label} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.9375rem', fontWeight: '700', color: 'var(--text)' }}>{label}</span>
                        <span style={{ fontSize: '0.9375rem', fontWeight: '800', color: 'var(--text)' }}>{formatCurrency(amt)}</span>
                      </div>
                      <div style={{ height: '0.5rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', backgroundColor: color, borderRadius: '9999px', width: `${pct}%`, transition: 'width 0.3s' }} />
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.2rem' }}>{pct.toFixed(0)}% of month total</p>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', fontWeight: '600' }}>Combined</span>
                  <span style={{ fontSize: '0.9375rem', fontWeight: '800', color: 'var(--text)' }}>{formatCurrency(monthSpent)}</span>
                </div>
              </div>
            )}
          </div>
        )}



      </div>

      {/* Modals */}
      {showAddSaving && (
        <Modal title="Add Savings Account" onClose={() => setShowAddSaving(false)}>
          <SavingsForm onSave={(d) => { addSaving(d); setShowAddSaving(false); }} onCancel={() => setShowAddSaving(false)} />
        </Modal>
      )}
      {editSaving && (
        <Modal title="Edit Savings Account" onClose={() => setEditSaving(null)}>
          <SavingsForm initial={editSaving} onSave={(d) => { updateSaving(editSaving.id, d); setEditSaving(null); }} onCancel={() => setEditSaving(null)} />
        </Modal>
      )}
      {showAddCommitment && (
        <Modal title="Add Commitment" onClose={() => setShowAddCommitment(false)}>
          <CommitmentForm onSave={(d) => { addCommitment(d); setShowAddCommitment(false); }} onCancel={() => setShowAddCommitment(false)} spouseName={spouseName} />
        </Modal>
      )}
      {editCommitment && (
        <Modal title="Edit Commitment" onClose={() => setEditCommitment(null)}>
          <CommitmentForm initial={editCommitment} onSave={(d) => { updateCommitment(editCommitment.id, d); setEditCommitment(null); }} onCancel={() => setEditCommitment(null)} spouseName={spouseName} />
        </Modal>
      )}
      {showAddPlanned && (
        <Modal title="Add Planned Expense" onClose={() => setShowAddPlanned(false)}>
          <PlannedExpenseForm
            onSave={(d) => { addPlannedExpense(d); setShowAddPlanned(false); }}
            onCancel={() => setShowAddPlanned(false)}
            savings={savings}
          />
        </Modal>
      )}
      {editPlanned && (
        <Modal title="Edit Planned Expense" onClose={() => setEditPlanned(null)}>
          <PlannedExpenseForm
            initial={editPlanned}
            onSave={(d) => { updatePlannedExpense(editPlanned.id, d); setEditPlanned(null); }}
            onCancel={() => setEditPlanned(null)}
            savings={savings}
          />
        </Modal>
      )}

      {/* Quick Spend modal */}
      {showQuickSpend && (
        <Modal title="Log a Spend" onClose={() => { setShowQuickSpend(false); setQsAmount(''); setQsDesc(''); setQsCatId(''); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {budgetCategories.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>No budget envelopes set up yet. Add categories in the Bills &amp; Budget tab first.</p>
            ) : (
              <>
                <div>
                  <p className="field-label">Category</p>
                  <select value={qsCatId} onChange={(e) => setQsCatId(e.target.value)} className="app-input">
                    <option value="">Pick a category…</option>
                    {budgetCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="field-label">Amount</p>
                  <input type="number" inputMode="decimal" placeholder="0.00" value={qsAmount} onChange={(e) => setQsAmount(e.target.value)} className="app-input" />
                </div>
                <div>
                  <p className="field-label">Description (optional)</p>
                  <input type="text" placeholder="What was it for?" value={qsDesc} onChange={(e) => setQsDesc(e.target.value)} className="app-input" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button onClick={() => { setShowQuickSpend(false); setQsAmount(''); setQsDesc(''); setQsCatId(''); }} className="app-btn-secondary">Cancel</button>
                  <button onClick={() => {
                    if (!qsCatId || !qsAmount) return;
                    addBudgetSpend({ categoryId: qsCatId, amount: parseFloat(qsAmount), description: qsDesc, date: new Date().toISOString().slice(0, 10), month: monthKey(new Date()) });
                    setShowQuickSpend(false); setQsAmount(''); setQsDesc(''); setQsCatId('');
                  }} className="app-btn-primary" disabled={!qsCatId || !qsAmount}>Save</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Agreement modals */}
      {(showAddAgreement || editAgreement) && (
        <Modal title={editAgreement ? 'Edit Agreement' : 'New Agreement'} onClose={closeAgreementEditor}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <p className="field-label">Description</p>
              <input type="text" placeholder="e.g. Pay Cameron $200 for car repair" value={agDesc} onChange={(e) => setAgDesc(e.target.value)} className="app-input" />
            </div>
            <div>
              <p className="field-label">Amount (optional)</p>
              <input type="number" inputMode="decimal" placeholder="0.00" value={agAmount} onChange={(e) => setAgAmount(e.target.value)} className="app-input" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <p className="field-label">Person</p>
                <select value={agPerson} onChange={(e) => setAgPerson(e.target.value)} className="app-input">
                  <option value="both">Both</option>
                  <option value="me">{aaronLabel}</option>
                  <option value="partner">{partnerLabel}</option>
                </select>
              </div>
              <div>
                <p className="field-label">Date</p>
                <input type="date" value={agDate} onChange={(e) => setAgDate(e.target.value)} className="app-input" />
              </div>
            </div>
            <div>
              <p className="field-label">Notes (optional)</p>
              <input type="text" placeholder="Any extra details…" value={agNotes} onChange={(e) => setAgNotes(e.target.value)} className="app-input" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button onClick={closeAgreementEditor} className="app-btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!agDesc.trim()) return;
                const data = { description: agDesc.trim(), amount: agAmount ? parseFloat(agAmount) : null, person: agPerson, date: agDate, notes: agNotes.trim() };
                if (editAgreement) updateAgreement(editAgreement.id, data); else addAgreement(data);
                closeAgreementEditor();
              }} className="app-btn-primary" disabled={!agDesc.trim()}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Export / Share summary modal */}
      {showExport && (() => {
        const lines = [
          `📊 Budget Summary — ${monthLabel(mk)}`,
          '',
          `💰 Income:  ${formatCurrency(monthlyIncome)}`,
          `🧾 Bills:   ${formatCurrency(totalBills)} total  (${paidBills.length} paid · ${unpaidBills.length} unpaid)`,
          `💳 Debts:   ${formatCurrency(totalDebtMins)}/mo minimums`,
          `✅ Available: ${formatCurrency(availableToSpend)}`,
          '',
          ...(unpaidBills.length > 0 ? ['⚠️ Unpaid Bills:', ...unpaidBills.map((b) => `   • ${b.name}: ${formatCurrency(b.amount)}`), ''] : []),
          ...(totalEnvelopeLimit > 0 ? [`🗂 Envelopes: ${formatCurrency(totalEnvelopeSpent)} spent / ${formatCurrency(totalEnvelopeLimit)} budgeted (${formatCurrency(totalEnvelopeRemaining)} left)`, ''] : []),
          ...(savings.length > 0 ? [`💾 Savings: ${formatCurrency(totalSavings)}`, ...savings.map((s) => `   • ${s.name}: ${formatCurrency(s.balance)}`), ''] : []),
          ...(activeAgreements.length > 0 ? ['🤝 Open Deals:', ...activeAgreements.map((a) => `   • ${a.description}${a.amount ? ' — ' + formatCurrency(a.amount) : ''}`), ''] : []),
          `📅 Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        ].join('\n');

        return (
          <Modal title="Share Summary" onClose={() => setShowExport(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Month snapshot ready to copy and share with {partnerLabel}.</p>
              <textarea readOnly value={lines} rows={Math.min(18, lines.split('\n').length + 2)}
                style={{ fontFamily: 'monospace', fontSize: '0.8125rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem', color: 'var(--text)', resize: 'none', lineHeight: '1.6' }} />
              <button onClick={() => { navigator.clipboard?.writeText(lines); }}
                className="app-btn-primary">
                <Share2 size={15} /> Copy to Clipboard
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* Dashboard Customize modal */}
      {showCustomize && (
        <Modal title="Customize Dashboard" onClose={() => setShowCustomize(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginBottom: '0.75rem' }}>
              Toggle sections on or off to simplify your dashboard.
            </p>
            {[
              ['envelopes',       'Budget Envelopes'],
              ['savings',         'Savings'],
              ['commitments',     'Commitments & Agreements'],
              ['billsStatus',     'Bills Status'],
              ['spending',        'Spending This Month'],
              ['nextPaycheck',    'Next Paycheck Banner'],
              ['payDates',        'Pay Dates'],
              ['plannedExpenses', 'Planned Expenses'],
              ['netWorth',        'Net Worth'],
              ['spendingTrend',   'Spending Trend'],
              ['topCategories',   'Top Categories'],
              ['spendingByPerson','Spending by Person'],
              ['pinnedNotes',     'Pinned Notes'],
            ].map(([key, label]) => {
              const on = sec(key);
              return (
                <button key={key} onClick={() => toggleSec(key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: on ? 'var(--text)' : 'var(--subtle)' }}>{label}</span>
                  <div style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                    backgroundColor: on ? 'var(--accent)' : 'var(--border2)' }}>
                    <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
                      left: on ? 'calc(100% - 1.25rem)' : '2px' }} />
                  </div>
                </button>
              );
            })}
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '0.5rem 0' }} />
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', padding: '0.25rem 0' }}>Spending Limit</p>
            <button onClick={() => setSettings({ ...settings, purchasesInAvailable: !purchasesInAvailable })}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <div>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: purchasesInAvailable ? 'var(--text)' : 'var(--subtle)', display: 'block' }}>Deduct Spending from Available</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Subtracts logged purchases from Available to Spend</span>
              </div>
              <div style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                backgroundColor: purchasesInAvailable ? 'var(--accent)' : 'var(--border2)' }}>
                <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
                  left: purchasesInAvailable ? 'calc(100% - 1.25rem)' : '2px' }} />
              </div>
            </button>
            <button onClick={() => setShowCustomize(false)} className="app-btn-primary" style={{ marginTop: '0.5rem' }}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
