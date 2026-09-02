import { useEffect, useState } from 'react';
import { Copy, Check, Link2, Ban, Play, Trash2, Users, AlertTriangle } from 'lucide-react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { loadListShare } from '../../utils/firestoreSync';

/**
 * Handing a list to someone else.
 *
 * The link *is* the permission — anyone holding it can add to the list and tick
 * things off, without an account, the same bargain as a document shared by
 * link. That's the whole point (the person this is for shouldn't have to sign
 * up to add to a shopping list), and it's the thing to be honest about on this
 * screen rather than bury: hence the plain sentence about who can edit, and
 * Pause sitting right next to Copy.
 *
 * What a guest *can't* do is deliberately narrow: no photos, no reminders, no
 * repeats, no touching the day headings or the list's settings. Those stay with
 * the owner, so a leaked link is a nuisance rather than a disaster.
 */
export function ShareListModal({ list, onClose, onShare, onRevoke, onDelete }) {
  const token = list.share?.token;
  const revoked = !!list.share?.revoked;
  const url = token ? `${window.location.origin}/ExpenseTracker/list/${token}` : '';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activity, setActivity] = useState(null);

  // Who has done what, straight off the share document. Read once on open
  // rather than subscribed: this is a "what happened" panel, and the list
  // itself is already live.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    loadListShare(token)
      .then((share) => { if (alive) setActivity(share?.activity || []); })
      .catch(() => { if (alive) setActivity([]); });
    return () => { alive = false; };
  }, [token]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (result && result.ok === false) setError(result.error || 'Something went wrong');
    return result;
  };

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setError('Could not copy — press and hold the link to copy it by hand.'));
  };

  const share = async () => {
    // The OS share sheet is how a link actually gets to someone on a phone.
    if (navigator.share) {
      try {
        await navigator.share({ title: list.name, text: `Add to "${list.name}"`, url });
        return;
      } catch {
        // Cancelled, or unavailable — fall back to the clipboard.
      }
    }
    copy();
  };

  return (
    <Modal title={`Share "${list.name}"`} onClose={onClose}>
      {!token ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.5 }}>
            Create a link to this list. Whoever you send it to can open it in a
            browser — no account, no app — and add tasks, tick them off, and
            change dates.
          </p>
          <ul style={{ fontSize: '0.8125rem', color: 'var(--muted)', lineHeight: 1.6, paddingLeft: '1.1rem', margin: 0 }}>
            <li>Their changes land on this list, and yours show up for them.</li>
            <li>They can&apos;t set reminders, add photos, or change the list&apos;s settings.</li>
            <li>Anyone with the link can edit, so send it to people you mean to.</li>
            <li>You can pause or delete the link at any time.</li>
          </ul>
          <button
            onClick={() => run(() => onShare(list.id))}
            disabled={busy}
            className="app-btn-primary"
          >
            <Link2 size={16} /> {busy ? 'Creating…' : 'Create the link'}
          </button>
          {error && <ErrorNote text={error} />}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {revoked && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.75rem', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <Ban size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.1rem' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.5 }}>
                This link is paused. Nobody can open it or add to the list until
                you resume it — the same link will work again.
              </p>
            </div>
          )}

          <div>
            <label className="app-label">Link</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="app-input" readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: '0.75rem' }} />
              <button
                onClick={copy}
                aria-label="Copy the link"
                style={{ flexShrink: 0, width: '2.75rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: copied ? 'var(--positive)' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
              Anyone with this link can add to the list and tick things off.
            </p>
          </div>

          <button onClick={share} className="app-btn-primary" disabled={revoked}>
            <Users size={16} /> Send the link
          </button>

          {activity && activity.length > 0 && (
            <div>
              <label className="app-label">Recent changes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {activity.slice(0, 8).map((entry, index) => (
                  <p key={`${entry.at}-${index}`} style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
                    {entry.line}
                    <span style={{ color: 'var(--subtle)' }}>
                      {' · '}{new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {activity && activity.length === 0 && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>
              Nobody has changed anything through the link yet.
            </p>
          )}

          {error && <ErrorNote text={error} />}

          <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button
              onClick={() => run(() => onRevoke(list.id, !revoked))}
              disabled={busy}
              className="app-btn-secondary"
              style={{ flex: 1 }}
            >
              {revoked ? <><Play size={15} /> Resume</> : <><Ban size={15} /> Pause</>}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid var(--danger)', backgroundColor: 'transparent', color: 'var(--danger)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
            >
              <Trash2 size={15} /> Delete link
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete the link?"
          message={`The link stops working for good and the record of who changed what is deleted with it. "${list.name}" and everything on it stays here. You can share it again later, but the new link will be a different one.`}
          confirmLabel="Delete link"
          onConfirm={async () => {
            setConfirmDelete(false);
            const result = await run(() => onDelete(list.id));
            if (result?.ok !== false) onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}

function ErrorNote({ text }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.625rem 0.75rem', borderRadius: '0.75rem', backgroundColor: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.35)' }}>
      <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '0.1rem' }} />
      <p style={{ fontSize: '0.8125rem', color: 'var(--text)' }}>{text}</p>
    </div>
  );
}
