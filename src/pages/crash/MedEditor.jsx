import { useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/Modal';
import {
  normalizeMed, supplyStatus, formatOffset, MED_KINDS,
} from './meds.js';
import { headingStyle, Segmented, SupplyBar } from './medsUi.jsx';

const OFFSET_CHOICES = [-120, -60, -30, -15, 0, 30, 60, 120, 240];

/**
 * One medication, and everything the app knows about it.
 *
 * Saves on every keystroke rather than behind a Save button. This screen gets
 * opened on the way to somewhere else — usually to log a dose — and a half
 * filled-in form that discards itself on a back-tap is worse than no form.
 */
export default function MedEditor({ med: raw, onClose }) {
  const { crashMeds, updateCrashMed, deleteCrashMed, refillCrashMed } = useApp();
  const med = normalizeMed(raw);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refilling, setRefilling] = useState('');

  const set = (patch) => updateCrashMed(med.id, patch);
  const setSchedule = (patch) => set({ schedule: { ...med.schedule, ...patch } });
  const setSupply = (patch) => set({ supply: { ...med.supply, ...patch } });

  // A med can hang off any other med, but never off itself — that's a chain
  // with no beginning, and the resolver would just give up and say "unknown".
  const anchors = crashMeds.filter((m) => m.id !== med.id && m.active !== false);
  const status = supplyStatus(med, Date.now());

  const addRule = () => set({
    rules: [...med.rules, { id: `r-${Date.now()}`, text: '', offsetMinutes: -60 }],
  });
  const setRule = (id, patch) => set({
    rules: med.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
  const removeRule = (id) => set({ rules: med.rules.filter((r) => r.id !== id) });

  const numberOrBlank = (v) => (v === '' ? null : Number(v));

  return (
    <Modal
      title={med.name || 'New medication'}
      onClose={onClose}
      footer={<button onClick={onClose} className="app-btn-primary" style={{ width: '100%' }}>Done</button>}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <label className="app-label">Name</label>
        <input
          value={med.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Whatever you call it"
          className="app-input"
          style={{ width: '100%', marginBottom: '0.75rem' }}
          autoFocus={!med.name}
        />

        <label className="app-label">Strength</label>
        <input
          value={med.strength}
          onChange={(e) => set({ strength: e.target.value })}
          placeholder="Optional"
          className="app-input"
          style={{ width: '100%', marginBottom: '0.75rem' }}
        />

        <label className="app-label">Kind</label>
        <Segmented
          options={MED_KINDS}
          value={med.kind}
          onChange={(kind) => set({ kind })}
        />
      </div>

      {/* ── When ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={headingStyle}>WHEN</h2>
        <Segmented
          options={[
            { key: 'clock', label: 'At a time' },
            { key: 'offset', label: 'After another' },
          ]}
          value={med.schedule.mode}
          onChange={(mode) => setSchedule({ mode })}
          style={{ marginBottom: '0.75rem' }}
        />

        {med.schedule.mode === 'clock' ? (
          <input
            type="time"
            value={med.schedule.time || ''}
            onChange={(e) => setSchedule({ time: e.target.value })}
            className="app-input"
            style={{ width: '100%' }}
          />
        ) : anchors.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--warn)', lineHeight: 1.5 }}>
            There’s nothing else to hang this off yet. Add the earlier one first,
            or give this a time of its own.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={med.schedule.afterMedId || ''}
              onChange={(e) => setSchedule({ afterMedId: e.target.value })}
              className="app-input"
              style={{ flex: 1 }}
            >
              <option value="">Pick one…</option>
              {anchors.map((a) => (
                <option key={a.id} value={a.id}>{a.name || 'Untitled'}</option>
              ))}
            </select>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={med.schedule.offsetHours}
              onChange={(e) => setSchedule({ offsetHours: Number(e.target.value) })}
              className="app-input"
              style={{ width: '5rem' }}
              aria-label="Hours after"
            />
            <span style={{ alignSelf: 'center', fontSize: '0.875rem', color: 'var(--muted)' }}>h after</span>
          </div>
        )}

        <label className="app-label" style={{ marginTop: '0.875rem' }}>
          How long past that before it counts as skipped
        </label>
        <Segmented
          options={[0, 15, 45, 90].map((n) => ({ key: n, label: n === 0 ? 'Straight away' : `${n} min` }))}
          value={med.graceMinutes}
          onChange={(graceMinutes) => set({ graceMinutes })}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.5rem' }}>
          Until this runs out, the app holds off on saying when your window
          starts — because taking this would move it. After it, the window is
          worked out as though you didn’t.
        </p>
      </div>

      {/* ── Timing ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={headingStyle}>WHAT IT DOES TO YOUR EVENING</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
          Your own numbers, not anyone else’s. Once there’s enough history,
          <strong style={{ color: 'var(--text)' }}> What usually happens </strong>
          will tell you what they actually are.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <label className="app-label">Hours until it wears off</label>
            <input
              type="number" min="0.5" step="0.5"
              value={med.onsetHours}
              onChange={(e) => set({ onsetHours: Number(e.target.value) })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="app-label">Hours it then lasts</label>
            <input
              type="number" min="0.5" step="0.5"
              value={med.durationHours}
              onChange={(e) => set({ durationHours: Number(e.target.value) })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* ── Rules ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={headingStyle}>MY RULES FOR THIS ONE</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
          In your words. These show up when you go to log the dose, and buzz at
          the time you set.
        </p>

        <div style={{ display: 'grid', gap: '0.625rem' }}>
          {med.rules.map((rule) => (
            <div key={rule.id} style={{
              padding: '0.75rem', borderRadius: '0.75rem',
              backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <input
                  value={rule.text}
                  onChange={(e) => setRule(rule.id, { text: e.target.value })}
                  placeholder="Eat first — nothing too high in fat"
                  className="app-input"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => removeRule(rule.id)}
                  aria-label="Remove this rule"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem',
                    color: 'var(--muted)', flexShrink: 0,
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <select
                value={rule.offsetMinutes}
                onChange={(e) => setRule(rule.id, { offsetMinutes: Number(e.target.value) })}
                className="app-input"
                style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8125rem' }}
              >
                {OFFSET_CHOICES.map((n) => (
                  <option key={n} value={n}>{formatOffset(n)}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <button
          onClick={addRule}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.625rem',
            padding: '0.625rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
          }}
        >
          <Plus size={15} /> Add a rule
        </button>
      </div>

      {/* ── Supply ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={headingStyle}>WHAT’S LEFT</h2>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <label className="app-label">On hand</label>
            <input
              type="number" min="0" inputMode="numeric"
              value={med.supply.onHand ?? ''}
              onChange={(e) => setSupply({ onHand: numberOrBlank(e.target.value) })}
              placeholder="Not counting"
              className="app-input" style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="app-label">Per dose</label>
            <input
              type="number" min="1" step="1"
              value={med.supply.perDose}
              onChange={(e) => setSupply({ perDose: Number(e.target.value) || 1 })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.875rem' }}>
          <div style={{ flex: 1 }}>
            <label className="app-label">Warn me under</label>
            <input
              type="number" min="0" step="1"
              value={med.supply.lowDays}
              onChange={(e) => setSupply({ lowDays: Number(e.target.value) })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="app-label">Can refill from</label>
            <input
              type="date"
              value={med.supply.refillFrom || ''}
              onChange={(e) => setSupply({ refillFrom: e.target.value })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
        </div>

        <SupplyBar status={status} />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
          <input
            type="number" min="0" inputMode="numeric"
            value={refilling}
            onChange={(e) => setRefilling(e.target.value)}
            placeholder="Filled — how many?"
            className="app-input" style={{ flex: 1 }}
          />
          <button
            onClick={() => { refillCrashMed(med.id, Number(refilling)); setRefilling(''); }}
            disabled={refilling === '' || Number.isNaN(Number(refilling))}
            className="app-btn-primary"
            style={{ opacity: refilling === '' ? 0.5 : 1, flexShrink: 0 }}
          >
            Refilled
          </button>
        </div>
      </div>

      {/* ── Off the list ── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={med.active !== false}
            onChange={(e) => set({ active: e.target.checked })}
            style={{ width: '1.125rem', height: '1.125rem', flexShrink: 0 }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
            Still taking this
          </span>
        </label>

        {confirmDelete ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => { deleteCrashMed(med.id); onClose(); }}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: 'var(--danger)', color: '#fff', border: 'none',
                fontSize: '0.875rem', fontWeight: 700,
              }}
            >
              Delete for good
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
                fontSize: '0.875rem', fontWeight: 700,
              }}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600,
            }}
          >
            <Trash2 size={14} /> Remove this medication
          </button>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.625rem' }}>
          Unticking keeps the history. Deleting removes it from the list for
          good; doses you already logged stay where they are.
        </p>
      </div>
    </Modal>
  );
}
