import type { GameModeId } from '../game/GameMode';
import type { GameSessionState } from '../game/GameSession';
import type { MapId } from '../sim/types';

const DB_NAME = 'living-war-atlas';
const DB_VERSION = 1;
const STATE_STORE = 'simulation-state';
export const HISTORY_STATE_KEY = 'history' as const;

export interface PersistedHistory {
  key: typeof HISTORY_STATE_KEY;
  seed: number;
  mapId: MapId;
  modeId: GameModeId;
  savedAt: number;
  history: GameSessionState[];
  historyIndex: number;
  nextHistoryTime: number;
}

export class HistoryStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private persistVersion = 0;
  private persistQueue: Promise<void> = Promise.resolve();

  async load(): Promise<PersistedHistory | null> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readonly');
      const request = transaction.objectStore(STATE_STORE).get(HISTORY_STATE_KEY);
      request.onsuccess = () => {
        const record = request.result as Partial<PersistedHistory> | undefined;
        if (!record || typeof record.modeId !== 'string' || typeof record.mapId !== 'string') {
          resolve(null);
          return;
        }
        resolve(record as PersistedHistory);
      };
      request.onerror = () => reject(request.error);
    });
  }

  schedule(record: Omit<PersistedHistory, 'key' | 'savedAt'>): void {
    const version = ++this.persistVersion;
    const persisted: PersistedHistory = {
      key: HISTORY_STATE_KEY,
      savedAt: Date.now(),
      ...record,
    };
    this.persistQueue = this.persistQueue
      .then(() => this.write(persisted, version))
      .catch((error) => console.warn('Could not persist simulation history', error));
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STATE_STORE)) {
          request.result.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  private async write(record: PersistedHistory, version: number): Promise<void> {
    const db = await this.openDatabase();
    if (version !== this.persistVersion) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readwrite');
      transaction.objectStore(STATE_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
