import { isLocalHost } from '../app/environment';
import type { MapId } from '../sim/types';
import { MAP_OPTIONS, type MapOption } from '../map/maps';

export function chooseMap(
  currentMapId: MapId,
  allowCancel: boolean,
  options: readonly MapOption[] = MAP_OPTIONS,
): Promise<MapId | null> {
  return new Promise((resolve) => {
    const visibleOptions = options.filter((option) => isLocalHost() || option.id !== 'linear');
    if (visibleOptions.length === 0) {
      resolve(null);
      return;
    }

    const selectedDefault = visibleOptions.some((option) => option.id === currentMapId)
      ? currentMapId
      : visibleOptions[0].id;
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker';
    dialog.innerHTML = `
      <form>
        <div class="map-picker-title">Choose map</div>
        <div class="map-picker-options">
          ${visibleOptions.map((option) => `
            <button
              type="button"
              class="map-picker-option${option.id === selectedDefault ? ' selected' : ''}"
              data-map-id="${option.id}"
              aria-pressed="${option.id === selectedDefault}"
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
    let selectedMapId = selectedDefault;
    const finish = (mapId: MapId | null) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(mapId);
    };

    const optionButtons = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[data-map-id]'),
    );
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
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      finish(selectedMapId);
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
