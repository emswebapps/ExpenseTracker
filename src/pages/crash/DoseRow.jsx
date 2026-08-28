import { useState } from 'react';
import { Pill, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNow } from './useCountdown.js';
import { predictWindow, windowState, windowProgress, latestDose } from './window.js';
import { mergeKit } from './crashKit.js';
import { formatClock } from './protocol.js';
import Modal from '../../components/Modal';

/**
 * Tonight's window, drawn from the time you logged.
 *
 * A plain flex bar rather than a chart library — this sits on the crisis path,
 * and pulling recharts in here would put a heavier bundle between the user and
 * the panic button. The pattern chart in History can afford it; this can't.
 */
function Timeline({ w, now }) {
  const total = w.end - w.takenAt;
  const windowStartPct = ((w.start - w.takenAt) / total) * 100;
  const nowPct = Math.min(100, Math.max(0, ((now - w.takenAt) / total) * 100));
  const inside = now >= w.start && now < w.end;

  return (
    <div style={{ marginTop: '0.875rem' }}>
      <div style={{
        position: 'relative', height: '0.625rem', borderRadius: '9999px',
        backgroundColor: 'var(--surface2)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${windowStartPct}%`, right: 0,
          backgroundColor: inside ? 'var(--accent)' : 'var(--accent-soft)',
        }} />
      </div>

      {now >= w.takenAt && now <= w.end && (
        <div style={{ position: 'relative', height: 0 }}>
          <div style={{
            position: 'absolute', top: '-0.9375rem', left: `${nowPct}%`,
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
        <span>{formatClock(w.end)}</span>
      </div>
    </div>
  );
}

export default function DoseRow() {
  const { crashDoses, crashKit, addCrashDose, updateCrashDose } = useApp();
  const kit = mergeKit(crashKit);
  // Keyed on the doses themselves so logging or editing one updates the clock
  // straight away rather than at the next minute boundary.
  const syncKey = crashDoses.length
    ? `${crashDoses.length}:${Math.max(...crashDoses.map((d) => d.takenAt))}`
    : '0';
  const now = useNow({ tick: 60_000, syncKey });
  const [editing, setEditing] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  if (kit.doseTracking === false) return null;

  const dose = latestDose(crashDoses, now);
  const w = predictWindow(crashDoses, kit, now);
  const state = windowState(w, now);

  const log = () => {
    addCrashDose(Date.now());
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2000);
  };

  const line = {
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
            {dose ? 'Took my meds' : 'Meds not logged'}
          </p>
          {dose && (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: 600,
              }}
            >
              {formatClock(dose.takenAt)} — change
            </button>
          )}
        </div>
        <button
          onClick={log}
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
          {justLogged ? 'Logged' : dose ? 'Another' : 'Log'}
        </button>
      </div>

      {w && <Timeline w={w} now={now} />}

      {line && (
        <p style={{
          fontSize: '0.8125rem', lineHeight: 1.45, marginTop: w ? '0.75rem' : '0.5rem',
          color: state === 'soon' ? 'var(--accent-text)' : 'var(--subtle)',
          fontWeight: state === 'soon' ? 600 : 400,
        }}>
          {line}
        </p>
      )}

      {editing && dose && (
        <TimeEditor
          dose={dose}
          onSave={(takenAt) => { updateCrashDose(dose.id, { takenAt }); setEditing(false); }}
          onClose={() => setEditing(false)}
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
