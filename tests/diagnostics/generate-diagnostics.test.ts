import { resolve } from 'node:path';
import { afterAll } from 'vitest';
import { annotateTimelineSvg, firstSampleEvent, recoveryEvents } from '../../diagnostics/EventMarkers';
import { Simulation } from '../../src/sim/Simulation';

// Transitional compatibility for the diagnostics generator while simulation
// internals move from blue/red fields to side-indexed state.
Object.defineProperty(Simulation.prototype, 'collapseBlue', {
  configurable: true,
  get(this: Simulation) {
    return this.sides.blue.collapse;
  },
});

const diagnostics = (name: string) => resolve('diagnostics', name);

// The generator still guards its suite with DIAGNOSTICS. Set it here so this
// regular test file always registers the diagnostics checks in Vitest/VS Code.
process.env.DIAGNOSTICS = '1';

afterAll(() => {
  const successEvents = recoveryEvents(diagnostics('recovery-success.csv'));
  const failedEvents = recoveryEvents(diagnostics('recovery-failed.csv'));

  for (const graph of ['recovery-success-mass.svg', 'recovery-success-front.svg']) {
    annotateTimelineSvg(diagnostics(graph), diagnostics('recovery-success.csv'), successEvents);
  }
  for (const graph of ['recovery-failed-mass.svg', 'recovery-failed-front.svg']) {
    annotateTimelineSvg(diagnostics(graph), diagnostics('recovery-failed.csv'), failedEvents);
  }

  annotateTimelineSvg(
    diagnostics('engagement-transition.svg'),
    diagnostics('engagement-transition.csv'),
    firstSampleEvent(diagnostics('engagement-transition.csv'), 'enemy contact'),
  );
  annotateTimelineSvg(
    diagnostics('release-transition.svg'),
    diagnostics('release-transition.csv'),
    firstSampleEvent(diagnostics('release-transition.csv'), 'contact removed'),
  );
});

await import('../../diagnostics/generate-diagnostics');
