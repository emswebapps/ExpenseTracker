import { useCallback, useEffect, useRef, useState } from 'react';

// ── useSwipeRow ───────────────────────────────────────────────────────────────
// Horizontal swipe on a task row, built on pointer events. There's no gesture
// library in this app and this is the only place that needs one, so it stays a
// hook rather than a dependency.
//
// Two gestures, deliberately asymmetric:
//
//   swipe right  — commits immediately on release. Completing a task is cheap
//                  and reversible, so making it a one-motion gesture is the
//                  whole point.
//   swipe left   — latches a drawer open instead of committing. Delete is not
//                  reversible, so it always costs a second, deliberate tap.
//
// Vertical scrolling is left to the browser: the row sets `touch-action: pan-y`
// (see SWIPE_ROW_STYLE), so a vertical drag never reaches us as a move — it
// arrives as a pointercancel once the browser claims the gesture. That's more
// reliable than trying to out-guess the scroller in JS.

/** How far the left drawer opens, in px. Sized to hold one 44px action. */
export const DRAWER_WIDTH = 88;

/** Past this much rightward travel, releasing completes the task. */
const COMMIT_DISTANCE = 96;

/** Movement before we decide the gesture is a drag rather than a tap. */
const DRAG_SLOP = 8;

/** Fraction of the drawer you must pass for it to latch open on release. */
const LATCH_RATIO = 0.55;

/** Resistance applied past the natural stop, so the row feels tethered. */
const RUBBER = 0.35;

/**
 * Only one row may sit open at a time — a screen of half-open drawers is noise,
 * and it makes "which row am I about to delete?" ambiguous. Module-level rather
 * than a prop, because rows render under two different parents (TaskListCard
 * and TodayView) and neither should have to own this.
 */
let closeOpenRow = null;

function claimOpen(close) {
  if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
  closeOpenRow = close;
}

function releaseOpen(close) {
  if (closeOpenRow === close) closeOpenRow = null;
}

/** Styles the swiping element must carry for the gesture to behave. */
export const SWIPE_ROW_STYLE = {
  touchAction: 'pan-y',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
};

/**
 * @param {object}   opts
 * @param {Function} opts.onComplete  fired when a right-swipe commits
 * @param {boolean}  [opts.enabled]   false disables the gesture entirely
 * @returns {{
 *   dx: number,          // current horizontal offset to translate the row by
 *   open: boolean,       // is the delete drawer latched open?
 *   dragging: boolean,   // mid-gesture — suppress transitions while true
 *   close: Function,     // close the drawer
 *   handlers: object,    // spread onto the swiping element
 * }}
 */
export function useSwipeRow({ onComplete, enabled = true } = {}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Everything the in-flight gesture needs. A ref, not state: these change on
  // every pointermove and none of them should cost a render.
  const g = useRef({ id: null, startX: 0, startY: 0, baseDx: 0, axis: null, moved: false });

  // The offset, mirrored outside React. Release has to *read* the current
  // offset and then act on it — completing a task, latching the drawer — and
  // doing that inside a setState updater would run those effects twice under
  // StrictMode, which for a toggle means completing and instantly
  // un-completing. The ref keeps the decision out of the updater entirely.
  const dxRef = useRef(0);
  const applyDx = useCallback((v) => { dxRef.current = v; setDx(v); }, []);

  const close = useCallback(() => {
    setOpen(false);
    applyDx(0);
    releaseOpen(close);
  }, [applyDx]);

  // A row that unmounts while open — deleted, completed, filtered away — must
  // not leave the registry pointing at a dead setState.
  useEffect(() => () => releaseOpen(close), [close]);

  const endGesture = useCallback((commit) => {
    const { axis } = g.current;
    g.current.axis = null;
    g.current.id = null;
    setDragging(false);
    if (axis !== 'x') return;

    if (!commit) { applyDx(open ? -DRAWER_WIDTH : 0); return; }

    const current = dxRef.current;
    if (current >= COMMIT_DISTANCE) {
      // Snap back first: completing re-sorts the list, and a row that slid
      // away and then reappeared mid-flight reads as a glitch.
      applyDx(0);
      setOpen(false);
      releaseOpen(close);
      onComplete?.();
      return;
    }
    if (current <= -DRAWER_WIDTH * LATCH_RATIO) {
      applyDx(-DRAWER_WIDTH);
      setOpen(true);
      claimOpen(close);
      return;
    }
    applyDx(0);
    setOpen(false);
    releaseOpen(close);
  }, [onComplete, open, close, applyDx]);

  const onPointerDown = useCallback((e) => {
    if (!enabled || e.pointerType === 'mouse' && e.button !== 0) return;
    g.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      // Where the row actually is, not where it should be — grabbing it
      // mid-snap must not make it jump.
      baseDx: dxRef.current,
      axis: null,
      moved: false,
    };
  }, [enabled]);

  const onPointerMove = useCallback((e) => {
    const s = g.current;
    if (s.id !== e.pointerId) return;

    const deltaX = e.clientX - s.startX;
    const deltaY = e.clientY - s.startY;

    if (s.axis === null) {
      // Undecided. A clearly vertical drag hands the gesture back to the page;
      // `touch-action: pan-y` means the browser is already scrolling by now.
      if (Math.abs(deltaY) > DRAG_SLOP && Math.abs(deltaY) > Math.abs(deltaX)) {
        s.axis = 'y';
        return;
      }
      if (Math.abs(deltaX) <= DRAG_SLOP || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      s.axis = 'x';
      s.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (s.axis !== 'x') return;

    // Past each natural stop the row keeps moving, but grudgingly.
    const raw = s.baseDx + deltaX;
    let next = raw;
    if (raw < -DRAWER_WIDTH) next = -DRAWER_WIDTH + (raw + DRAWER_WIDTH) * RUBBER;
    else if (raw > COMMIT_DISTANCE) next = COMMIT_DISTANCE + (raw - COMMIT_DISTANCE) * RUBBER;
    applyDx(next);
  }, [applyDx]);

  const onPointerUp = useCallback((e) => {
    if (g.current.id !== e.pointerId) return;
    endGesture(true);
  }, [endGesture]);

  const onPointerCancel = useCallback((e) => {
    if (g.current.id !== e.pointerId) return;
    endGesture(false);
  }, [endGesture]);

  /**
   * A drag ends in a click on most browsers. Swallow that one, otherwise every
   * swipe would also open the task editor. Also makes a tap on an open row
   * close the drawer instead of acting — the same forgiveness iOS gives you.
   */
  const onClickCapture = useCallback((e) => {
    if (g.current.moved) {
      g.current.moved = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (open) {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  }, [open, close]);

  return {
    dx,
    open,
    dragging,
    close,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture }
      : {},
  };
}
