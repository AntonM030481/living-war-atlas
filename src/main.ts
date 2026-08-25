import './style.css';
import { GameApp } from './app/GameApp';
import { getMapOption, isMapId, MAP_OPTIONS } from './map/maps';
import { chooseMap } from './ui/MapPicker';
import type { MapId, SimulationState } from './sim/types';
import { HistoryStorage } from './worker/HistoryStorage';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

function mapIdForState(state: SimulationState): MapId | null {
  const option = MAP_OPTIONS.find(({ map }) =>
    state.width === map.width
    && state.height === map.height
    && state.cities.length === map.cities.length
    && state.cities.every((city, index) => city.id === map.cities[index]?.id),
  );
  return option?.id ?? null;
}

async function savedMapId(): Promise<MapId | null> {
  try {
    const persisted = await new HistoryStorage().load();
    if (!persisted || persisted.history.length === 0) return null;
    const index = Math.max(0, Math.min(persisted.history.length - 1, persisted.historyIndex));
    return mapIdForState(persisted.history[index]);
  } catch (error) {
    console.warn('Could not inspect saved simulation history', error);
    return null;
  }
}

const pendingMapId = sessionStorage.getItem('living-war-atlas:new-game-map');

let initialMapId: MapId;
if (pendingMapId && isMapId(pendingMapId)) {
  initialMapId = pendingMapId;
} else {
  initialMapId = await savedMapId()
    ?? await chooseMap('theatre', false)
    ?? 'theatre';
}

const initialMap = getMapOption(initialMapId);

void new GameApp(
  root,
  initialMap.id,
  initialMap.map,
  (currentMapId) => chooseMap(currentMapId, true),
).start().catch((error) => {
  console.error('App initialization failed', error);
});
