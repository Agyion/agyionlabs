/** Shared landing/app pointer gain; zoom, keyboard and passive aim stay independent. */
export const ORBIT_DRAG_SENSITIVITY = .375;

export interface OrbitInputOptions {
  wheelZoom: boolean;
  /** Scales pointer/touch camera travel on both axes, independently of zoom and keyboard steps. */
  dragSensitivity?: number;
  /** Horizontal pointer/touch travel only; keyboard, pitch and zoom stay independent. */
  horizontalDragSensitivity?: number;
  canInteract: () => boolean;
  onOrbit: (yawDelta: number, pitchDelta: number) => void;
  /** Positive logarithmic delta increases distance; negative delta zooms in. */
  onZoom: (logDelta: number) => void;
  onPick: (clientX: number, clientY: number) => void;
  onHover: (clientX: number | null, clientY: number | null) => void;
  /** Passive mouse position normalized -1..1 (right/up); null neutralizes aim. */
  onAim?: (x: number | null, y: number | null) => void;
  onReset: () => void;
}

interface PointerPosition {
  x: number;
  y: number;
  startX: number;
  startY: number;
  type: string;
}

/** Input changes camera targets; the scene owns damping, bounds and rendering. */
export function bindOrbitInput(canvas: HTMLCanvasElement, options: OrbitInputOptions): () => void {
  const pointers = new Map<number, PointerPosition>();
  const originalTabIndex = canvas.getAttribute('tabindex');
  const originalLabel = canvas.getAttribute('aria-label');
  const originalTouchAction = canvas.style.touchAction;
  let moved = false;
  let multiple = false;
  let nativeScroll = false;
  let disposed = false;

  canvas.tabIndex = 0;
  canvas.style.touchAction = options.wheelZoom ? 'none' : 'pan-y';
  canvas.setAttribute('aria-label', options.wheelZoom
    ? 'Interactive orbital scene. Drag to orbit; scroll or pinch to zoom. Arrow keys rotate, plus and minus zoom, Home or double-click resets the view.'
    : 'Interactive orbital scene. Drag horizontally to orbit. Arrow keys rotate, plus and minus zoom, Home or double-click resets the view.');

  const release = (id: number) => {
    try { if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id); } catch { /* Pointer may already have ended. */ }
  };
  const cancel = () => {
    const ids = [...pointers.keys()];
    pointers.clear();
    ids.forEach(release);
    moved = multiple = nativeScroll = false;
    options.onHover(null, null);
    options.onAim?.(null, null);
  };
  const orbit = (dx: number, dy: number) => {
    if (!dx && !dy) return;
    const bounds = canvas.getBoundingClientRect();
    const sensitivity = options.dragSensitivity ?? 1;
    options.onOrbit(
      dx * Math.PI * 2 / Math.max(300, bounds.width) * sensitivity * (options.horizontalDragSensitivity ?? 1),
      dy * Math.PI / Math.max(300, bounds.height) * sensitivity,
    );
  };
  const pair = () => {
    const [first, second] = [...pointers.values()];
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, distance: Math.hypot(first.x - second.x, first.y - second.y) };
  };

  const down = (event: PointerEvent) => {
    if (!options.canInteract() || (event.pointerType !== 'touch' && event.button !== 0)) return;
    options.onAim?.(null, null);
    if (!pointers.size) moved = multiple = nativeScroll = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, type: event.pointerType });
    if (pointers.size > 1) multiple = moved = true;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic events and older browsers may not support capture. */ }
    canvas.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent) => {
    if (!options.canInteract()) { if (pointers.size) cancel(); else options.onAim?.(null, null); return; }
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (!pointers.size) {
        if (options.onAim) {
          if (event.pointerType === 'mouse' && !event.buttons) {
            const bounds = canvas.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1;
            const y = 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2;
            options.onAim(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
          } else options.onAim(null, null);
        }
        options.onHover(event.clientX, event.clientY);
      }
      return;
    }
    const previousPair = pointers.size > 1 ? pair() : null;
    let dx = event.clientX - pointer.x;
    let dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (previousPair) {
      if (!options.wheelZoom) return;
      const currentPair = pair();
      orbit(currentPair.x - previousPair.x, currentPair.y - previousPair.y);
      if (previousPair.distance > 1 && currentPair.distance > 1) {
        const delta = Math.log(previousPair.distance / currentPair.distance);
        if (delta) options.onZoom(delta);
      }
      return;
    }
    const totalX = pointer.x - pointer.startX;
    const totalY = pointer.y - pointer.startY;
    if (!moved && Math.hypot(totalX, totalY) >= 6) {
      moved = true;
      nativeScroll = !options.wheelZoom && pointer.type === 'touch' && Math.abs(totalY) > Math.abs(totalX);
      // Count the same physical travel whether the browser dispatches one
      // coalesced move or many small moves before the drag threshold.
      dx = totalX;
      dy = totalY;
    }
    if (!moved || nativeScroll) return;
    orbit(dx, !options.wheelZoom && pointer.type === 'touch' ? 0 : dy);
  };
  const up = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    const pick = !moved && !multiple && pointers.size === 1 && options.canInteract();
    pointers.delete(event.pointerId);
    release(event.pointerId);
    if (pick) options.onPick(event.clientX, event.clientY);
    if (!pointers.size) {
      moved = multiple = nativeScroll = false;
      options.onHover(event.pointerType === 'touch' ? null : event.clientX, event.pointerType === 'touch' ? null : event.clientY);
    }
  };
  const cancelled = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    release(event.pointerId);
    // Any interrupted multi-touch gesture must never turn its final release into a pick.
    moved = true;
    options.onHover(null, null);
    options.onAim?.(null, null);
  };
  const leave = () => {
    options.onAim?.(null, null);
    if (!pointers.size) options.onHover(null, null);
  };
  const wheel = (event: WheelEvent) => {
    if (!options.wheelZoom || !options.canInteract()) return;
    options.onAim?.(null, null);
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.getBoundingClientRect().height : 1;
    const delta = Math.max(-0.4, Math.min(0.4, event.deltaY * unit * 0.0015));
    if (delta) options.onZoom(delta);
  };
  const key = (event: KeyboardEvent) => {
    if (document.activeElement !== canvas || !options.canInteract() || event.ctrlKey || event.metaKey || event.altKey) return;
    options.onAim?.(null, null);
    const amount = event.shiftKey ? 0.14 : 0.07;
    switch (event.key) {
      case 'ArrowLeft': options.onOrbit(-amount, 0); break;
      case 'ArrowRight': options.onOrbit(amount, 0); break;
      case 'ArrowUp': options.onOrbit(0, -amount); break;
      case 'ArrowDown': options.onOrbit(0, amount); break;
      case '+': case '=': options.onZoom(-0.12); break;
      case '-': case '_': options.onZoom(0.12); break;
      case 'Home': options.onReset(); break;
      default: return;
    }
    event.preventDefault();
  };
  const reset = (event: MouseEvent) => { if (options.canInteract()) { event.preventDefault(); options.onAim?.(null, null); options.onReset(); } };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancelled);
  canvas.addEventListener('lostpointercapture', cancelled);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('keydown', key);
  canvas.addEventListener('dblclick', reset);
  window.addEventListener('blur', cancel);

  return () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancelled);
    canvas.removeEventListener('lostpointercapture', cancelled);
    canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('keydown', key);
    canvas.removeEventListener('dblclick', reset);
    window.removeEventListener('blur', cancel);
    cancel();
    if (originalTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', originalTabIndex);
    if (originalLabel === null) canvas.removeAttribute('aria-label'); else canvas.setAttribute('aria-label', originalLabel);
    canvas.style.touchAction = originalTouchAction;
  };
}
