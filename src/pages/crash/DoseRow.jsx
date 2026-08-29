import { useState } from 'react';
import { Pill, Check, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNow } from './useCountdown.js';
import { windowState } from './window.js';
import { mergeKit } from './crashKit.js';
import { formatClock } from './protocol.js';
import {
  effectiveWindow, expectedDosesToday, rulesForMed, formatOffset, normalizeMed, supplyStatus,
} from './meds.js';
import Modal from '../../components/Modal';

/**
 * Tonight's window, drawn from the times you logged.
 *
 * A plain flex bar rather than a chart library — this sits on the crisis path,
 * and pulling recharts in here would put a heavier bundle between the user and
 * the panic button. The pattern chart in History can afford it; this can't.
 *
 * When the window is provisional the fill is drawn to where it *could* extend
 * to, in a lighter tone, so "this might move" is visible rather than only
 * written underneath.
 */
function Timeline({ w, now }) {
  const far = w.provisional && w.wouldBecome ? w.wouldBecome.end : w.end;
  const total = far - w.takenAt;
  const pct = (t) => Math.min(100, Math.max(0, ((t - w.takenAt) / total) * 100));
  const inside = now >= w.start && now < w.end;

  return (
    <div style={{ marginTop: '0.875rem' }}>
      <div style={{
        position: 'relative', height: '0.625rem', borderRadius: '9999px',
        backgroundColor: 'var(--surface2)', overflow: 'hidden',
      }}>
        {w.provisional && w.wouldBecome && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(w.wouldBecome.start)}%`, right: 0,
            backgroundColor: 'var(--surface2)',
            borderTop: '2px dashed var(--accent-soft)',
            borderBottom: '2px dashed var(--accent-soft)',
          }} />
        )}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${pct(w.start)}%`, right: `${100 - pct(w.end)}%`,
          backgroundColor: inside ? 'var(--accent)' : 'var(--accent-soft)',
        }} />
      </div>

      {now >= w.takenAt && now <= far && (
        <div style={{ position: 'relative', height: 0 }}>
          <div style={{
            position: 'absolute', top: '-0.9375rem', left: `${pct(now)}%`,
            width: '2px', height: '1rem', marginLeft: '-1px',
            backgroundColor: 'var(--text)', borderRadius: '1px',
          }} />
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.6875rem', color: 'var(--subtle)', marginTop: '0.5rem',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{formatClock(w.takenAt)}</span>
        <span>{formatClock(w.start)}</span>
        <span>{formatClock(far)}</span>
      </div>
    </div>
  );
}

const ROW_STATE = {
  taken: { color: 'var(--positive-text)', action: null },
  due: { color: 'var(--accent-text)', action: 'Log' },
  upcoming: { color: 'var(--subtle)', action: 'Log' },
  skipped: { color: 'var(--muted)', action: 'Log' },
  unknown: { color: 'var(--muted)', action: 'Log' },
};

