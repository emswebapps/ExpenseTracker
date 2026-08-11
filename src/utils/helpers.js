// ── List types ────────────────────────────────────────────────────────────
// Grocery lists hold products — a checkbox, a quantity and a price. Task lists
// hold things to be done: a due date and time, a status, and reminders. 'work'
// behaves exactly like 'todo'; it's a separate bucket so work items can be
// tracked and filtered apart from personal ones.
export const TASK_LIST_TYPES = ['todo', 'work'];

export function isTaskList(type) {
  return TASK_LIST_TYPES.includes(type);
}

/** Wishlists hold things to buy later — priced and linkable, not yet bought. */
export function isWishlist(type) {
  return type === 'wishlist';
}

/**
 * A link safe to hand to an <a href>. Bare hosts get https://, and anything
 * that isn't http(s) — javascript:, data: — is rejected outright, since these
 * URLs are typed by hand and pasted from anywhere.
 */
export function safeExternalUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * True on iPhone, iPad and Mac, where maps.apple.com hands off to the Maps app.
 * iPadOS reports itself as "Macintosh", which is why that string is in here too
 * — an Apple Maps link is right for it either way.
 */
export function prefersAppleMaps() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent || '');
}

/**
 * A tappable link to an address. On Apple devices this opens the Maps app
 * directly; everywhere else it lands on Google Maps in the browser.
 */
