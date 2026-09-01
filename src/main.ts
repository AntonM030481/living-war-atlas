import './style.css';
import { GameApp } from './app/GameApp';
import { isLocalHost } from './app/environment';
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
const MODE_INSTRUCTIONS_HIDDEN_KEY = 'living-war-atlas:mode-instructions-hidden';

export interface GameSelection {
  modeId: GameModeId;
  mapId: MapId;
}

function modeAllowed(modeId: GameModeId): boolean {
  return isLocalHost() || modeId !== 'conquest';
}

function mapAllowed(mapId: MapId): boolean {
  return isLocalHost() || mapId !== 'linear';
}

function selectionAllowed(selection: GameSelection): boolean {
  return modeAllowed(selection.modeId) && mapAllowed(selection.mapId);
}

function compatibleMaps(modeId: GameModeId) {
  return MAP_OPTIONS.filter((option) => mapAllowed(option.id) && mapSupportsMode(option.map, modeId));
}

function usesTouchControls(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

function modeInstructionsStorageKey(modeId: GameModeId): string {
  return `${MODE_INSTRUCTIONS_HIDDEN_KEY}:${modeId}`;
}

async function showModeInstructions(modeId: GameModeId): Promise<void> {
  const storageKey = modeInstructionsStorageKey(modeId);
  if (localStorage.getItem(storageKey) === '1') return;

  const mode = getGameModeOption(modeId);
  const interactionNote = usesTouchControls()
    ? mode.interactionNoteTouch
    : mode.interactionNoteClick;

  await new Promise<void>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker mode-instructions';
    dialog.innerHTML = `
      <form>
        <div class="map-picker-title">${mode.name}</div>
        <div class="mode-instructions-text">${interactionNote}</div>
        <label class="mode-instructions-dismiss">
          <input type="checkbox">
          <span>Don't show again for this mode</span>
        </label>
        <div class="map-picker-actions">
          <button type="button" class="map-picker-start">OK</button>
        </div>
      </form>
    `;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const checkbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      if (checkbox.checked) localStorage.setItem(storageKey, '1');
      dialog.close();
      dialog.remove();
      resolve();
    };

    dialog.querySelector<HTMLButtonElement>('.map-picker-start')!
      .addEventListener('click', finish);
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      finish();
    });
    dialog.addEventListener('cancel', (event) => event.preventDefault());

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

async function savedGame(): Promise<GameSelection | null> {
  try {
    const persisted = await new HistoryStorage().load();
    if (!persisted || !isMapId(persisted.mapId) || !isGameModeId(persisted.modeId)) return null;
    const selection = { mapId: persisted.mapId, modeId: persisted.modeId };
    if (!selectionAllowed(selection)) return null;
    const map = getMapOption(persisted.mapId).map;
    if (!mapSupportsMode(map, persisted.modeId)) return null;
    return selection;
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
  const preferredModeId = modeAllowed(currentModeId) ? currentModeId : 'sandbox';
  const modeId = await chooseMode(preferredModeId, allowCancel);
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
  ) {
    const pending = { mapId: pendingMapId, modeId: pendingModeId };
    if (selectionAllowed(pending) && mapSupportsMode(getMapOption(pendingMapId).map, pendingModeId)) {
      initial = pending;
    }
  }

  initial ??= await savedGame();
  initial ??= await chooseNewGame('sandbox', 'theatre', false);
  initial ??= { modeId: 'sandbox', mapId: 'theatre' };

  await showModeInstructions(initial.modeId);

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