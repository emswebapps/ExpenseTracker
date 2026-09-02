import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { isTaskList, isWishlist } from '../../../utils/helpers';
import { LIST_TYPES } from '../listMeta';
import { useDueReminder, DueReminderFields } from '../useDueReminder';
import { WEEKDAYS, weeklyConfig } from '../weeks';

// ── ListForm ──────────────────────────────────────────────────────────────────
export function ListForm({ initial = {}, defaultLeadMinutes = 0, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [type, setType] = useState(initial.type || 'grocery');
  const [store, setStore] = useState(initial.store || '');
  const [forPerson, setForPerson] = useState(initial.forPerson || '');
  const due = useDueReminder(initial, defaultLeadMinutes);

  // ── Weekly planner ──
  const savedWeekly = weeklyConfig(initial);
  const [weeklyOn, setWeeklyOn] = useState(!!initial.weekly?.enabled);
  const [startDay, setStartDay] = useState(savedWeekly.startDay);
  const [days, setDays] = useState(savedWeekly.days);
  const [emoji, setEmoji] = useState(savedWeekly.emoji);

  // Ordered from the chosen first day, so the row reads Mon…Sun rather than
  // always Sun…Sat.
  const dayOrder = Array.from({ length: 7 }, (_, i) => (startDay + i) % 7);
  const toggleDay = (day) => setDays((current) => (
    current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
  ));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Turning the planner off leaves the weeks already built alone — they're
    // real tasks by then. It only stops new ones being added.
    const weekly = (isTaskList(type) && weeklyOn)
      ? {
          ...savedWeekly,
          enabled: true,
          startDay,
          days: days.length > 0 ? days : [1, 2, 3, 4, 5, 6, 0],
          emoji,
        }
      : { ...savedWeekly, enabled: false };

    onSave({
      name: name.trim(),
      type,
      store: type === 'grocery' ? (store.trim() || null) : null,
      forPerson: isWishlist(type) ? (forPerson.trim() || null) : null,
      weekly,
      ...due.dueFields(),
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">List Name *</label>
        <input className="app-input" placeholder="e.g. Weekly Groceries, Project Tasks…" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Type</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {LIST_TYPES.map(({ key, short, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              style={{
                flex: 1, minWidth: 0, padding: '0.625rem 0.375rem', borderRadius: '0.75rem', border: '2px solid',
                borderColor: type === key ? 'var(--accent)' : 'var(--border)',
                backgroundColor: type === key ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: type === key ? 'var(--accent-text)' : 'var(--muted)',
                fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem',
              }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} /> {short}
            </button>
          ))}
        </div>
      </div>
      {type === 'grocery' && (
        <div>
          <label className="app-label">Store <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="e.g. Walmart, Costco, Target…" value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
      )}
      {isWishlist(type) && (
        <div>
          <label className="app-label">Who it's for <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="Leave blank for yourself — or a name, e.g. Mom" value={forPerson} onChange={(e) => setForPerson(e.target.value)} />
        </div>
      )}

      {isTaskList(type) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={weeklyOn}
              onChange={(e) => setWeeklyOn(e.target.checked)}
              style={{ width: '1.125rem', height: '1.125rem', marginTop: '0.125rem', flexShrink: 0, accentColor: 'var(--accent)' }}
            />
            <span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                <CalendarRange size={14} /> Weekly planner
              </span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.1875rem' }}>
                Keeps this week and next laid out as their own sections, with a
                heading per day. Add your tasks underneath the day they belong to.
              </span>
            </span>
          </label>

          {weeklyOn && (
            <div style={{ marginTop: '0.875rem', paddingLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label className="app-label">Weeks start on</label>
                <select className="app-input" value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}>
                  {WEEKDAYS.map((w) => <option key={w.day} value={w.day}>{w.long.charAt(0) + w.long.slice(1).toLowerCase()}</option>)}
                </select>
              </div>

              <div>
                <label className="app-label">Days to include</label>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {dayOrder.map((day) => {
                    const on = days.includes(day);
                    const short = WEEKDAYS.find((w) => w.day === day).short;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        aria-pressed={on}
                        style={{
                          flex: 1, minWidth: 0, minHeight: '2.75rem', borderRadius: '0.625rem',
                          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          backgroundColor: on ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                          color: on ? 'var(--accent-text)' : 'var(--muted)',
                          fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {short.charAt(0)}
                      </button>
                    );
                  })}
                </div>
                {days.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--warn, #f59e0b)', marginTop: '0.375rem' }}>
                    Pick at least one day — all seven are used otherwise.
                  </p>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={emoji} onChange={(e) => setEmoji(e.target.checked)}
                  style={{ width: '1.125rem', height: '1.125rem', flexShrink: 0, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: '0.875rem', color: 'var(--text)' }}>Put 📅 around the day names</span>
              </label>
            </div>
          )}
        </div>
      )}

      <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />
      <DueReminderFields
        due={due}
        help="Optional — set when the whole list is due, e.g. shopping on Saturday morning. This is separate from any reminder on an individual item."
        notifyLabel="Remind me about this list"
      />

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
      </div>
    </form>
  );
}
