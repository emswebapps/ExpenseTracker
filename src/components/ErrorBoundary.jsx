import { Component } from 'react';

// Without this, any error thrown while rendering unmounts the whole tree and
// leaves a blank screen with nothing to tap — on a phone, with no console,
// that is indistinguishable from "the app won't load". This shows what broke
// and offers a reload instead.
//
// A failed lazy import (a page chunk that a new deploy replaced while this one
// was open) gets one automatic reload, since a fresh load fetches the new
// chunk names and is almost always the fix.
const RELOADED_KEY = 'bt_chunk_reload';

function isChunkLoadError(error) {
  const msg = String(error?.message || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(msg);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, '1');
          window.location.reload();
        }
      } catch { /* No sessionStorage: fall through to the reload button. */ }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{
        minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--bg, #0f172a)', padding: '1.5rem',
      }}>
        <div style={{ maxWidth: '22rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.125rem', fontWeight: '800', color: 'var(--text, #f8fafc)' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted, #94a3b8)', marginTop: '0.5rem', wordBreak: 'break-word' }}>
            {String(error?.message || error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.25rem', padding: '0.625rem 1.25rem', borderRadius: '0.75rem', border: 'none',
              backgroundColor: 'var(--accent, #6366f1)', color: '#fff', fontWeight: '700', fontSize: '0.9375rem',
            }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
