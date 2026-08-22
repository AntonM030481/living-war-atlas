import type { Speed } from '../sim/Config';

export interface InputHandlers {
  onPrimaryClick(event: MouseEvent): void;
  onSecondaryClick(event: MouseEvent | PointerEvent, force?: boolean): void;
  onPauseToggle(): void;
  onDiagnosticsToggle(): void;
  onHistoryStep(delta: -1 | 1): void;
  onSpeedStep(delta: -1 | 1): void;
  onSpeed(speed: Speed): void;
}

export class InputController {
  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: InputHandlers) {}

  attach(): void {
    this.canvas.addEventListener('click', this.handleClick);
    window.addEventListener('contextmenu', this.handleContextMenu, true);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  detach(): void {
    this.canvas.removeEventListener('click', this.handleClick);
    window.removeEventListener('contextmenu', this.handleContextMenu, true);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    this.handlers.onPrimaryClick(event);
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
