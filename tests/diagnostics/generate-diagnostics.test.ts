import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Simulation } from '../../src/sim/Simulation';

// Transitional compatibility for the diagnostics generator while simulation
// internals move from blue/red fields to side-indexed state.
Object.defineProperty(Simulation.prototype, 'collapseBlue', {
  configurable: true,
  get(this: Simulation) {
    return this.sides.blue.collapse;
  },
});

try {
  await import('../../diagnostics/generate-diagnostics');
} catch (error) {
  try {
    const csv = readFileSync(resolve('diagnostics/tests.csv'), 'utf8').trim();
    const [, ...rows] = csv.split('\n');
    const failed = rows
      .map((row) => row.split(','))
      .filter(([, , pass]) => pass === '0')
      .map(([check, value]) => `  - ${check}: ${value}`);

    if (failed.length > 0) {
      throw new Error(`Diagnostic checks failed:\n${failed.join('\n')}`, { cause: error });
    }
  } catch (reportError) {
    if (reportError instanceof Error && reportError.message.startsWith('Diagnostic checks failed:')) {
      throw reportError;
    }
  }

  throw error;
}
