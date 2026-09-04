import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  normalizeMed, supplyStatus, formatOffset, MED_KINDS, DEFAULT_MED,
} from './meds.js';
import { headingStyle, Segmented, SupplyBar, ViewHeader, pageStyle } from './medsUi.jsx';
import { useBack } from './useBack.js';

const OFFSET_CHOICES = [-120, -60, -30, -15, 0, 30, 60, 120, 240];

/**
 * One medication, on a page of its own.
 *
 * Two things this fixes about the modal it replaces.
 *
 * The first is the add flow. The old one called `addCrashMed({ name: '' })` the
 * moment you tapped +, so a medication existed before you had typed anything and
 * backing out left "Untitled" in the list for good. A new med is now held in
 * local state and written once, on Save; cancelling leaves nothing behind.
 * Editing an existing med keeps saving on every keystroke — that behaviour is
 * right for a screen opened on the way to somewhere else, and it can't orphan
 * anything, because the med is already there.
 *
 * The second is the order. What you need to add a medication and start logging
 * it is its name, its time, and how many you have. Everything the crash protocol
 * wants from it — the window arithmetic, the per-dose rules — is real, and is
 * now behind a disclosure instead of between you and the supply fields.
 */
export default function MedPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  return isNew ? <NewMed /> : <EditMed id={id} />;
}

// ── Adding ──────────────────────────────────────────────────────────────────

function NewMed() {
  const { addCrashMed } = useApp();
  const navigate = useNavigate();
  const back = useBack('/meds');
  const [draft, setDraft] = useState({ ...DEFAULT_MED, id: 'draft' });

  const named = String(draft.name || '').trim().length > 0;

  const save = () => {
    if (!named) return;
    const { id: _drop, ...rest } = draft;
    addCrashMed(rest);
    navigate('/meds', { replace: true });
  };

  return (
    <MedForm
      med={draft}
      title="Add a medication"
      onBack={back}
      set={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      footer={(
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            onClick={back}
            style={{
              flex: 1, padding: '0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
              backgroundColor: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)', fontSize: '0.9375rem', fontWeight: 700,
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!named}
            className="app-btn-primary"
            style={{ flex: 2, opacity: named ? 1 : 0.5 }}
          >
            Save
          </button>
        </div>
      )}
      hint={named ? null : 'Give it a name and you can save.'}
    />
  );
}

// ── Editing ─────────────────────────────────────────────────────────────────

function EditMed({ id }) {
  const { crashMeds, updateCrashMed, deleteCrashMed, refillCrashMed } = useApp();
  const navigate = useNavigate();
  const back = useBack('/meds');
  const raw = crashMeds.find((m) => m.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refilling, setRefilling] = useState('');

  if (!raw) {
    return (
      <div className="app-page" style={pageStyle}>
        <ViewHeader title="Not found" onBack={back} />
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem' }}>
          That medication isn’t on your list any more.
        </p>
      </div>
    );
  }

  const med = normalizeMed(raw);

  return (
    <MedForm
      med={med}
      title={med.name || 'Untitled'}
      onBack={back}
      set={(patch) => updateCrashMed(med.id, patch)}
      refill={{
        value: refilling,
        onChange: setRefilling,
        onSubmit: () => { refillCrashMed(med.id, Number(refilling)); setRefilling(''); },
      }}
      footer={(
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={med.active !== false}
              onChange={(e) => updateCrashMed(med.id, { active: e.target.checked })}
              style={{ width: '1.125rem', height: '1.125rem', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
              Still taking this
            </span>
          </label>

          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => { deleteCrashMed(med.id); navigate('/meds', { replace: true }); }}
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
      )}
    />
  );
}

// ── The form itself ─────────────────────────────────────────────────────────

function MedForm({ med, title, onBack, set, footer, refill, hint }) {
  const { crashMeds } = useApp();
  const [advanced, setAdvanced] = useState(false);

  const setSchedule = (patch) => set({ schedule: { ...med.schedule, ...patch } });
  const setSupply = (patch) => set({ supply: { ...med.supply, ...patch } });
  const numberOrBlank = (v) => (v === '' ? null : Number(v));

  // A med can hang off any other med, but never off itself — that's a chain
  // with no beginning, and the resolver would just give up and say "unknown".
  const anchors = crashMeds.filter((m) => m.id !== med.id && m.active !== false);
  const status = supplyStatus(med, Date.now());

  const addRule = () => set({
    rules: [...(med.rules || []), { id: `r-${Date.now()}`, text: '', offsetMinutes: -60 }],
  });
  const setRule = (id, patch) => set({
    rules: med.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
  const removeRule = (id) => set({ rules: med.rules.filter((r) => r.id !== id) });

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title={title} onBack={onBack} />

      {/* ── What it is ── */}
      <div style={{ marginBottom: '1.75rem' }}>
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
          placeholder="Optional — 20 mg"
          className="app-input"
          style={{ width: '100%' }}
        />
      </div>

      {/* ── When ── */}
      <div style={{ marginBottom: '1.75rem' }}>
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
          How long past that before it counts as missed
        </label>
        <Segmented
          options={[0, 15, 45, 90].map((n) => ({ key: n, label: n === 0 ? 'Straight away' : `${n} min` }))}
          value={med.graceMinutes}
          onChange={(graceMinutes) => set({ graceMinutes })}
        />
      </div>

      {/* ── What's left ── */}
      <div style={{ marginBottom: '1.75rem' }}>
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

        {refill && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
            <input
              type="number" min="0" inputMode="numeric"
              value={refill.value}
              onChange={(e) => refill.onChange(e.target.value)}
              placeholder="Filled — how many?"
              className="app-input" style={{ flex: 1 }}
            />
            <button
              onClick={refill.onSubmit}
              disabled={refill.value === '' || Number.isNaN(Number(refill.value))}
              className="app-btn-primary"
              style={{ opacity: refill.value === '' ? 0.5 : 1, flexShrink: 0 }}
            >
              Refilled
            </button>
          </div>
        )}
      </div>

      {/* ── Advanced ── */}
      <button
        onClick={() => setAdvanced((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.875rem 0', background: 'none', border: 'none', cursor: 'pointer',
          borderTop: '1px solid var(--border)', textAlign: 'left',
        }}
      >
        {advanced ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} />
          : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}
        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
          Rules and crash timing
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
          {(med.rules || []).length ? `${med.rules.length} rule${med.rules.length > 1 ? 's' : ''}` : 'Optional'}
        </span>
      </button>

      {advanced && (
        <div style={{ paddingTop: '0.5rem' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>KIND</h2>
            <Segmented
              options={MED_KINDS}
              value={med.kind}
              onChange={(kind) => set({ kind })}
            />
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>MY RULES FOR THIS ONE</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              In your words. These show up when you go to log the dose, and buzz
              at the time you set.
            </p>

            <div style={{ display: 'grid', gap: '0.625rem' }}>
              {(med.rules || []).map((rule) => (
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

          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>WHAT IT DOES TO YOUR EVENING</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              Your own numbers, not anyone else’s. Once there’s enough history,
              <strong style={{ color: 'var(--text)' }}> History </strong>
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
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.625rem' }}>
              Until the grace above runs out, the app holds off on saying when
              your window starts — because taking this would move it.
            </p>
          </div>
        </div>
      )}

      {hint && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '1.25rem' }}>{hint}</p>
      )}

      {footer}
    </div>
  );
}
