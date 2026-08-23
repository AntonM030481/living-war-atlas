import type { MapId } from '../sim/types';
import { MAP_OPTIONS } from '../map/maps';

export function chooseMap(currentMapId: MapId, allowCancel: boolean): Promise<MapId | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker';
    dialog.innerHTML = `
      <form method="dialog">
        <div class="map-picker-title">Choose map</div>
        <div class="map-picker-options">
          ${MAP_OPTIONS.map((option) => `
            <button type="button" class="map-picker-option${option.id === currentMapId ? ' selected' : ''}" data-map-id="${option.id}">
              <strong>${option.name}</strong>
              <span>${option.description}</span>
            </button>
          `).join('')}
        </div>
        ${allowCancel ? '<button class="map-picker-cancel" value="cancel">Cancel</button>' : ''}
      </form>
    `;

    let settled = false;
    const finish = (mapId: MapId | null) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(mapId);
    };

    dialog.querySelectorAll<HTMLButtonElement>('[data-map-id]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.mapId as MapId));
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
