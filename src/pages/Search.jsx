import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ShoppingBag, Receipt, TrendingUp, NotebookPen, CreditCard, ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, isTaskList } from '../utils/helpers';
import { formatDueMoment } from '../utils/dueDates';

const TYPE_ICON = {
  purchase: ShoppingBag,
  bill: Receipt,
  income: TrendingUp,
  note: NotebookPen,
  debt: CreditCard,
  task: ClipboardList,
};

const TYPE_COLOR = {
  purchase: 'var(--accent-text)',
  bill: 'var(--warn)',
  income: 'var(--positive-text)',
  note: 'var(--muted)',
  debt: 'var(--danger)',
  task: 'var(--accent-text)',
};

const TYPE_LABEL = {
  purchase: 'Spending',
  bill: 'Bill',
  income: 'Income',
  note: 'Note',
  debt: 'Debt',
  task: 'Task',
};

export default function SearchPage() {
  const { purchases, bills, income, notes, debts, shoppingLists, shoppingItems } = useApp();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const hits = [];

    purchases.forEach((p) => {
      if ([p.merchant, p.category, p.notes].some((s) => s?.toLowerCase().includes(query))) {
        hits.push({ type: 'purchase', id: p.id, title: p.merchant, sub: p.category, amount: p.amount, date: p.date });
      }
    });

    bills.forEach((b) => {
      if ([b.name, b.category, b.notes].some((s) => s?.toLowerCase().includes(query))) {
        hits.push({ type: 'bill', id: b.id, title: b.name, sub: b.category, amount: b.amount });
      }
    });

    income.forEach((i) => {
      if ([i.name, i.source].some((s) => s?.toLowerCase().includes(query))) {
        hits.push({ type: 'income', id: i.id, title: i.name, sub: i.frequency, amount: i.amount });
      }
    });

    debts.forEach((d) => {
      if ([d.name, d.notes].some((s) => s?.toLowerCase().includes(query))) {
        hits.push({ type: 'debt', id: d.id, title: d.name, sub: `${d.interestRate ? d.interestRate + '% APR' : 'No rate'}`, amount: d.balance });
      }
    });

    notes.forEach((n) => {
      if ([n.title, n.content].some((s) => s?.toLowerCase().includes(query))) {
        hits.push({ type: 'note', id: n.id, title: n.title || 'Untitled note', sub: n.content?.slice(0, 60) });
      }
    });

    // Tasks live on to-do and work lists; the sub-line says which list and when
    // it's due, and the hit opens that list.
    const taskLists = new Map(
      shoppingLists.filter((l) => isTaskList(l.type)).map((l) => [l.id, l])
    );
    shoppingItems.forEach((i) => {
      const list = taskLists.get(i.listId);
      if (!list) return;
      if (![i.name, i.notes, i.address].some((s) => s?.toLowerCase().includes(query))) return;
      const due = formatDueMoment(i.dueDate, i.dueTime);
      hits.push({
        type: 'task', id: i.id, title: i.name,
        sub: [list.name, due, i.status === 'done' ? 'done' : null].filter(Boolean).join(' · '),
        to: `/lists?list=${list.id}`,
        dim: i.status === 'done',
      });
    });

    return hits.slice(0, 50);
  }, [q, purchases, bills, income, notes, debts, shoppingLists, shoppingItems]);

  return (
    <div style={{ paddingBottom: '7rem', backgroundColor: 'var(--bg)', minHeight: '100svh' }}>
      {/* Header */}
      <div style={{ padding: '1.25rem 1rem 0.75rem', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ fontSize: '1.625rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '0.875rem' }}>Search</h1>
        <div style={{ position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            autoFocus
            className="app-input"
            style={{ paddingLeft: '2.5rem', paddingRight: q ? '2.5rem' : '0.875rem' }}
            placeholder="Bills, spending, income, tasks, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0.25rem' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '1rem' }}>
        {!q && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <Search size={48} style={{ margin: '0 auto 1rem', opacity: 0.15, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>Search everything</p>
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>Bills, spending, income, tasks, notes, and debts</p>
          </div>
        )}

        {q && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No results</p>
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>Try a different search term</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.75rem', fontWeight: 600 }}>{results.length} result{results.length !== 1 ? 's' : ''}</p>
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
              {results.map((r, i) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <div
                    key={`${r.type}-${r.id}`}
                    onClick={r.to ? () => navigate(r.to) : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem',
                      borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: r.to ? 'pointer' : 'default',
                      opacity: r.dim ? 0.55 : 1,
                    }}
                  >
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.625rem', backgroundColor: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={15} style={{ color: TYPE_COLOR[r.type] }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                        <span style={{ fontSize: '0.6875rem', color: TYPE_COLOR[r.type], backgroundColor: 'var(--surface2)', border: `1px solid var(--border)`, padding: '0.1rem 0.4rem', borderRadius: '0.375rem', fontWeight: 700, flexShrink: 0 }}>
                          {TYPE_LABEL[r.type]}
                        </span>
                      </div>
                      {r.sub && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</p>}
                      {r.date && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{formatDate(r.date)}</p>}
                    </div>
                    {r.amount != null && (
                      <p style={{ fontWeight: 800, fontSize: '1rem', color: r.type === 'income' ? 'var(--positive-text)' : 'var(--text)', flexShrink: 0 }}>
                        {formatCurrency(r.amount)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
