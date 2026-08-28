import { useState } from 'react';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mergeKit, DEFAULT_WARNING_SIGNS } from './crashKit.js';
import { BRAKE_VARIANTS, buildBrakeMessage } from './message.js';

/**
 * The things you decide once, while you're fine, so none of them have to be
 * decided while you're not.
 */
export default function KitSetup({ onBack }) {
  const { crashKit, updateCrashKit, settings, notifPrefs, persistNotifPrefs } = useApp();
  const kit = mergeKit(crashKit);
  const [newSign, setNewSign] = useState('');

  const removeSign = (id) => {
    const isDefault = DEFAULT_WARNING_SIGNS.some((d) => d.id === id);
    updateCrashKit({
      removedSigns: isDefault ? [...(crashKit.removedSigns || []), id] : (crashKit.removedSigns || []),
      warningSigns: kit.warningSigns.filter((s) => s.id !== id),
    });
  };

  const addSign = () => {
    if (!newSign.trim()) return;
    updateCrashKit({
      warningSigns: [...kit.warningSigns, { id: `c-${Date.now()}`, text: newSign.trim() }],
    });
    setNewSign('');
  };

  const section = { marginBottom: '2rem' };
  const h2 = {
    fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
    color: 'var(--muted)', marginBottom: '0.75rem',
  };

  return (
    <div className="app-page" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={onBack} aria-label="Back" style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--surface2)', color: 'var(--muted)',
        }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          My kit
        </h1>
      </div>

      <div style={section}>
        <h2 style={h2}>THE BASICS</h2>
        <label className="app-label">His name</label>
        <input
          value={kit.partnerName}
          onChange={(e) => updateCrashKit({ partnerName: e.target.value })}
          placeholder={settings.spouseName || 'Optional'}
          className="app-input"
          style={{ width: '100%', marginBottom: '1rem' }}
        />

        <label className="app-label">How long the rule lasts</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[15, 20, 30, 45].map((m) => (
            <button
              key={m}
              onClick={() => updateCrashKit({ timerMinutes: m })}
              style={{
                flex: 1, padding: '0.875rem 0.5rem', borderRadius: '0.75rem', cursor: 'pointer',
                fontSize: '0.9375rem', fontWeight: 700,
                color: kit.timerMinutes === m ? '#fff' : 'var(--text)',
                backgroundColor: kit.timerMinutes === m ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${kit.timerMinutes === m ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>THE PHRASE</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
          Agree on this with him now, while nothing is happening. Then it means
          “I’m coming back,” not “I’m done.”
        </p>
        <textarea
          value={kit.brakePhrase}
          onChange={(e) => updateCrashKit({ brakePhrase: e.target.value })}
          rows={3}
          placeholder={buildBrakeMessage({}, kit.brakeVariantId, kit.partnerName)}
          className="app-input"
          style={{ width: '100%', resize: 'vertical', lineHeight: 1.5, marginBottom: '0.75rem' }}
        />
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {BRAKE_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => updateCrashKit({ brakeVariantId: v.id, brakePhrase: '' })}
              style={{
                padding: '0.4375rem 0.75rem', borderRadius: '9999px', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: 700,
                color: kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent-text)' : 'var(--muted)',
                backgroundColor: kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent-soft)' : 'var(--surface2)',
                border: `1px solid ${kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>MY YELLOW LIGHTS</h2>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {kit.warningSigns.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.8125rem 0.875rem', borderRadius: '0.75rem',
              backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.4 }}>{s.text}</span>
              <button
                onClick={() => removeSign(s.id)}
                aria-label="Remove"
                style={{ background: 'none', border: 'none', color: 'var(--subtle)', cursor: 'pointer', padding: 0 }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newSign}
            onChange={(e) => setNewSign(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSign(); }}
            placeholder="Add one in your own words"
            className="app-input"
            style={{ flex: 1 }}
          />
          <button onClick={addSign} aria-label="Add" style={{
            width: '2.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>WHEN THE TIME’S UP</h2>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer',
          padding: '1rem', borderRadius: '0.875rem',
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <input
            type="checkbox"
            checked={notifPrefs.crash?.timerEnd ?? true}
            onChange={(e) => persistNotifPrefs({
              ...notifPrefs,
              crash: { ...notifPrefs.crash, timerEnd: e.target.checked },
            })}
            style={{ width: '1.125rem', height: '1.125rem', accentColor: 'var(--accent)' }}
          />
          <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.4 }}>
            Buzz me when the timer runs out
            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
              Says only that the time is up — never what it was about.
            </span>
          </span>
        </label>
      </div>

      <p style={{
        fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.6,
        paddingTop: '1rem', borderTop: '1px solid var(--border)',
      }}>
        This is a tool you built for yourself, not treatment. If a night ever goes
        somewhere darker than a crash, that’s a person to call, not an app.
      </p>
    </div>
  );
}
