import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { summarize, historySentence } from './stats.js';
import { formatClock } from './protocol.js';

const OUTCOME_LABEL = {
  'let-it-go': 'It settled',
  'still-matters': 'Still mattered',
  talked: 'We talked',
};

/**
 * The argument for the 30 minutes, made with the user's own data — which is the
 * only form of it that's believable at 9pm.
 *
 * Hidden entirely until there are three sessions to draw on: a thin number here
 * reads as discouraging, and showing nothing is better than showing "1 of 2".
 */
export default function HistoryView({ onBack }) {
  const { crashSessions, crashDrafts } = useApp();
  const finished = crashSessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  const summary = summarize(crashSessions, crashDrafts);
  const sentence = finished.length >= 3 ? historySentence(summary) : null;

  return (
    <div className="app-page" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', marginBottom: '1.25rem' }}>
        <button onClick={onBack} aria-label="Back" style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--surface2)', color: 'var(--muted)',
        }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          What usually happens
        </h1>
      </div>

      {sentence ? (
        <div style={{
          padding: '1.25rem', borderRadius: '1rem', marginBottom: '1.75rem',
          backgroundColor: 'var(--accent-soft)', border: '1px solid var(--accent)',
        }}>
          <p style={{ fontSize: '1.0625rem', color: 'var(--accent-text)', lineHeight: 1.55, fontWeight: 600 }}>
            {sentence}
          </p>
        </div>
      ) : (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.55, marginBottom: '1.75rem' }}>
          {finished.length === 0
            ? 'Once you’ve been through this a few times, this page will tell you what actually tends to happen.'
            : 'A couple more times through and there’ll be enough here to be worth reading.'}
        </p>
      )}

      {finished.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {finished.map((s) => (
            <div key={s.id} className="app-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                  {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{formatClock(s.startedAt)}</span>
                {s.intensity != null && s.intensityAfter != null && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.875rem', fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: s.intensityAfter < s.intensity ? 'var(--positive-text)' : 'var(--muted)',
                  }}>
                    {s.intensity} → {s.intensityAfter}
                  </span>
                )}
              </div>

              {s.outcome && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.375rem' }}>
                  {OUTCOME_LABEL[s.outcome] || s.outcome}
                </p>
              )}

              {/* The most useful artifact in the whole feature: reading your own
                  story column back at 3pm, when it reads very differently. */}
              {(s.stories || []).length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.375rem' }}>
                    WHAT YOUR BRAIN WAS TELLING YOU
                  </p>
                  {s.stories.map((st) => (
                    <p key={st.id} style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {st.text}
                    </p>
                  ))}
                </div>
              )}

              {s.outcomeNote && (
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.625rem', fontStyle: 'italic' }}>
                  {s.outcomeNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
