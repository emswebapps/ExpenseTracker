import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  ClipboardList, Plus, Ban, Loader2, WifiOff, CheckCircle2, Circle, ChevronDown, ChevronRight,
  CalendarClock, Trash2, Pencil, X,
} from 'lucide-react';
import { auth } from '../firebase';
import { subscribeListShare, submitListOp } from '../utils/firestoreSync';
import { generateId } from '../utils/helpers';
import { formatCalendarDate, formatDueBadge, localTodayISO } from '../utils/dueDates';
import { applyOps } from './lists/shareOps';
import { indexChildren, topLevelItems, isHeading, subtaskStats } from './lists/subtasks';
import { splitBySection, defaultSectionIndex } from './lists/sections';

/**
 * A shared list, opened by someone who doesn't have an account.
 *
 * Standalone by design: it renders from the mirror at `listShares/{token}` and
 * shares no state with the signed-in app. The owner's page can't be reused
 * here — it reads a Firestore document this visitor will never be allowed to
 * open, and it offers photos, reminders and repeats that a guest has no
 * business setting.
 *
 * Sign-in happens silently and anonymously. The visitor sees no account, no
 * password and no prompt; what it buys is an auth uid on every edit, so the
 * security rules can require one and each change can say who made it.
 *
 * Edits are optimistic. An op goes to Firestore and is applied to the local
 * copy at the same moment, so a ticked box ticks immediately rather than a
 * second later when the function has caught up. The overlay is dropped once
 * the mirror comes back carrying that change.
 */

const NAME_KEY = (token) => `bt_share_name_${token}`;