/** One medication's row in today's strip. */
function ScheduleRow({ entry, onLog, onEdit }) {
  const { med, state, expectedAt, dose } = entry;
  const tone = ROW_STATE[state] || ROW_STATE.unknown;
  const rules = rulesForMed(med);
  const supply = supplyStatus(med, Date.now());
  // The rules only matter up to the moment it's swallowed.
  const showRules = state !== 'taken' && rules.length > 0;

  return (
    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
            {med.name || 'Untitled'}
            {med.strength && (
              <span style={{ fontWeight: 500, color: 'var(--subtle)' }}> · {med.strength}</span>
            )}
          </p>
          <button
            onClick={() => onEdit(med.id)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, color: tone.color, textAlign: 'left',
            }}
          >
            {state === 'taken' && dose ? `Taken ${formatClock(dose.takenAt)}`
              : state === 'due' ? `Due now${expectedAt != null ? ` · ${formatClock(expectedAt)}` : ''}`
              : state === 'skipped' ? `Not logged · was ${formatClock(expectedAt)}`
              : state === 'unknown' ? 'No time set'
              : `At ${formatClock(expectedAt)}`}
            {supply.low && supply.tracked && ` · ${supply.dosesLeft} left`}
          </button>
        </div>

        {state === 'taken' ? (
          <Check size={17} style={{ color: 'var(--positive)', flexShrink: 0 }} />
        ) : (
          <button
            onClick={() => onLog(med.id)}
            style={{
              padding: '0.4375rem 0.8125rem', borderRadius: '0.6875rem', cursor: 'pointer',
              backgroundColor: state === 'due' ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${state === 'due' ? 'var(--accent)' : 'var(--border)'}`,
              color: state === 'due' ? '#fff' : 'var(--text)',
              fontSize: '0.8125rem', fontWeight: 700, flexShrink: 0,
            }}
          >
            {tone.action}
          </button>
        )}
      </div>

      {showRules && (
        <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.25rem' }}>
          {rules.map((r) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.375rem',
              fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45,
            }}>
              <Clock size={11} style={{ flexShrink: 0, marginTop: '0.1875rem' }} />
              <span><strong style={{ color: 'var(--subtle)' }}>{formatOffset(r.offsetMinutes)}</strong> — {r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DoseRow({ onOpenMeds }) {
  const { crashDoses, crashMeds, crashKit, addCrashDose, updateCrashDose, logCrashDose } = useApp();
  const kit = mergeKit(crashKit);
  // Keyed on the doses themselves so logging or editing one updates the clock
  // straight away rather than at the next minute boundary.
  const syncKey = `${crashMeds.length}:${crashDoses.length}:${
    crashDoses.length ? Math.max(...crashDoses.map((d) => d.takenAt)) : 0}`;
  const now = useNow({ tick: 60_000, syncKey });
  const [editing, setEditing] = useState(null);
  const [justLogged, setJustLogged] = useState(false);

  if (kit.doseTracking === false) return null;

  const schedule = expectedDosesToday(crashMeds, crashDoses, now);
  const w = effectiveWindow(crashMeds, crashDoses, kit, now);
  const state = windowState(w, now);
  const pending = w && w.pendingMedId
    ? normalizeMed(crashMeds.find((m) => m.id === w.pendingMedId))
    : null;

  const logPlain = () => {
    addCrashDose(Date.now());
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2000);
  };

  const editable = crashDoses.find((d) => d.id === editing) || null;

  // What the window is saying right now. While it's provisional the honest
  // answer names the condition rather than a single time — the whole point of
  // knowing about the second dose is that it changes the answer.
  const line = w && w.provisional && w.wouldBecome
    ? `About ${formatClock(w.start)} as things stand${
      pending && pending.name ? ` — take your ${pending.name} and it moves to about ${formatClock(w.wouldBecome.start)}.` : `, or about ${formatClock(w.wouldBecome.start)} if you take the next one.`}`
    : {
      before: w && `Your window: about ${formatClock(w.start)} to ${formatClock(w.end)}.`,
      soon: w && `Starts around ${formatClock(w.start)}. If there’s anything hard to say, now’s the better time.`,
      inside: w && `You’re in it until about ${formatClock(w.end)}.`,
      past: 'Tonight’s window has passed.',
      none: null,
    }[state];

  return (
    <div className="app-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Pill size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
            {schedule.length > 0 ? 'Today' : w ? 'Took my meds' : 'Meds not logged'}
          </p>
          {schedule.length === 0 && w && (
            <button
              onClick={() => setEditing(w.doseId)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: 600,
              }}
            >
              {formatClock(w.takenAt)} — change
            </button>
          )}
        </div>

        {/* The plain one-tap log stays for anyone who hasn't set up a
            medication list, and for a dose that isn't on it. */}
        {schedule.length === 0 && (
          <button
            onClick={logPlain}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
              backgroundColor: justLogged ? 'var(--positive-soft)' : 'var(--surface2)',
              border: `1px solid ${justLogged ? 'var(--positive)' : 'var(--border)'}`,
              color: justLogged ? 'var(--positive-text)' : 'var(--text)',
              fontSize: '0.875rem', fontWeight: 700, flexShrink: 0,
            }}
          >
            {justLogged ? <Check size={15} /> : null}
            {justLogged ? 'Logged' : w ? 'Another' : 'Log'}
          </button>
        )}
      </div>

      {schedule.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
          {schedule.map((entry) => (
            <ScheduleRow
              key={entry.medId}
              entry={entry}
              onLog={(medId) => logCrashDose(medId)}
              onEdit={() => onOpenMeds && onOpenMeds()}
            />
          ))}
        </div>
      )}

      {w && <Timeline w={w} now={now} />}

      {line && (
        <p style={{
          fontSize: '0.8125rem', lineHeight: 1.45, marginTop: w ? '0.75rem' : '0.5rem',
          color: state === 'soon' && !(w && w.provisional) ? 'var(--accent-text)' : 'var(--subtle)',
          fontWeight: state === 'soon' && !(w && w.provisional) ? 600 : 400,
        }}>
          {line}
        </p>
      )}

      {schedule.length === 0 && (
        <button
          onClick={() => onOpenMeds && onOpenMeds()}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, marginTop: '0.75rem',
          }}
        >
          Set up what you take →
        </button>
      )}

      {editable && (
        <TimeEditor
          dose={editable}
          onSave={(takenAt) => { updateCrashDose(editable.id, { takenAt }); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** For when you remember at 3 PM that you actually took them at 8. */
function TimeEditor({ dose, onSave, onClose }) {
  const d = new Date(dose.takenAt);
  const pad = (n) => String(n).padStart(2, '0');
  const [value, setValue] = useState(`${pad(d.getHours())}:${pad(d.getMinutes())}`);

  const save = () => {
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) { onClose(); return; }
    const next = new Date(dose.takenAt);
    next.setHours(h, m, 0, 0);
    // You only ever correct this after the fact, so a time that lands in the
    // future means the morning just gone — not tonight. Without this, editing
    // a 1 AM entry to "8:00" pushes it forward and the dose disappears from the
    // row, which reads as though the edit deleted it.
    if (next.getTime() > Date.now()) next.setDate(next.getDate() - 1);
    onSave(next.getTime());
  };

  return (
    <Modal
      title="What time?"
      onClose={onClose}
      footer={<button onClick={save} className="app-btn-primary" style={{ width: '100%' }}>Save</button>}
    >
      <input
        type="time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="app-input"
        style={{ width: '100%', fontSize: '1.125rem' }}
      />
    </Modal>
  );
}
