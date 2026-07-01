import { useState, useEffect } from 'react';
import {
  Pin, PinOff, Pencil, Trash2, MoreVertical, NotebookPen,
  X, Bell, Link, LayoutDashboard, AlertCircle, Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import { timeAgo, isReminderOverdue, isReminderSoon, formatDate, formatTime12 } from '../utils/helpers';
import { notificationPermission, requestNotificationPermission } from '../utils/notifications';

function NoteForm({ initial = {}, onSave, onCancel, bills = [] }) {
  const [title, setTitle] = useState(initial.title || '');
  const [content, setContent] = useState(initial.content || '');
  const [reminderDate, setReminderDate] = useState(initial.reminderDate || '');
  const [reminderTime, setReminderTime] = useState(initial.reminderTime || '');
  const [linkedBillId, setLinkedBillId] = useState(initial.linkedBillId || '');
  const [permWarning, setPermWarning] = useState(false);

  useEffect(() => {
    if (!reminderDate) return;
    if (notificationPermission() === 'granted') { setPermWarning(false); return; }
    requestNotificationPermission().then((perm) => setPermWarning(perm !== 'granted'));
  }, [reminderDate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave({
      title: title.trim(),
      content: content.trim(),
      reminderDate: reminderDate || null,
      reminderTime: reminderDate ? (reminderTime || null) : null,
      linkedBillId: linkedBillId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Title <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input
          className="app-input"
          placeholder="e.g. Call insurance, Tax reminder..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="app-label">Note *</label>
        <textarea
          autoFocus
          rows={5}
          className="app-input"
          style={{ resize: 'none', lineHeight: '1.6' }}
          placeholder="Write anything — reminders, account numbers, goals..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="app-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <Bell size={13} /> Reminder <span style={{ color: 'var(--subtle)' }}>(optional)</span>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="date"
            className="app-input"
            value={reminderDate}
            onChange={(e) => setReminderDate(e.target.value)}
            style={{ flex: 1 }}
          />
          {reminderDate && (
            <input
              type="time"
              className="app-input"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              style={{ flex: 1 }}
            />
          )}
        </div>
        {reminderDate && !permWarning && (
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
            We'll push a notification {reminderTime ? `at ${formatTime12(reminderTime)}` : 'at the end of the day'} on {formatDate(reminderDate)}.
          </p>
        )}
        {permWarning && (
          <p style={{ fontSize: '0.75rem', color: 'var(--warn)', marginTop: '0.375rem' }}>
            Notifications are blocked — enable them in your browser settings to get this reminder pushed.
          </p>
        )}
      </div>
      {bills.length > 0 && (
        <div>
          <label className="app-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Link size={13} /> Link to bill <span style={{ color: 'var(--subtle)' }}>(optional)</span>
          </label>
          <select
            className="app-input"
            value={linkedBillId}
            onChange={(e) => setLinkedBillId(e.target.value)}
          >
            <option value="">— No linked bill —</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Note</button>
      </div>
    </form>
  );
}

function NoteCard({ note, onEdit, onDelete, onPin, onDashboardPin, linkedBillName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = note.content.length > 200;
  const displayContent = isLong && !expanded ? note.content.slice(0, 200) + '…' : note.content;

  const overdue = isReminderOverdue(note.reminderDate, note.reminderTime);
  const soon = !overdue && isReminderSoon(note.reminderDate, note.reminderTime);

  const borderColor = note.pinnedToDashboard
    ? 'var(--accent)'
    : note.pinned
    ? 'var(--border)'
    : overdue
    ? 'var(--danger)'
    : soon
    ? 'var(--warn)'
    : 'var(--border)';

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: `1px solid ${borderColor}`, borderRadius: '1rem', padding: '1rem' }}>
      {note.pinnedToDashboard && (
        <div style={{ position: 'absolute', top: '0.75rem', right: '2.5rem', color: 'var(--accent-text)' }}>
          <LayoutDashboard size={12} />
        </div>
      )}
      {note.pinned && !note.pinnedToDashboard && (
        <div style={{ position: 'absolute', top: '0.75rem', right: '2.5rem', color: 'var(--subtle)' }}>
          <Pin size={12} />
        </div>
      )}

      {note.reminderDate && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem',
          marginBottom: '0.5rem', padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
          backgroundColor: overdue ? 'rgba(239,68,68,0.1)' : soon ? 'rgba(245,158,11,0.1)' : 'var(--surface2)',
          color: overdue ? 'var(--danger)' : soon ? 'var(--warn)' : 'var(--muted)',
          border: `1px solid ${overdue ? 'var(--danger)' : soon ? 'var(--warn)' : 'var(--border)'}`,
        }}>
          {overdue ? <AlertCircle size={11} /> : <Bell size={11} />}
          <span>{overdue ? 'Overdue: ' : soon ? 'Soon: ' : ''}{formatDate(note.reminderDate)}{note.reminderTime ? ` at ${formatTime12(note.reminderTime)}` : ''}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {note.title && <p style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)', marginBottom: '0.375rem', lineHeight: 1.3 }}>{note.title}</p>}
          <p
            style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-words', cursor: isLong ? 'pointer' : 'default' }}
            onClick={() => isLong && setExpanded(!expanded)}
          >
            {displayContent}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(!expanded)} style={{ fontSize: '0.75rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0', marginTop: '0.25rem' }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ flexShrink: 0, padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
          <MoreVertical size={16} />
        </button>
      </div>

      {linkedBillName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.5rem' }}>
          <Link size={11} style={{ color: 'var(--subtle)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Linked to: <span style={{ color: 'var(--muted)' }}>{linkedBillName}</span></span>
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.5rem' }}>{timeAgo(note.updatedAt)}</p>

      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'absolute', right: '0.75rem', top: '2.5rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '10.5rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onDashboardPin(note.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <LayoutDashboard size={14} /> {note.pinnedToDashboard ? 'Remove from dashboard' : 'Pin to dashboard'}
            </button>
            <button onClick={() => { onPin(note.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              {note.pinned ? <PinOff size={14} /> : <Pin size={14} />} {note.pinned ? 'Unpin from top' : 'Pin to top'}
            </button>
            <button onClick={() => { onEdit(note); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { onDelete(note.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Notes() {
  const { notes, bills, addNote, updateNote, deleteNote, toggleNotePin, toggleNoteDashboardPin } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [search, setSearch] = useState('');

  const recurringBills = bills.filter((b) => b.isRecurring);

  const filtered = notes
    .filter((n) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return n.title?.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinnedToDashboard !== b.pinnedToDashboard) return a.pinnedToDashboard ? -1 : 1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.reminderDate && !b.reminderDate) return -1;
      if (!a.reminderDate && b.reminderDate) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

  const getBillName = (id) => {
    const bill = bills.find((b) => b.id === id);
    return bill?.name || null;
  };

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Notes</h1>
          <button onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
            <Plus size={16} /> Add Note
          </button>
        </div>

        {notes.length > 2 && (
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input
              className="app-input"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '0 1rem' }}>
        {filtered.length === 0 && notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <NotebookPen size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No notes yet</p>
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Add reminders, budget goals, and account details.</p>
            <button onClick={() => setShowAdd(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
              <Plus size={18} /> Add Note
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)', fontSize: '0.9375rem' }}>No notes match your search.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={setEditNote}
                onDelete={deleteNote}
                onPin={toggleNotePin}
                onDashboardPin={toggleNoteDashboardPin}
                linkedBillName={note.linkedBillId ? getBillName(note.linkedBillId) : null}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="New Note" onClose={() => setShowAdd(false)}>
          <NoteForm
            onSave={(data) => { addNote(data); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
            bills={recurringBills}
          />
        </Modal>
      )}
      {editNote && (
        <Modal title="Edit Note" onClose={() => setEditNote(null)}>
          <NoteForm
            initial={editNote}
            onSave={(data) => { updateNote(editNote.id, data); setEditNote(null); }}
            onCancel={() => setEditNote(null)}
            bills={recurringBills}
          />
        </Modal>
      )}
    </div>
  );
}
