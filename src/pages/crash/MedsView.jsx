import { useState } from 'react';
import { Plus, Pill, Clock, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNow } from './useCountdown.js';
import { formatClock } from './protocol.js';
import {
  normalizeMed, expectedDosesToday, supplyStatus, rulesForMed, formatOffset,
} from './meds.js';
import { ViewHeader, SupplyBar } from './medsUi.jsx';
import MedEditor from './MedEditor.jsx';

const STATE_LABEL = {
  taken: { text: 'Taken', color: 'var(--positive-text)' },
  due: { text: 'Due now', color: 'var(--accent-text)' },
  upcoming: { text: 'Later today', color: 'var(--subtle)' },
  skipped: { text: 'Not logged', color: 'var(--muted)' },
  unknown: { text: 'No time set', color: 'var(--muted)' },
};

/**
 * What you take.
 *
 * Everything on this screen was typed in by the person reading it. The app
 * holds the list, does the arithmetic, and repeats it back — it has no opinion
 * about any of it, and there is nothing here it filled in on their behalf.
 */
export default function MedsView({ onBack }) {
  const { crashMeds, crashDoses, addCrashMed } = useApp();
  const now = useNow({ tick: 60_000, syncKey: `${crashMeds.length}:${crashDoses.length}` });
  const [editingId, setEditingId] = useState(null);

  const expected = expectedDosesToday(crashMeds, crashDoses, now);
  const byMedId = new Map(expected.map((e) => [e.medId, e]));
  const editing = editingId && crashMeds.find((m) => m.id === editingId);

  const add = () => setEditingId(addCrashMed({ name: '' }).id);

  return (
    <div className="app-page" style={{ padding: '1.25rem' }}>
      <ViewHeader
        title="My medications"
        onBack={onBack}
        action={(
          <button onClick={add} aria-label="Add a medication" style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--accent)', color: '#fff', flexShrink: 0,
          }}>
            <Plus size={18} />
          </button>
        )}
      />

      {crashMeds.length === 0 ? (
        <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
          <Pill size={30} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Add what you take and when you take it. The app uses the times to
            work out when your evening is likely to get hard — and to say so
            before it does, rather than after.
          </p>
          <button onClick={add} className="app-btn-primary" style={{ width: '100%' }}>
            Add a medication
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {crashMeds.map((raw) => {
            const med = normalizeMed(raw);
            const e = byMedId.get(med.id);
            const state = e ? e.state : 'unknown';
            const label = STATE_LABEL[state];
            const supply = supplyStatus(med, now);
            const rules = rulesForMed(med);

            return (
              <button
                key={med.id}
                onClick={() => setEditingId(med.id)}
                className="app-card"
                style={{
                  padding: '1rem', textAlign: 'left', cursor: 'pointer', width: '100%',
                  border: `1px solid ${supply.low ? 'var(--warn)' : 'var(--border)'}`,
                  opacity: med.active === false ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ flex: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    {med.name || 'Untitled'}
                  </span>
                  {supply.low && <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: label.color, flexShrink: 0 }}>
                    {med.active === false ? 'Archived' : label.text}
                  </span>
                </div>

                <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.1875rem' }}>
                  {[med.strength, e && e.expectedAt != null && `${formatClock(e.expectedAt)}`]
                    .filter(Boolean).join(' · ') || 'No strength or time set'}
                </p>

                {supply.tracked || supply.refillAt ? (
                  <div style={{ marginTop: '0.75rem' }}><SupplyBar status={supply} /></div>
                ) : null}

                {rules.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.75rem',
                    fontSize: '0.75rem', color: 'var(--muted)',
                  }}>
                    <Clock size={12} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatOffset(rules[0].offsetMinutes)} — {rules[0].text}
                      {rules.length > 1 && ` · +${rules.length - 1} more`}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editing && <MedEditor med={editing} onClose={() => setEditingId(null)} />}
    </div>
  );
}
