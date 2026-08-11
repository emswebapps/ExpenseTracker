import { useState, useMemo } from 'react';
import { AlertTriangle, CalendarClock, Sunrise, CheckCircle2 } from 'lucide-react';
import { useTicker } from './listMeta';
import { collectAgenda } from './agenda';
import TaskRow from './TaskRow';

/**
 * Everything due across every to-do and work list, in one place.
 *
 * Tasks otherwise only exist inside a list card you have to expand, so a day
 * with work spread over three lists took three taps to see. Rows are the same
 * `TaskRow` used in the cards — completing, starring, re-dating, the address
 * hand-off and the photo viewer all behave identically — plus a badge naming
 * the list each one came from.
 */

function Group({ icon: Icon, label, color, count, children, collapsible, open, onToggle }) {
  if (count === 0) return null;
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <button
        onClick={collapsible ? onToggle : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.75rem 1rem', background: 'none', border: 'none',
          borderBottom: (!collapsible || open) ? '1px solid var(--border)' : 'none',
          cursor: collapsible ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <Icon size={14} style={{ color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8125rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>{count}</span>
        {collapsible && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--subtle)' }}>{open ? '▲' : '▼'}</span>
        )}
      </button>
      {(!collapsible || open) && children}
    </div>
  );
}

export default function TodayView({
  lists, items, rowProps,
}) {
  const [showTomorrow, setShowTomorrow] = useState(false);

  const { overdue, dueToday, dueTomorrow, listById } = useMemo(
    () => collectAgenda(lists, items),
    [lists, items]
  );

  // Countdown badges tick down in minutes inside the last hour.
  useTicker(true);

  const total = overdue.length + dueToday.length;

  const rows = (group) => group.map((item) => (
    <TaskRow
      key={item.id}
      item={item}
      listLabel={listById.get(item.listId)?.name}
      {...rowProps}
    />
  ));

  if (total === 0 && dueTomorrow.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <CheckCircle2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--positive)', display: 'block' }} />
        <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>Nothing due</p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>
          No tasks are overdue or due today. Anything dated later shows on its own list.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Group icon={AlertTriangle} label="Overdue" color="var(--danger)" count={overdue.length}>
        {rows(overdue)}
      </Group>
      <Group icon={CalendarClock} label="Today" color="var(--accent-text)" count={dueToday.length}>
        {rows(dueToday)}
      </Group>
      <Group
        icon={Sunrise} label="Tomorrow" color="var(--muted)" count={dueTomorrow.length}
        collapsible open={showTomorrow} onToggle={() => setShowTomorrow((v) => !v)}
      >
        {rows(dueTomorrow)}
      </Group>
    </div>
  );
}
