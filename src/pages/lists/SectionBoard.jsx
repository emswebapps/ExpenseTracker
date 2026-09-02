import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2, Inbox } from 'lucide-react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { MENU_BTN } from './listMeta';
import { isHeading } from './subtasks';
import TaskRow from './TaskRow';

/**
 * A list's sections, either stacked down the page or as columns you swipe
 * between — the layout the weekly planner is built for, one column per week.
 *
 * Columns are a scroll-snapping flex row rather than a carousel library: the
 * gesture people already use for this is a horizontal swipe, and the browser
 * does that natively with momentum, edge resistance and accessibility intact.
 * Which column you're on is read back off `scrollLeft` for the pager dots and
 * so quick-add knows which week it's adding to.
 *
 * Sections don't change what a task *is*, so every row is the same `TaskRow`
 * used everywhere else, subtasks and all.
 */

function SectionMenu({ section, onRename, onDelete, onAddTask, onClose }) {
  return (
    <Modal title={section ? section.name : 'Unfiled'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', margin: '-0.5rem 0' }}>
        <button style={MENU_BTN} onClick={() => { onClose(); onAddTask(); }}>
          <Plus size={16} /> Add a task here
        </button>
        {section && (
          <button style={MENU_BTN} onClick={() => { onClose(); onRename(); }}>
            <Pencil size={16} /> Rename section
          </button>
        )}
        {section && (
          <button style={{ ...MENU_BTN, color: 'var(--danger)' }} onClick={() => { onClose(); onDelete(); }}>
            <Trash2 size={16} /> Delete section
          </button>
        )}
      </div>
    </Modal>
  );
}

function RenameSection({ section, onSave, onCancel }) {
  const [name, setName] = useState(section.name);
  return (
    <Modal title="Rename section" onClose={onCancel}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** The title bar above a column or a stacked section. */
function SectionHeader({ section, count, done, onMenu }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.625rem 0.25rem 0.625rem 0.75rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {!section && <Inbox size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
      <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text)', flex: 1, minWidth: 0 }}>
        {section ? section.name : 'Unfiled'}
      </span>
      {count > 0 && (
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--subtle)', flexShrink: 0 }}>
          {done}/{count}
        </span>
      )}
      <button
        onClick={onMenu}
        aria-label={`Options for ${section ? section.name : 'unfiled tasks'}`}
        style={{
          flexShrink: 0, width: '2.75rem', height: '2.75rem', color: 'var(--muted)',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}

export default function SectionBoard({
  groups, childrenById, columns, activeIndex, onActiveIndexChange,
  rowProps, onAddSubtask, onRenameSection, onDeleteSection, onAddTaskTo,
}) {
  const scroller = useRef(null);
  const [menuFor, setMenuFor] = useState(null);   // index into `groups`
  const [renaming, setRenaming] = useState(null); // section object
  const [deleting, setDeleting] = useState(null); // section object
  // Whether the initial scroll to the live week has already happened. Doing it
  // on every render would fight anyone swiping.
  const landed = useRef(false);
  // The last index this board put itself on, either by scrolling or by
  // reporting a swipe. Anything else means the change came from outside — the
  // card jumping to the week a task was just filed into — and has to be
  // scrolled to, since setting the index alone only moves the pager dots.
  const settledIndex = useRef(activeIndex);

  // Positions come off the columns themselves rather than from
  // `index * clientWidth`. The two agree right up until they don't — a
  // scrollbar appearing, a card resizing — and then the view sits half way
  // between two weeks. `offsetLeft` is whatever the layout actually did.
  const columnAt = (index) => scroller.current?.children?.[index] ?? null;

  useEffect(() => {
    const el = scroller.current;
    if (!columns || !el || landed.current || groups.length === 0) return;
    landed.current = true;
    if (activeIndex <= 0) return;
    // After layout, so the target column's offset is real.
    const id = requestAnimationFrame(() => {
      const target = columnAt(activeIndex);
      if (target) el.scrollLeft = target.offsetLeft - el.offsetLeft;
    });
    return () => cancelAnimationFrame(id);
  }, [columns, activeIndex, groups.length]);

  const handleScroll = () => {
    const el = scroller.current;
    if (!el) return;
    let nearest = 0;
    let bestGap = Infinity;
    for (let i = 0; i < el.children.length; i += 1) {
      const gap = Math.abs((el.children[i].offsetLeft - el.offsetLeft) - el.scrollLeft);
      if (gap < bestGap) { bestGap = gap; nearest = i; }
    }
    settledIndex.current = nearest;
    if (nearest !== activeIndex) onActiveIndexChange(nearest);
  };

  const goTo = (index) => {
    const el = scroller.current;
    const target = columnAt(index);
    if (!el || !target) return;
    settledIndex.current = index;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    onActiveIndexChange(index);
  };

  // Follow an index set from outside this component.
  useEffect(() => {
    if (!columns || activeIndex === settledIndex.current) return;
    const el = scroller.current;
    const target = columnAt(activeIndex);
    if (!el || !target) return;
    settledIndex.current = activeIndex;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, [columns, activeIndex, groups.length]);

  const rowsFor = (items) => items.map((item) => (
    <TaskRow
      key={item.id}
      item={item}
      childItems={childrenById.get(item.id) || []}
      onAddSubtask={onAddSubtask}
      {...rowProps}
    />
  ));

  const body = (group, index) => {
    // The count is the *work* in this column — its day headings are labels, and
    // the tasks under them are the point, so a week reads "2/5 done" rather
    // than "0/7" for seven untouched day rows.
    const work = group.items
      .flatMap((i) => [i, ...(childrenById.get(i.id) || [])])
      .filter((i) => !isHeading(i));
    const count = work.length;
    const done = work.filter((i) => i.status === 'done').length;
    return (
      <>
        <SectionHeader section={group.section} count={count} done={done} onMenu={() => setMenuFor(index)} />
        {group.items.length === 0 ? (
          <p style={{ padding: '1.25rem 0.75rem', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.8125rem' }}>
            Nothing here yet.
          </p>
        ) : rowsFor(group.items)}
      </>
    );
  };

  const menus = (
    <>
      {menuFor != null && groups[menuFor] && (
        <SectionMenu
          section={groups[menuFor].section}
          onClose={() => setMenuFor(null)}
          onRename={() => setRenaming(groups[menuFor].section)}
          onDelete={() => setDeleting(groups[menuFor].section)}
          onAddTask={() => onAddTaskTo(groups[menuFor].section?.id ?? null)}
        />
      )}
      {renaming && (
        <RenameSection
          section={renaming}
          onCancel={() => setRenaming(null)}
          onSave={(name) => { onRenameSection(renaming.id, name); setRenaming(null); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete section?"
          message={`"${deleting.name}" will be removed. The tasks in it aren't deleted — they move to Unfiled, where you can re-file or delete them.`}
          confirmLabel="Delete section"
          onConfirm={() => { onDeleteSection(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );

  if (!columns) {
    return (
      <>
        {groups.map((group, index) => (
          <div key={group.section?.id ?? 'unfiled'} style={{ borderTop: index > 0 ? '1px solid var(--border)' : 'none' }}>
            {body(group, index)}
          </div>
        ))}
        {menus}
      </>
    );
  }

  return (
    <>
      <div
        ref={scroller}
        onScroll={handleScroll}
        style={{
          display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          // Each column keeps its own height — stretched to the tallest, a week
          // with one task shows a screen of empty space under it.
          alignItems: 'flex-start',
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          // The columns are the width of the scroller, so `scrollLeft` divided
          // by `clientWidth` is the column index — no measuring required.
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {groups.map((group, index) => (
          <div
            key={group.section?.id ?? 'unfiled'}
            style={{
              flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'start',
              borderRight: index < groups.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {body(group, index)}
          </div>
        ))}
      </div>

      {groups.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.375rem', padding: '0.625rem' }}>
          {groups.map((group, index) => (
            <button
              key={group.section?.id ?? 'unfiled'}
              onClick={() => goTo(index)}
              aria-label={`Go to ${group.section?.name || 'unfiled'}`}
              aria-current={index === activeIndex}
              style={{
                width: index === activeIndex ? '1.25rem' : '0.5rem', height: '0.5rem',
                padding: 0, borderRadius: '9999px', border: 'none', cursor: 'pointer',
                backgroundColor: index === activeIndex ? 'var(--accent)' : 'var(--border2)',
                transition: 'width 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
      {menus}
    </>
  );
}
