import './style.css';
import { GameApp } from './app/GameApp';
import {
  getGameModeOption,
  isGameModeId,
  mapSupportsMode,
  type GameModeId,
} from './game/GameMode';
import { getMapOption, isMapId, MAP_OPTIONS } from './map/maps';
import { showAppError } from './ui/AppError';
import { chooseMap } from './ui/MapPicker';
import { chooseMode } from './ui/ModePicker';
import type { MapId } from './sim/types';
import { HistoryStorage } from './worker/HistoryStorage';

const NEW_GAME_MAP_KEY = 'living-war-atlas:new-game-map';
const NEW_GAME_MODE_KEY = 'living-war-atlas:new-game-mode';

export interface GameSelection {
  modeId: GameModeId;
  mapId: MapId;
}

function compatibleMaps(modeId: GameModeId) {
  return MAP_OPTIONS.filter((option) => mapSupportsMode(option.map, modeId));
}

async function savedGame(): Promise<GameSelection | null> {
  try {
    const persisted = await new HistoryStorage().load();
    if (!persisted || !isMapId(persisted.mapId) || !isGameModeId(persisted.modeId)) return null;
    const map = getMapOption(persisted.mapId).map;
    if (!mapSupportsMode(map, persisted.modeId)) return null;
    return { mapId: persisted.mapId, modeId: persisted.modeId };
  } catch (error) {
    console.warn('Could not inspect saved game history', error);
    return null;
  }
}

async function chooseNewGame(
  currentModeId: GameModeId,
  currentMapId: MapId,
  allowCancel: boolean,
): Promise<GameSelection | null> {
  const modeId = await chooseMode(currentModeId, allowCancel);
  if (!modeId) return null;
  const maps = compatibleMaps(modeId);
  const preferredMapId = maps.some((option) => option.id === currentMapId)
    ? currentMapId
    : maps[0]?.id;
  if (!preferredMapId) throw new Error(`No maps support ${getGameModeOption(modeId).name}`);
  const mapId = await chooseMap(preferredMapId, allowCancel, maps);
  return mapId ? { modeId, mapId } : null;
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Missing #app');

  const pendingMapId = sessionStorage.getItem(NEW_GAME_MAP_KEY);
  const pendingModeId = sessionStorage.getItem(NEW_GAME_MODE_KEY);

  let initial: GameSelection | null = null;
  if (
    pendingMapId
    && pendingModeId
    && isMapId(pendingMapId)
    && isGameModeId(pendingModeId)
    && mapSupportsMode(getMapOption(pendingMapId).map, pendingModeId)
  ) {
    initial = { mapId: pendingMapId, modeId: pendingModeId };
  }

  initial ??= await savedGame();
  initial ??= await chooseNewGame('sandbox', 'theatre', false);
  initial ??= { modeId: 'sandbox', mapId: 'theatre' };

  const initialMap = getMapOption(initial.mapId);

  await new GameApp(
    root,
    initial.modeId,
    initialMap.id,
    initialMap.map,
    (currentModeId, currentMapId) => chooseNewGame(currentModeId, currentMapId, true),
  ).start();
}

void main().catch((error) => {
  showAppError('Living War Atlas could not start', error);
});