export function mapsHref(address) {
  const query = String(address || '').trim();
  if (!query) return null;
  const q = encodeURIComponent(query);
  return prefersAppleMaps()
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** What to call the app an address will open in, for buttons and hint text. */
export function mapsAppName() {
  return prefersAppleMaps() ? 'Apple Maps' : 'Google Maps';
}

/** "amazon.com" — the bit of a link worth showing on a crowded row. */
export function linkHost(raw) {
  const safe = safeExternalUrl(raw);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [year, month] = key.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function currentMonthKey() {
  return monthKey(new Date());
}

// ── First/last day (YYYY-MM-DD) of the month containing `date` ──
export function getMonthBounds(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = date.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}

export function getDueDateLabel(dayOfMonth) {
  if (!dayOfMonth) return '';
  const today = new Date().getDate();
  const diff = dayOfMonth - today;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `Due in ${diff}d`;
}

export function getDueDateColor(dayOfMonth, isPaid) {
  if (isPaid) return 'text-emerald-400';
  const today = new Date().getDate();
  const diff = dayOfMonth - today;
  if (diff < 0) return 'text-red-400';
  if (diff <= 3) return 'text-amber-400';
  return 'text-slate-400';
}

// New 3-state bill status helpers
export function getBillStatus(bill, mk) {
  if (bill.statusMonths?.[mk]) return bill.statusMonths[mk];
  // Backward compat with old paidMonths boolean
  if (bill.paidMonths?.[mk]) return 'paid';
  if (bill.isPermanent) return 'paid';
  return 'unpaid';
}

export function nextBillStatus(current) {
  if (current === 'unpaid') return 'pending';
  if (current === 'pending') return 'paid';
  return 'unpaid';
}

export function getBillStatusColor(status, dueDay) {
  if (status === 'paid') return 'text-emerald-400';
  if (status === 'pending') return 'text-amber-400';
  if (dueDay) {
    const today = new Date().getDate();
    const diff = dueDay - today;
    if (diff < 0) return 'text-red-400';
    if (diff <= 3) return 'text-orange-400';
  }
  return 'text-slate-400';
}

export function isBillOverdueUnpaid(bill, mk) {
  const status = getBillStatus(bill, mk);
  if (status === 'paid') return false;
  if (!bill.dueDay) return false;
  const today = new Date();
  const currentMk = monthKey(today);
  if (mk !== currentMk) return false;
  return bill.dueDay < today.getDate();
}

export function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getBillsForMonth(allBills, mk) {
  return allBills.filter((b) => {
    if (b.isRecurring) {
      if (b.startMonth && mk < b.startMonth) return false;
      return true;
    }
    return b.month === mk;
  });
}

export function getIncomeForMonth(allIncome, mk) {
  return allIncome.filter((i) => i.isRecurring || i.month === mk);
}

export function getPayDatesForMonth(item, mk) {
  if (!item.startDate || item.frequency === 'monthly') return [];
  const [year, month] = mk.split('-').map(Number);
  const intervalDays = item.frequency === 'weekly' ? 7 : 14;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(item.startDate + 'T12:00:00');
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const daysToMonthStart = (monthStart - start) / MS_PER_DAY;
  let n = daysToMonthStart <= 0 ? 0 : Math.ceil(daysToMonthStart / intervalDays);

  const dates = [];
  let candidate = new Date(start.getTime() + n * intervalDays * MS_PER_DAY);
  while (candidate <= monthEnd) {
    if (candidate >= monthStart) dates.push(new Date(candidate));
    n++;
    candidate = new Date(start.getTime() + n * intervalDays * MS_PER_DAY);
  }
  return dates;
}

export function getNextPayDate(item) {
  if (!item.startDate || item.frequency === 'monthly') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const intervalDays = item.frequency === 'weekly' ? 7 : 14;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(item.startDate + 'T12:00:00');

  const daysFromStart = Math.floor((today - start) / MS_PER_DAY);
  const n = Math.max(0, Math.floor(daysFromStart / intervalDays));

  for (let i = 0; i <= 1; i++) {
    const candidate = new Date(start.getTime() + (n + i) * intervalDays * MS_PER_DAY);
    candidate.setHours(0, 0, 0, 0);
    if (candidate >= today) {
      return { date: candidate, daysUntil: Math.round((candidate - today) / MS_PER_DAY) };
    }
  }

  const next = new Date(start.getTime() + (n + 1) * intervalDays * MS_PER_DAY);
  next.setHours(0, 0, 0, 0);
  return { date: next, daysUntil: Math.round((next - today) / MS_PER_DAY) };
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isReminderOverdue(reminderDate) {
  if (!reminderDate) return false;
  return new Date(reminderDate + 'T23:59:59') < new Date();
}

export function isReminderSoon(reminderDate) {
  if (!reminderDate) return false;
  const d = new Date(reminderDate + 'T23:59:59');
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

// ── CSV Export ──
export function exportToCSV(data, filename) {
  const rows = [Object.keys(data[0])];
  data.forEach((row) => rows.push(Object.values(row).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)));
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportMonthCSV(mk, { bills, income, purchases }) {
  const monthBills = getBillsForMonth(bills, mk);
  const monthIncome = getIncomeForMonth(income, mk);
  const monthPurchases = purchases.filter((p) => p.date && p.date.startsWith(mk));
  const mult = (f) => f === 'weekly' ? 4.33 : f === 'biweekly' ? 2.17 : 1;

  if (monthBills.length) exportToCSV(
    monthBills.map((b) => ({ name: b.name, amount: b.amount, category: b.category || '', dueDay: b.dueDay || '', status: getBillStatus(b, mk) })),
    `bills-${mk}.csv`
  );
  if (monthIncome.length) exportToCSV(
    monthIncome.map((i) => ({ source: i.source, frequency: i.frequency, perPaycheck: i.amount, monthlyAmount: Math.round(i.amount * mult(i.frequency) * 100) / 100 })),
    `income-${mk}.csv`
  );
  if (monthPurchases.length) exportToCSV(
    monthPurchases.map((p) => ({ date: p.date, merchant: p.merchant, amount: p.amount, category: p.category, person: p.person, notes: p.notes || '' })),
    `spending-${mk}.csv`
  );
}

export function exportAllData({ bills, income, debts, savings, purchases }) {
  const ts = new Date().toISOString().slice(0, 10);
  if (bills.length) exportToCSV(bills.map((b) => ({ name: b.name, amount: b.amount, category: b.category, owner: b.owner, dueDay: b.dueDay || '', isRecurring: b.isRecurring })), `bills-${ts}.csv`);
  if (income.length) exportToCSV(income.map((i) => ({ name: i.name, amount: i.amount, frequency: i.frequency, owner: i.owner || '' })), `income-${ts}.csv`);
  if (debts.length) exportToCSV(debts.map((d) => ({ name: d.name, balance: d.balance, minPayment: d.minPayment, interestRate: d.interestRate || '', owner: d.owner })), `debts-${ts}.csv`);
  if (savings.length) exportToCSV(savings.map((s) => ({ name: s.name, balance: s.balance, goal: s.goal || '' })), `savings-${ts}.csv`);
  if (purchases.length) exportToCSV(purchases.map((p) => ({ date: p.date, merchant: p.merchant, amount: p.amount, category: p.category, person: p.person, notes: p.notes || '' })), `spending-${ts}.csv`);
}

export function exportAsHTML({ bills, income, debts, savings, purchases, commitments = [], plannedExpenses = [], agreements = [], projects = [], budgetCategories = [], budgetSpends = [], shoppingLists = [], shoppingItems = [], shifts = [], jobs = [], settings = {}, startDate = null, endDate = null, include = null }) {
  const ts = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmt = (n) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inc = (key) => !include || include.includes(key);

  const defaultBounds = getMonthBounds(new Date());
  const rangeStart = startDate || defaultBounds.start;
  const rangeEnd = endDate || defaultBounds.end;
  const startMk = rangeStart.slice(0, 7);
  const endMk = rangeEnd.slice(0, 7);
  const inRange = (d) => !!d && d >= rangeStart && d <= rangeEnd;

  const rangeLabel = startMk === endMk
    ? monthLabel(startMk)
    : `${new Date(rangeStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(rangeEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // "/" in a download filename gets treated as a path separator by some browsers, so MM/YY becomes MM-YY on disk.
  const mmYY = (mk) => `${mk.slice(5, 7)}-${mk.slice(2, 4)}`;
  const fileLabel = startMk === endMk ? mmYY(startMk) : `${mmYY(startMk)} to ${mmYY(endMk)}`;

  const monthPurchases = purchases.filter((p) => inRange(p.date));

  const myName = settings.myName || 'Primary User';
  const spouseName = settings.spouseName || 'Secondary User';

  const personName = (p) => {
    if (!p) return myName;
    const lp = p.toLowerCase();
    if (lp === 'spouse' || lp === 'cameron' || lp === 'partner') return spouseName;
    if (lp === 'me' || lp === 'mine') return myName;
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const section = (title, content) => `
    <section>
      <h2>${title}</h2>
      ${content}
    </section>`;

  const ownerLabel = (o) => o === 'mine' ? myName : o === 'partner' ? spouseName : o === 'both' || o === 'joint' ? 'Joint' : o ? o.charAt(0).toUpperCase() + o.slice(1) : '';
  const ownerBadgeClass = (o) => o === 'mine' ? 'primary' : o === 'partner' ? 'secondary' : 'joint';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Monthly Expense Report — ${rangeLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 2rem; }
  h1 { font-size: 1.75rem; font-weight: 800; margin-bottom: 0.25rem; }
  .subtitle { color: #666; font-size: 0.875rem; margin-bottom: 2rem; }
  section { margin-bottom: 2.5rem; page-break-inside: avoid; }
  h2 { font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #444; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 0.5rem 0.75rem; background: #f3f4f6; font-weight: 700; color: #374151; border: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; color: #111; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.375rem; font-size: 11px; font-weight: 700; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-unpaid { background: #fee2e2; color: #991b1b; }
  .badge-primary { background: #e0e7ff; color: #3730a3; }
  .badge-secondary { background: #ede9fe; color: #5b21b6; }
  .badge-joint { background: #d1fae5; color: #065f46; }
  .amount { font-weight: 700; font-variant-numeric: tabular-nums; }
  .amount-neg { color: #dc2626; }
  .amount-pos { color: #059669; }
  @media print {
    body { padding: 1rem; }
    section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>Monthly Expense Report</h1>
<p class="subtitle">${rangeLabel} · Exported on ${ts}</p>

${inc('bills') && bills.length ? section('Bills', table(
  ['Name', 'Amount', 'Category', 'Owner', 'Due Day', 'Recurring'],
  bills.map((b) => [
    b.name,
    `<span class="amount">${fmt(b.amount)}</span>`,
    b.category || '—',
    `<span class="badge badge-${ownerBadgeClass(b.owner)}">${ownerLabel(b.owner)}</span>`,
    b.dueDay ? `Day ${b.dueDay}` : '—',
    b.isRecurring ? 'Yes' : 'No',
  ])
)) : ''}

${inc('income') && income.length ? section('Income', table(
  ['Name', 'Amount', 'Frequency'],
  income.map((i) => [
    i.source || i.name || '—',
    `<span class="amount amount-pos">${fmt(i.amount)}</span>`,
    i.frequency || '—',
  ])
)) : ''}

${inc('debts') && debts.length ? section('Debts', table(
  ['Name', 'Balance', 'Min Payment', 'Interest Rate', 'Owner'],
  debts.map((d) => [
    d.name,
    `<span class="amount amount-neg">${fmt(d.balance)}</span>`,
    `<span class="amount">${fmt(d.minPayment)}/mo</span>`,
    d.interestRate != null ? `${d.interestRate}% APR` : '—',
    `<span class="badge badge-${ownerBadgeClass(d.owner)}">${ownerLabel(d.owner)}</span>`,
  ])
)) : ''}

${inc('savings') && savings.length ? section('Savings', table(
  ['Name', 'Balance', 'Goal', 'Progress'],
  savings.map((s) => [
    s.name,
    `<span class="amount amount-pos">${fmt(s.balance)}</span>`,
    s.goal ? fmt(s.goal) : '—',
    s.goal ? `${Math.min(100, Math.round((s.balance / s.goal) * 100))}%` : '—',
  ])
)) : ''}

${inc('commitments') && commitments.length ? section('Commitments', table(
  ['Description', 'Amount', 'Person', 'End Date', 'Status'],
  commitments.map((c) => [
    c.description,
    c.amount ? `<span class="amount">${fmt(c.amount)}</span>` : '—',
    c.person === 'me' ? myName : c.person === 'partner' ? spouseName : 'Both',
    c.endDate ? new Date(c.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    c.completed ? '<span class="badge badge-paid">Done</span>' : '<span class="badge badge-unpaid">Open</span>',
  ])
)) : ''}

${inc('planned') && plannedExpenses.length ? section('Planned Expenses', table(
  ['Name', 'Amount', 'Target Date', 'From Savings', 'Notes'],
  plannedExpenses.map((pe) => [
    pe.name,
    `<span class="amount amount-neg">${fmt(pe.amount)}</span>`,
    pe.targetDate ? new Date(pe.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    pe.fromSavingsId || '—',
    pe.notes || '',
  ])
)) : ''}

${inc('agreements') && agreements.length ? section('Financial Deals', table(
  ['Description', 'Amount', 'Who', 'Date', 'Status', 'Notes'],
  agreements.map((ag) => [
    ag.description,
    ag.amount != null && ag.amount > 0 ? `<span class="amount">${fmt(ag.amount)}</span>` : '—',
    ag.person === 'me' ? myName : ag.person === 'partner' ? spouseName : 'Both',
    ag.date ? new Date(ag.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    ag.status === 'settled' ? '<span class="badge badge-paid">Settled</span>' : '<span class="badge badge-pending">Active</span>',
    ag.notes || '',
  ])
)) : ''}

${inc('projects') && projects.length ? section('Projects', table(
  ['Name', 'Notes', 'Review Date', 'Due Date', 'Status'],
  projects.map((p) => [
    p.name,
    p.notes ? `<span style="white-space:pre-wrap;font-size:11px;">${p.notes}</span>` : '—',
    p.reviewDate ? new Date(p.reviewDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    p.dueDate ? new Date(p.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    p.completed ? '<span class="badge badge-paid">Done</span>' : '<span class="badge badge-unpaid">Active</span>',
  ])
)) : ''}

${inc('purchases') && monthPurchases.length ? section('Spending', table(
  ['Date', 'Merchant', 'Amount', 'Category', 'By', 'Notes'],
  monthPurchases.map((p) => [
    p.date || '—',
    p.merchant || '—',
    `<span class="amount amount-neg">${fmt(p.amount)}</span>`,
    p.category || '—',
    personName(p.person),
    p.notes || '',
  ])
)) : ''}

${inc('budget') && budgetCategories.length ? (() => {
  const monthSpends = budgetSpends.filter((s) => {
    const m = s.month || s.monthKey;
    return m && m >= startMk && m <= endMk;
  });
  const rows = budgetCategories.map((cat) => {
    const spent = monthSpends.filter((s) => s.categoryId === cat.id).reduce((sum, s) => sum + (s.amount || 0), 0);
    const remaining = (cat.monthlyLimit || 0) - spent;
    return [
      cat.name,
      `<span class="amount">${fmt(cat.monthlyLimit)}</span>`,
      `<span class="amount ${spent > 0 ? 'amount-neg' : ''}">${fmt(spent)}</span>`,
      `<span class="amount ${remaining < 0 ? 'amount-neg' : 'amount-pos'}">${fmt(remaining)}</span>`,
    ];
  });
  const totalLimit = budgetCategories.reduce((s, c) => s + (c.monthlyLimit || 0), 0);
  const totalSpent = budgetCategories.reduce((sum, cat) => {
    return sum + monthSpends.filter((s) => s.categoryId === cat.id).reduce((s2, s) => s2 + (s.amount || 0), 0);
  }, 0);
  rows.push([
    '<strong>Total</strong>',
    `<strong>${fmt(totalLimit)}</strong>`,
    `<strong class="amount-neg">${fmt(totalSpent)}</strong>`,
    `<strong class="${totalLimit - totalSpent < 0 ? 'amount-neg' : 'amount-pos'}">${fmt(totalLimit - totalSpent)}</strong>`,
  ]);
  return section('Budget', table(['Category', 'Limit', 'Spent', 'Remaining'], rows));
})() : ''}

${inc('lists') && shoppingLists.length ? (() => {
  const listBlocks = shoppingLists.filter((l) => !isTaskList(l.type)).map((list) => {
    const items = shoppingItems.filter((i) => i.listId === list.id);
    const done = items.filter((i) => i.checked);
    const pending = items.filter((i) => !i.checked);
    const priced = items.filter((i) => i.price != null);
    const total = priced.reduce((s, i) => s + (i.price || 0), 0);
    const doneTotal = done.filter((i) => i.price != null).reduce((s, i) => s + (i.price || 0), 0);
    const rows = [
      ...pending.map((i) => ['', i.name, i.qty || '—', i.price != null ? fmt(i.price) : '—']),
      ...done.map((i) => ['&#10003;', i.name, i.qty || '—', i.price != null ? fmt(i.price) : '—']),
    ];
    if (rows.length === 0) return '';
    const summary = `<p style="margin-top:0.5rem;font-size:12px;color:#666;">${done.length}/${items.length} items complete${priced.length > 0 ? ` &nbsp;·&nbsp; Total: <strong>${fmt(total)}</strong>${done.length > 0 && doneTotal > 0 ? ` &nbsp;·&nbsp; Spent: <strong>${fmt(doneTotal)}</strong>` : ''}` : ''}</p>`;
    return `<div style="margin-bottom:1.5rem"><h3 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem;color:#374151">${list.name || 'Shopping List'}</h3>${table(['Done', 'Item', 'Qty', 'Price'], rows)}${summary}</div>`;
  }).filter(Boolean);
  return listBlocks.length ? section('Shopping Lists', listBlocks.join('')) : '';
})() : ''}

