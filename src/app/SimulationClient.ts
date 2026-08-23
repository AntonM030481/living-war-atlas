import type { Speed } from '../sim/Config';
import type { MapId, WorkerInMessage, WorkerOutMessage } from '../sim/types';

export class SimulationClient {
  private readonly worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), { type: 'module' });

  onMessage(handler: (message: WorkerOutMessage) => void): void {
    this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => handler(event.data);
  }

  start(mapId: MapId, seed: number): void {
    this.send({ type: 'start', mapId, seed });
  }

  setSpeed(speed: Speed): void {
    this.send({ type: 'speed', speed });
  }

  setPaused(paused: boolean): void {
    this.send({ type: 'pause', paused });
  }

  reset(mapId: MapId, seed: number): void {
    this.send({ type: 'reset', mapId, seed });
  }

  toggleCity(cityId: string): void {
    this.send({ type: 'toggleCity', cityId });
  }

  flipCityOwner(cityId: string): void {
    this.send({ type: 'flipCityOwner', cityId });
  }

  stepHistory(delta: -1 | 1): void {
    this.send({ type: 'historyStep', delta });
  }

  private send(message: WorkerInMessage): void {
    this.worker.postMessage(message);
  }
}
