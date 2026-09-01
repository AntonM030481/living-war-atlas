import type { Speed } from '../sim/Config';

const DRAG_THRESHOLD_PX = 3;
const LONG_PRESS_MS = 400;
const TOUCH_CONTEXT_MENU_SUPPRESSION_MS = 1000;

export interface InputHandlers {
  onPrimaryClick(event: MouseEvent): void;
  onPrimaryDrag(event: PointerEvent): void;
  onSecondaryClick(event: MouseEvent | PointerEvent, force?: boolean): void;
  onPauseToggle(): void;
  onDiagnosticsToggle(): void;
  onHistoryStep(delta: -1 | 1): void;
  onSpeedStep(delta: -1 | 1): void;
  onSpeed(speed: Speed): void;
}

export class InputController {
  private pointerDown: { x: number; y: number; pointerId: number } | null = null;
  private dragging = false;
  private suppressClick = false;
  private longPressTimer: number | null = null;
  private longPressTriggered = false;
  private lastTouchLongPressAt = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: InputHandlers) {}

  attach(): void {
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    window.addEventListener('contextmenu', this.handleContextMenu, true);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  detach(): void {
    this.cancelLongPress();
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('contextmenu', this.handleContextMenu, true);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.handlers.onPrimaryClick(event);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.ctrlKey) return;

    this.cancelLongPress();
    this.pointerDown = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    this.dragging = false;
    this.longPressTriggered = false;

    if (event.pointerType === 'touch') {
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (!this.pointerDown || this.pointerDown.pointerId !== event.pointerId || this.dragging) return;

        this.longPressTriggered = true;
        this.lastTouchLongPressAt = Date.now();
        this.suppressClick = true;
        navigator.vibrate?.(20);
        this.handlers.onSecondaryClick(event, true);
      }, LONG_PRESS_MS);
    }

    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown || this.pointerDown.pointerId !== event.pointerId || (event.buttons & 1) === 0) return;

    if (this.longPressTriggered) {
      event.preventDefault();
      return;
    }

    if (!this.dragging) {
      const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
      if (distance < DRAG_THRESHOLD_PX) return;
      this.dragging = true;
      this.cancelLongPress();
    }

    event.preventDefault();
    this.handlers.onPrimaryDrag(event);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown || this.pointerDown.pointerId !== event.pointerId) return;

    this.cancelLongPress();
    if (this.dragging || this.longPressTriggered) this.suppressClick = true;
    this.pointerDown = null;
    this.dragging = false;
    this.longPressTriggered = false;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private cancelLongPress(): void {
    if (this.longPressTimer === null) return;
    window.clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.map-stage')) return;
    event.preventDefault();

    // iOS may emit a synthetic contextmenu after the custom long press.
    if (Date.now() - this.lastTouchLongPressAt < TOUCH_CONTEXT_MENU_SUPPRESSION_MS) return;
    this.handlers.onSecondaryClick(event, true);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const numericSpeed = Number(event.key);
    if ([1, 2, 4, 8, 16].includes(numericSpeed)) {
      this.handlers.onSpeed(numericSpeed as Speed);
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.handlers.onPauseToggle();
        break;
      case 'F3':
        event.preventDefault();
        this.handlers.onDiagnosticsToggle();
        break;
      case 'ArrowLeft':
      case '[':
        event.preventDefault();
        this.handlers.onHistoryStep(-1);
        break;
      case 'ArrowRight':
      case ']':
        event.preventDefault();
        this.handlers.onHistoryStep(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.handlers.onSpeedStep(1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.handlers.onSpeedStep(-1);
        break;
    }
  };
}