${inc('shifts') && shifts.length ? (() => {
  const displayShifts = shifts.filter((s) => inRange(s.date));
  if (displayShifts.length === 0) return '';
  displayShifts.sort((a, b) => a.date.localeCompare(b.date));
  const fmtTime = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  const fmtDuration = (h) => {
    if (!h) return '—';
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };
  return section('Work Shifts', table(
    ['Date', 'Job', 'Start', 'End', 'Duration', 'Location'],
    displayShifts.map((sh) => {
      const job = jobs.find((j) => j.id === sh.jobId);
      return [
        new Date(sh.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        job?.name || '—',
        fmtTime(sh.startTime),
        fmtTime(sh.endTime),
        `<span class="amount">${fmtDuration(sh.hoursWorked)}</span>`,
        sh.location || '—',
      ];
    })
  ));
})() : ''}

</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Monthly Expense Report - ${fileLabel}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Debt payoff calculator ──
export function calcDebtPayoff(balance, annualRate, monthlyPayment) {
  if (!balance || !monthlyPayment) return null;
  const rate = (annualRate || 0) / 100 / 12;
  if (monthlyPayment <= balance * rate) return null; // payment too low to payoff
  let bal = balance;
  let months = 0;
  let totalInterest = 0;
  while (bal > 0 && months < 600) {
    const interest = bal * rate;
    totalInterest += interest;
    bal = bal + interest - monthlyPayment;
    months++;
    if (bal < 0) bal = 0;
  }
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return { months, totalInterest, payoffDate };
}

// ── Spending per month (last N months) ──
export function getSpendingHistory(purchases, months = 6) {
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mk = monthKey(d);
    const total = purchases.filter((p) => p.date?.startsWith(mk)).reduce((s, p) => s + p.amount, 0);
    result.push({ month: d.toLocaleDateString('en-US', { month: 'short' }), amount: total, mk });
  }
  return result;
}

