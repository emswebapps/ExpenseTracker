import { useState, useEffect } from 'react';
import { NotebookPen, X, Check } from 'lucide-react';

export default function BillStickyNote({ mk, monthLabel, note, onChange }) {
  const hasText = !!note?.text?.trim();
  const isActive = hasText && !note?.resolved;
  const [open, setOpen] = useState(isActive);

  // Reset panel visibility when the selected month changes
  useEffect(() => {
    setOpen(hasText && !note?.resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mk]);

  const toggle = () => {
    if (!open && note?.resolved) onChange({ resolved: false });
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Bill note"
        style={{
          position: 'fixed', right: 0, top: '38%', zIndex: 55,
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          padding: '0.625rem 0.625rem 0.625rem 0.75rem',
          backgroundColor: isActive ? '#facc15' : 'var(--surface)',
          color: isActive ? '#422006' : 'var(--muted)',
          border: '1px solid var(--border)', borderRight: 'none',
          borderRadius: '0.75rem 0 0 0.75rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          cursor: 'pointer',
        }}
      >
        <NotebookPen size={16} />
        {isActive && (
          <span style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', backgroundColor: '#b45309' }} />
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 54 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed', right: '0.75rem', top: 'calc(38% - 1rem)', zIndex: 55,
              width: 'min(80vw, 15rem)',
              backgroundColor: '#fde68a', color: '#422006',
              borderRadius: '0.25rem',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              padding: '0.875rem',
              transform: 'rotate(-1deg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>
                {monthLabel} Note
              </span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#422006', cursor: 'pointer', padding: '0.125rem' }}>
                <X size={14} />
              </button>
            </div>
            <textarea
              autoFocus
              rows={5}
              value={note?.text || ''}
              onChange={(e) => onChange({ text: e.target.value, resolved: false })}
              placeholder="Jot a reminder for this month's bills…"
              style={{
                width: '100%', resize: 'none', border: 'none', outline: 'none',
                backgroundColor: 'transparent', color: '#422006', fontSize: '0.875rem',
                lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => { onChange({ resolved: true }); setOpen(false); }}
              disabled={!hasText}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '0.5rem',
                border: '1px solid rgba(66,32,6,0.3)', backgroundColor: 'rgba(66,32,6,0.08)',
                color: '#422006', fontWeight: 700, fontSize: '0.8125rem',
                cursor: hasText ? 'pointer' : 'not-allowed', opacity: hasText ? 1 : 0.5,
              }}
            >
              <Check size={13} /> Resolve
            </button>
          </div>
        </>
      )}
    </>
  );
}
