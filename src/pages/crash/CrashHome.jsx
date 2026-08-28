import { Feather, Images, TrendingDown, Settings2, Inbox } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCountdown } from './useCountdown.js';
import { timerRemaining, formatRemaining, isReleased } from './protocol.js';
import DoseRow from './DoseRow.jsx';

function QuietRow({ Icon, label, detail, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer', textAlign: 'left',
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
      }}
    >
      <Icon size={19} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      {detail != null && (
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--subtle)' }}>{detail}</span>
      )}
    </button>
  );
}

export default function CrashHome({ active, onStart, onResume, onPark, onGo }) {
  const { crashDrafts, crashAnchors, crashSessions } = useApp();
  const now = useCountdown(active?.timerEndsAt);

  const held = crashDrafts.filter((d) => d.status === 'held');
  const ready = held.filter((d) => isReleased(d, now));
  const done = crashSessions.filter((s) => s.endedAt).length;

  return (
    <div className="app-page" style={{ padding: '1.25rem' }}>
      <div style={{ paddingTop: '1.5rem', paddingBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Crash
        </h1>
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', marginTop: '0.375rem', lineHeight: 1.45 }}>
          Nothing in here is shared with anyone.
        </p>
      </div>

      <DoseRow />

      {active ? (
        <button
          onClick={onResume}
          style={{
            width: '100%', minHeight: '8.75rem', borderRadius: '1.25rem', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.375rem', padding: '1.5rem',
          }}
        >
          <span style={{ fontSize: '1.375rem', fontWeight: 800 }}>Pick it back up</span>
          <span style={{ fontSize: '1rem', opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
            {timerRemaining(active, now) > 0
              ? `${formatRemaining(timerRemaining(active, now))} left`
              : 'The 30 minutes are up'}
          </span>
        </button>
      ) : (
        <button
          onClick={onStart}
          style={{
            width: '100%', minHeight: '8.75rem', borderRadius: '1.25rem', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
            fontSize: '1.625rem', fontWeight: 800, letterSpacing: '-0.01em', padding: '1.5rem',
          }}
        >
          I’m crashing
        </button>
      )}

      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1.25rem' }}>
        <QuietRow Icon={Feather} label="Just get the thought out" onClick={onPark} />
        <QuietRow Icon={Images} label="Read my anchors" detail={crashAnchors.length || null} onClick={() => onGo('anchors')} />
        <QuietRow
          Icon={Inbox}
          label="Held until tomorrow"
          detail={held.length ? `${held.length}${ready.length ? ` · ${ready.length} ready` : ''}` : null}
          onClick={() => onGo('drafts')}
        />
        <QuietRow Icon={TrendingDown} label="What usually happens" detail={done || null} onClick={() => onGo('history')} />
        <QuietRow Icon={Settings2} label="Set up my kit" onClick={() => onGo('setup')} />
      </div>
    </div>
  );
}