// ── Category totals for a month ──
export function getCategoryTotals(purchases, mk) {
  const map = {};
  purchases.filter((p) => p.date?.startsWith(mk)).forEach((p) => {
    map[p.category] = (map[p.category] || 0) + p.amount;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({ cat, amt }));
}


// ── Job Schedule Export ──
export function exportJobScheduleHTML({ job, shifts, startDate = null, endDate = null, showIncome = true }) {
  const ts = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmt = (n) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let displayShifts = shifts.filter((s) => s.jobId === job.id);
  if (startDate) displayShifts = displayShifts.filter((s) => s.date >= startDate);
  if (endDate) displayShifts = displayShifts.filter((s) => s.date <= endDate);
  displayShifts.sort((a, b) => a.date.localeCompare(b.date));

  const totalHours = displayShifts.reduce((s, sh) => s + (sh.hoursWorked || 0), 0);

  const fmtTime = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  const fmtDuration = (h) => {
    if (!h) return '—';
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  const periodLabel = startDate && endDate
    ? `${new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'All Shifts';

  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${job.name} — Schedule Export</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 2rem; }
  h1 { font-size: 1.75rem; font-weight: 800; margin-bottom: 0.25rem; }
  .subtitle { color: #666; font-size: 0.875rem; margin-bottom: 0.5rem; }
  .meta { color: #444; font-size: 0.8125rem; margin-bottom: 2rem; }
  section { margin-bottom: 2.5rem; }
  h2 { font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #444; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 0.5rem 0.75rem; background: #f3f4f6; font-weight: 700; color: #374151; border: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; color: #111; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .amount { font-weight: 700; font-variant-numeric: tabular-nums; }
  .summary { display: flex; gap: 2rem; padding: 1rem; background: #f3f4f6; border-radius: 0.5rem; margin-bottom: 1.5rem; }
  .summary-item { }
  .summary-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 0.25rem; }
  .summary-value { font-size: 1.5rem; font-weight: 800; color: #111; }
  @media print { body { padding: 1rem; } }
</style>
</head>
<body>
<h1>${job.name}</h1>
<p class="subtitle">Schedule Export — Exported on ${ts}</p>
<p class="meta">
  ${showIncome ? `Pay rate: ${fmt(job.hourlyRate)}/hr · ${job.payFrequency || 'biweekly'} · ` : ''}Period: ${periodLabel}
</p>

<div class="summary">
  <div class="summary-item">
    <p class="summary-label">Total Shifts</p>
    <p class="summary-value">${displayShifts.length}</p>
  </div>
  <div class="summary-item">
    <p class="summary-label">Total Hours</p>
    <p class="summary-value">${fmtDuration(totalHours)}</p>
  </div>
  ${showIncome ? `<div class="summary-item">
    <p class="summary-label">Est. Gross Pay</p>
    <p class="summary-value">${fmt(Math.round(totalHours * (job.hourlyRate || 0) * 100) / 100)}</p>
  </div>` : ''}
</div>

${displayShifts.length > 0 ? `
<section>
  <h2>Shifts</h2>
  ${table(
    ['Date', 'Start', 'End', 'Duration', 'Location', 'Notes'],
    displayShifts.map((sh) => [
      new Date(sh.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      fmtTime(sh.startTime),
      fmtTime(sh.endTime),
      `<span class="amount">${fmtDuration(sh.hoursWorked)}</span>`,
      sh.location || '—',
      sh.notes || '',
    ])
  )}
</section>
` : '<p style="color:#666;margin-top:1rem;">No shifts found for this period.</p>'}

</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${job.name.replace(/\s+/g, '-').toLowerCase()}-schedule-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
