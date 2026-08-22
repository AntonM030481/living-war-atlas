import type { SimulationSnapshot } from '../sim/types';
import type { FrontDebugInfo, Point } from './types';

export interface FrontInspectionSource {
  inspectFrontAtClientPoint(snapshot: SimulationSnapshot, clientX: number, clientY: number): FrontDebugInfo | null;
  inspectFrontAtWorldPoint(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null;
}

export class FrontInspector {
  constructor(private readonly source: FrontInspectionSource) {}

  atClientPoint(snapshot: SimulationSnapshot, clientX: number, clientY: number): FrontDebugInfo | null {
    return this.source.inspectFrontAtClientPoint(snapshot, clientX, clientY);
  }

  refresh(snapshot: SimulationSnapshot, point: Point): FrontDebugInfo | null {
    return this.source.inspectFrontAtWorldPoint(snapshot, point);
  }
}
