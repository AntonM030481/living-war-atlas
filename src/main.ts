import './style.css';
import { GameApp } from './app/GameApp';
import { getMapOption, isMapId } from './map/maps';
import { chooseMap } from './ui/MapPicker';
import type { MapId } from './sim/types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

const pendingMapId = sessionStorage.getItem('living-war-atlas:new-game-map');
if (pendingMapId) sessionStorage.removeItem('living-war-atlas:new-game-map');

const initialMapId: MapId = pendingMapId && isMapId(pendingMapId)
  ? pendingMapId
  : await chooseMap('theatre', false) ?? 'theatre';
const initialMap = getMapOption(initialMapId);

void new GameApp(
  root,
  initialMap.id,
  initialMap.map,
  (currentMapId) => chooseMap(currentMapId, true),
).start().catch((error) => {
  console.error('App initialization failed', error);
});
