import { Simulation } from '../../src/sim/Simulation';

// Transitional compatibility for the diagnostics generator while simulation
// internals move from blue/red fields to side-indexed state.
Object.defineProperty(Simulation.prototype, 'collapseBlue', {
  configurable: true,
  get(this: Simulation) {
    return this.sides.blue.collapse;
  },
});

await import('../../diagnostics/generate-diagnostics');
