import type { Speed } from '../sim/Config';

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
  private pointerDown: { x: number; y: number } | null = null;
  private dragging = false;
  private suppressClick = false;

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
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.dragging = false;
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown || (event.buttons & 1) === 0) return;
    if (!this.dragging) {
      const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
      if (distance < 3) return;
      this.dragging = true;
    }
    event.preventDefault();
    this.handlers.onPrimaryDrag(event);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.dragging) this.suppressClick = true;
    this.pointerDown = null;
    this.dragging = false;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
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
