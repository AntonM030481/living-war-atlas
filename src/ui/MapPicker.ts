import type { MapId } from '../sim/types';
import { MAP_OPTIONS } from '../map/maps';

export function chooseMap(currentMapId: MapId, allowCancel: boolean): Promise<MapId | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker';
    dialog.innerHTML = `
      <form>
        <div class="map-picker-title">Choose map</div>
        <div class="map-picker-options">
          ${MAP_OPTIONS.map((option) => `
            <button
              type="button"
              class="map-picker-option${option.id === currentMapId ? ' selected' : ''}"
              data-map-id="${option.id}"
              aria-pressed="${option.id === currentMapId}"
            >
              <strong>${option.name}</strong>
              <span>${option.description}</span>
            </button>
          `).join('')}
        </div>
        <div class="map-picker-actions">
          ${allowCancel ? '<button type="button" class="map-picker-cancel">Cancel</button>' : ''}
          <button type="button" class="map-picker-start">Start</button>
        </div>
      </form>
    `;

    let settled = false;
    let selectedMapId = currentMapId;
    const finish = (mapId: MapId | null) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(mapId);
    };

    const optionButtons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-map-id]')];
    const selectMap = (mapId: MapId) => {
      selectedMapId = mapId;
      optionButtons.forEach((button) => {
        const selected = button.dataset.mapId === mapId;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };

    optionButtons.forEach((button) => {
      button.addEventListener('click', () => selectMap(button.dataset.mapId as MapId));
    });
    dialog.querySelector<HTMLButtonElement>('.map-picker-start')!
      .addEventListener('click', () => finish(selectedMapId));
    dialog.querySelector<HTMLButtonElement>('.map-picker-cancel')
      ?.addEventListener('click', () => finish(null));
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
