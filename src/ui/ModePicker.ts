import { GAME_MODE_OPTIONS, type GameModeId, mapSupportsMode } from '../game/GameMode';
import { MAP_OPTIONS } from '../map/maps';

function modeAvailable(modeId: GameModeId): boolean {
  return MAP_OPTIONS.some((option) => mapSupportsMode(option.map, modeId));
}

export function chooseMode(currentModeId: GameModeId, allowCancel: boolean): Promise<GameModeId | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker';
    dialog.innerHTML = `
      <form>
        <div class="map-picker-title">Choose mode</div>
        <div class="map-picker-options">
          ${GAME_MODE_OPTIONS.map((option) => {
            const available = modeAvailable(option.id);
            return `
              <button
                type="button"
                class="map-picker-option${option.id === currentModeId ? ' selected' : ''}"
                data-mode-id="${option.id}"
                aria-pressed="${option.id === currentModeId}"
                ${available ? '' : 'disabled'}
              >
                <strong>${option.name}</strong>
                <span>${option.description}${available ? '' : ' No compatible maps yet.'}</span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="map-picker-actions">
          ${allowCancel ? '<button type="button" class="map-picker-cancel">Cancel</button>' : ''}
          <button type="button" class="map-picker-start">Continue</button>
        </div>
      </form>
    `;

    let settled = false;
    let selectedModeId = modeAvailable(currentModeId)
      ? currentModeId
      : GAME_MODE_OPTIONS.find((option) => modeAvailable(option.id))!.id;
    const finish = (modeId: GameModeId | null) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(modeId);
    };

    const optionButtons = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[data-mode-id]'),
    );
    const selectMode = (modeId: GameModeId) => {
      selectedModeId = modeId;
      optionButtons.forEach((button) => {
        const selected = button.dataset.modeId === modeId;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };

    selectMode(selectedModeId);
    optionButtons.forEach((button) => {
      button.addEventListener('click', () => selectMode(button.dataset.modeId as GameModeId));
    });
    dialog.querySelector<HTMLButtonElement>('.map-picker-start')!
      .addEventListener('click', () => finish(selectedModeId));
    dialog.querySelector<HTMLButtonElement>('.map-picker-cancel')
      ?.addEventListener('click', () => finish(null));
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      finish(selectedModeId);
    });
    dialog.addEventListener('cancel', (event) => {
      if (!allowCancel) {
        event.preventDefault();
        return;
      }
      finish(null);
    });
    dialog.addEventListener('close', () => {
      if (!settled) finish(null);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