export default function SharedList() {
  const { token } = useParams();

  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [share, setShare] = useState(undefined); // undefined = loading, null = gone
  const [loadError, setLoadError] = useState(null);

  // Ops sent but not yet reflected in the mirror.
  const [overlay, setOverlay] = useState([]);
  const [sendError, setSendError] = useState(null);

  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY(token)) || '');
  const [askName, setAskName] = useState(!localStorage.getItem(NAME_KEY(token)));

  // ── Anonymous sign-in ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { setAuthReady(true); return; }
      signInAnonymously(auth).catch((err) => {
        // The most likely cause by far is Anonymous sign-in being switched off
        // in the Firebase console, so the message says what to do about it.
        setAuthError(
          err.code === 'auth/operation-not-allowed'
            ? 'This link needs anonymous sign-in enabled on the app before it will work. Ask whoever sent it to you.'
            : err.message || 'Could not open the link.',
        );
      });
    });
    return unsub;
  }, []);

  // ── The mirror ──
  useEffect(() => {
    if (!token) return;
    return subscribeListShare(
      token,
      (data) => { setShare(data); setLoadError(null); },
      (err) => setLoadError(err.message || 'Could not load the list.'),
    );
  }, [token]);

  // Drop overlay entries the mirror has caught up with.
  const appliedAt = share?.appliedAt || 0;
  useEffect(() => {
    if (!appliedAt) return;
    setOverlay((ops) => ops.filter((op) => op.at > appliedAt));
  }, [appliedAt]);

  const listId = share?.listId;
  const items = useMemo(
    () => applyOps((share?.items || []).map(({ hasPhotos, ...rest }) => rest), overlay, listId),
    [share?.items, overlay, listId],
  );

  const send = useCallback(async (op) => {
    const full = { ...op, by: name || 'Someone', uid: auth.currentUser?.uid || '', at: Date.now() };
    setOverlay((ops) => [...ops, full]);
    setSendError(null);
    try {
      await submitListOp(token, {
        type: full.type,
        itemId: full.itemId,
        ...(full.fields ? { fields: full.fields } : {}),
        by: full.by,
        uid: full.uid,
        at: full.at,
      });
    } catch (err) {
      // Roll the optimistic change back — showing a task that was refused is
      // worse than showing none, because the guest walks away thinking it's on
      // the list.
      setOverlay((ops) => ops.filter((o) => o !== full));
      setSendError(
        err.code === 'permission-denied'
          ? 'That change was refused — the link may have been paused.'
          : err.message || 'Could not save that change.',
      );
    }
  }, [name, token]);

  // ── States before there's a list to show ──
  if (authError || loadError) return <Notice icon={WifiOff} title="Can't open this list" body={authError || loadError} />;
  if (!authReady || share === undefined) return <Notice icon={Loader2} title="Opening the list…" spin />;
  if (share === null) {
    return (
      <Notice
        icon={Ban}
        title="This link doesn't work"
        body="It may have been deleted, or the address may be mistyped. Ask whoever sent it for a new one."
      />
    );
  }
  if (share.revoked) {
    return (
      <Notice
        icon={Ban}
        title="This link is paused"
        body={`"${share.list?.name || 'The list'}" isn't being shared at the moment. Ask whoever sent it to turn the link back on.`}
      />
    );
  }

  const list = share.list || {};

  return (
    <div style={{ minHeight: '100svh', backgroundColor: '#0b0b10', color: '#f0f0f2', paddingBottom: '4rem' }}>
      <header style={{ padding: '1.25rem 1rem 0.75rem', maxWidth: '32rem', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <ClipboardList size={16} style={{ color: '#a78bfa' }} />
          <h1 style={{ fontSize: '1.375rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{list.name || 'Shared list'}</h1>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#8b8b9a' }}>
          Shared with you{name ? ` — you're adding as ${name}` : ''}.{' '}
          <button
            onClick={() => setAskName(true)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#a78bfa', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {name ? 'Change name' : 'Add your name'}
          </button>
        </p>
      </header>

      {sendError && (
        <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.75rem', backgroundColor: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)' }}>
            <p style={{ fontSize: '0.8125rem', flex: 1 }}>{sendError}</p>
            <button onClick={() => setSendError(null)} style={{ background: 'none', border: 'none', color: '#8b8b9a', cursor: 'pointer', padding: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <GuestBoard list={list} items={items} onSend={send} />

      {askName && (
        <NamePrompt
          initial={name}
          onSave={(value) => {
            const clean = value.trim().slice(0, 60);
            setName(clean);
            if (clean) localStorage.setItem(NAME_KEY(token), clean);
            else localStorage.removeItem(NAME_KEY(token));
            setAskName(false);
          }}
          onSkip={() => setAskName(false)}
        />
      )}
    </div>
  );
}

/* ── The list itself ──────────────────────────────────────────────────────── */

function GuestBoard({ list, items, onSend }) {
  const childrenById = useMemo(() => indexChildren(items), [items]);
  const roots = useMemo(() => topLevelItems(items), [items]);
  const groups = useMemo(
    () => (list.sections?.length ? splitBySection(list, roots) : [{ section: null, items: roots }]),
    [list, roots],
  );

  // Opens on the section holding the nearest work, like the owner's app does.
  const [active, setActive] = useState(null);
  const landing = useMemo(() => defaultSectionIndex(groups), [groups]);
  const index = Math.min(active ?? landing, Math.max(0, groups.length - 1));
  const group = groups[index] || { section: null, items: [] };

  return (
    <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '0.5rem 1rem' }}>
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', padding: '0.5rem 0 0.75rem', scrollbarWidth: 'none' }}>
          {groups.map((g, i) => (
            <button
              key={g.section?.id ?? 'unfiled'}
              onClick={() => setActive(i)}
              style={{
                flexShrink: 0, minHeight: '2.5rem', padding: '0.375rem 0.875rem', borderRadius: '0.625rem',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${i === index ? '#6366f1' : '#2a2a38'}`,
                backgroundColor: i === index ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: i === index ? '#c7d2fe' : '#8b8b9a',
              }}
            >
              {g.section?.name || 'Unfiled'}
            </button>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: '#15151c', border: '1px solid #2a2a38', borderRadius: '1rem', overflow: 'hidden' }}>
        {group.items.length === 0 ? (
          <p style={{ padding: '2rem 1rem', textAlign: 'center', color: '#55556a', fontSize: '0.875rem' }}>
            Nothing here yet — add the first thing below.
          </p>
        ) : group.items.map((item) => (
          <GuestRow
            key={item.id}
            item={item}
            childItems={childrenById.get(item.id) || []}
            onSend={onSend}
            sectionId={group.section?.id ?? null}
          />
        ))}
      </div>

      <QuickAdd
        onAdd={(name) => onSend({
          type: 'add',
          itemId: generateId(),
          fields: { name, sectionId: group.section?.id ?? null },
        })}
      />
    </div>
  );
}

function GuestRow({ item, childItems, onSend, sectionId, depth = 0 }) {
  const heading = isHeading(item);
  const stats = subtaskStats(childItems);
  const [open, setOpen] = useState(() => childItems.some((c) => c.status !== 'done'));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const done = item.status === 'done';
  const due = !heading && item.dueDate ? formatDueBadge(item.dueDate, item.dueTime) : null;
  const calendarDate = heading ? formatCalendarDate(item.dueDate) : null;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        padding: `0.75rem 0.5rem 0.75rem ${1 + depth * 1.5}rem`,
        borderBottom: '1px solid #232330',
        backgroundColor: heading ? '#1a1a24' : 'transparent',
      }}>
        {/* A heading isn't work, so there's nothing to tick. */}
        {heading ? (
          <span style={{ width: '2.25rem', flexShrink: 0 }} />
        ) : (
          <button
            onClick={() => onSend({ type: 'toggle', itemId: item.id })}
            aria-label={done ? `Mark ${item.name} as not done` : `Complete ${item.name}`}
            style={{ flexShrink: 0, width: '2.75rem', height: '2.75rem', marginLeft: '-0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: done ? '#34d399' : '#3a3a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0, paddingTop: '0.375rem', opacity: done ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: heading ? '1rem' : '0.9375rem',
              fontWeight: heading ? 800 : 400,
              textDecoration: done ? 'line-through' : 'none',
            }}>
              {item.name}
            </span>
            {calendarDate && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8b9a' }}>{calendarDate}</span>}
            {due && !done && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: due.color }}>{due.label}</span>
            )}
            {stats.total > 0 && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#8b8b9a', border: '1px solid #2a2a38', borderRadius: '0.375rem', padding: '0.0625rem 0.375rem' }}>
                {stats.done}/{stats.total}
              </span>
            )}
            {item.addedBy && (
              <span style={{ fontSize: '0.6875rem', color: '#55556a' }}>added by {item.addedBy}</span>
            )}
          </div>
          {item.notes && <p style={{ fontSize: '0.8125rem', color: '#8b8b9a', marginTop: '0.125rem' }}>{item.notes}</p>}
        </div>

        <div style={{ display: 'flex', flexShrink: 0 }}>
          {depth === 0 && (
            <IconButton label={`Add under ${item.name}`} onClick={() => { setOpen(true); setAdding(true); }}>
              <Plus size={16} />
            </IconButton>
          )}
          {!heading && (
            <IconButton label={`Edit ${item.name}`} onClick={() => setEditing(true)}>
              <Pencil size={15} />
            </IconButton>
          )}
        </div>
      </div>

      {childItems.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem', width: '100%', minHeight: '2.5rem',
            padding: `0.25rem 1rem 0.5rem ${2.75 + depth * 1.5}rem`,
            background: 'none', border: 'none', borderBottom: '1px solid #232330',
            cursor: 'pointer', textAlign: 'left', fontSize: '0.8125rem', fontWeight: 600, color: '#a78bfa',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {open ? `Hide ${stats.total === 1 ? 'subtask' : 'subtasks'}` : `Show ${stats.total} ${stats.total === 1 ? 'subtask' : 'subtasks'}`}
        </button>
      )}

      {open && childItems.map((child) => (
        <GuestRow key={child.id} item={child} childItems={[]} onSend={onSend} sectionId={sectionId} depth={depth + 1} />
      ))}

      {open && adding && (
        <InlineAdd
          placeholder={`Add under ${item.name}`}
          indent={2.75 + depth * 1.5}
          onAdd={(name) => onSend({
            type: 'add',
            itemId: generateId(),
            fields: {
              name,
              parentId: item.id,
              sectionId: item.sectionId ?? sectionId,
              // Under a dated heading, a new task belongs to that day.
              ...(heading && item.dueDate ? { dueDate: item.dueDate } : {}),
            },
          })}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <EditRow
          item={item}
          onSave={(fields) => { onSend({ type: 'update', itemId: item.id, fields }); setEditing(false); }}
          onDelete={() => { onSend({ type: 'delete', itemId: item.id }); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function IconButton({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ width: '2.75rem', height: '2.75rem', background: 'none', border: 'none', color: '#55556a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  );
}

const GUEST_INPUT = {
  flex: 1, minWidth: 0, minHeight: '2.75rem', padding: '0.5rem 0.75rem',
  backgroundColor: '#0b0b10', border: '1px solid #2a2a38', borderRadius: '0.75rem',
  color: '#f0f0f2', fontSize: '0.9375rem',
};

function InlineAdd({ placeholder, indent, onAdd, onClose }) {
  const [value, setValue] = useState('');
  const commit = () => {
    const name = value.trim();
    if (!name) { onClose(); return; }
    onAdd(name);
    setValue(''); // stays open — a day usually gets more than one thing
  };
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: `0.5rem 1rem 0.75rem ${indent}rem`, borderBottom: '1px solid #232330' }}>
      <input
        style={GUEST_INPUT} autoFocus placeholder={placeholder} value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onClose(); }}
      />
      <button
        onClick={onClose}
        style={{ flexShrink: 0, padding: '0 0.875rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid #2a2a38', backgroundColor: 'transparent', color: '#8b8b9a', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
      >
        Done
      </button>
    </div>
  );
}

function QuickAdd({ onAdd }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const commit = () => {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue('');
    inputRef.current?.focus();
  };
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
      <input
        ref={inputRef} style={GUEST_INPUT} placeholder="Add something to the list"
        value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button
        onClick={commit} disabled={!value.trim()}
        style={{ flexShrink: 0, padding: '0 1rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: 'none', backgroundColor: value.trim() ? '#6366f1' : '#1a1a24', color: value.trim() ? '#fff' : '#55556a', fontWeight: 700, fontSize: '0.875rem', cursor: value.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
      >
        <Plus size={16} /> Add
      </button>
    </div>
  );
}

/** Rename, re-date or remove one task. Deliberately the whole guest toolkit. */
function EditRow({ item, onSave, onDelete, onClose }) {
  const [name, setName] = useState(item.name || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [date, setDate] = useState(item.dueDate || '');
  const [time, setTime] = useState(item.dueTime || '');

  return (
    <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #232330', backgroundColor: '#12121a', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <input style={GUEST_INPUT} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Task" />
      <input style={GUEST_INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input style={GUEST_INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input style={GUEST_INPUT} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <p style={{ fontSize: '0.75rem', color: '#55556a', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <CalendarClock size={11} /> A time on its own means today. Reminders are set by whoever owns the list.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onDelete}
          style={{ flexShrink: 0, width: '2.75rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid rgba(244,63,94,0.5)', backgroundColor: 'transparent', color: '#f43f5e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={onClose}
          style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid #2a2a38', backgroundColor: 'transparent', color: '#8b8b9a', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim()) return;
            onSave({
              name: name.trim(),
              notes: notes.trim() || null,
              dueDate: date || (time ? localTodayISO() : null),
              dueTime: date || time ? (time || null) : null,
            });
          }}
          style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function NamePrompt({ initial, onSave, onSkip }) {
  const [value, setValue] = useState(initial || '');
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '28rem', backgroundColor: '#15151c', border: '1px solid #2a2a38', borderRadius: '1.25rem 1.25rem 0 0', padding: '1.5rem 1.25rem 2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '0.375rem' }}>What should we call you?</h2>
        <p style={{ fontSize: '0.8125rem', color: '#8b8b9a', marginBottom: '1rem', lineHeight: 1.5 }}>
          Whatever you add to the list will say who added it. Optional — leave it
          blank and your changes just say &quot;Someone&quot;.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(value); }}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <input style={GUEST_INPUT} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your name" autoFocus maxLength={60} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button" onClick={onSkip}
              style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid #2a2a38', backgroundColor: 'transparent', color: '#8b8b9a', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Skip
            </button>
            <button
              type="submit"
              style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Notice({ icon: Icon, title, body, spin }) {
  return (
    <div style={{ minHeight: '100svh', backgroundColor: '#0b0b10', color: '#f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '22rem', textAlign: 'center' }}>
        <Icon
          size={40}
          style={{
            margin: '0 auto 1rem', display: 'block', color: '#55556a',
            animation: spin ? 'spin 1s linear infinite' : undefined,
          }}
        />
        <p style={{ fontSize: '1.0625rem', fontWeight: 800, marginBottom: '0.5rem' }}>{title}</p>
        {body && <p style={{ fontSize: '0.9375rem', color: '#8b8b9a', lineHeight: 1.5 }}>{body}</p>}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  );
}
