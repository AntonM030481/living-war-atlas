import { describe, expect, it } from 'vitest';

type Side = 'blue' | 'red';

interface Sample {
  t: number;
  frontX: number;
  blueMass: number;
  redMass: number;
  blueIncoming: number;
  redIncoming: number;
  force: number;
}

const C = {
  width: 120,
  dt: 0.1,
  blueCity: 12,
  redCity: 107,
  cityProduction: 1.25,
  moveFraction: 0.72,
  edgeCapacity: 2.4,
  massRadius: 4,
  frontDrain: 0.030,
  balancedForce: 0.16,
  emptyMass: 0.08,
  tinyMass: 0.015,
  usefulMass: 0.55,
  unopposedSpeed: 0.70,
};

class OneDimensionalFront {
  readonly blue = new Float32Array(C.width);
  readonly red = new Float32Array(C.width);
  frontX = C.width / 2;
  redSource = true;
  blueSource = true;
  blueIncoming = 0;
  redIncoming = 0;
  force = 0;
  t = 0;

  constructor() {
    for (let x = C.blueCity; x < this.frontX; x++) this.blue[x] = 0.45;
    for (let x = Math.ceil(this.frontX); x <= C.redCity; x++) this.red[x] = 0.45;
  }

  tick(): void {
    this.generate();
    this.transport('blue');
    this.transport('red');
    const blueMass = this.frontMass('blue');
    const redMass = this.frontMass('red');
    this.consumeFront();
    this.force = this.computeForce(blueMass, redMass);
    this.frontX = clamp(this.frontX + this.force * C.dt, 2, C.width - 3);
    this.t += C.dt;
  }

  sample(): Sample {
    return {
      t: this.t,
      frontX: this.frontX,
      blueMass: this.frontMass('blue'),
      redMass: this.frontMass('red'),
      blueIncoming: this.blueIncoming,
      redIncoming: this.redIncoming,
      force: this.force,
    };
  }

  private generate(): void {
    if (this.blueSource) this.blue[C.blueCity] += C.cityProduction * C.dt;
    if (this.redSource) this.red[C.redCity] += C.cityProduction * C.dt;
  }

  private transport(side: Side): void {
    const field = side === 'blue' ? this.blue : this.red;
    const next = new Float32Array(field);
    let incoming = 0;

    if (side === 'blue') {
      const edge = Math.max(0, Math.min(C.width - 2, Math.floor(this.frontX) - 1));
      for (let x = edge; x >= 0; x--) {
        if (x + 1 >= this.frontX) continue;
        const moved = Math.min(field[x] * C.moveFraction, C.edgeCapacity * C.dt);
        next[x] -= moved;
        next[x + 1] += moved;
        if (x + 1 >= edge) incoming += moved / C.dt;
      }
    } else {
      const edge = Math.max(1, Math.min(C.width - 1, Math.ceil(this.frontX) + 1));
      for (let x = edge; x < C.width; x++) {
        if (x - 1 <= this.frontX) continue;
        const moved = Math.min(field[x] * C.moveFraction, C.edgeCapacity * C.dt);
        next[x] -= moved;
        next[x - 1] += moved;
        if (x - 1 <= edge) incoming += moved / C.dt;
      }
    }

    field.set(next);
    if (side === 'blue') this.blueIncoming = incoming;
    else this.redIncoming = incoming;
  }

  private frontMass(side: Side): number {
    const field = side === 'blue' ? this.blue : this.red;
    const center = side === 'blue' ? Math.floor(this.frontX) - 1 : Math.ceil(this.frontX) + 1;
    let total = 0;
    for (let dx = -C.massRadius; dx <= C.massRadius; dx++) {
      const x = center + dx;
      if (x < 0 || x >= C.width) continue;
      total += field[x] * (1 - Math.abs(dx) / (C.massRadius + 1));
    }
    return total;
  }

  private consumeFront(): void {
    this.consumeSide('blue');
    this.consumeSide('red');
  }

  private consumeSide(side: Side): void {
    const field = side === 'blue' ? this.blue : this.red;
    const center = side === 'blue' ? Math.floor(this.frontX) - 1 : Math.ceil(this.frontX) + 1;
    for (let dx = -C.massRadius; dx <= C.massRadius; dx++) {
      const x = center + dx;
      if (x < 0 || x >= C.width) continue;
      const weight = 1 - Math.abs(dx) / (C.massRadius + 1);
      field[x] = Math.max(0, field[x] - C.frontDrain * weight * C.dt);
    }
  }

  private computeForce(blueMass: number, redMass: number): number {
    if (redMass < C.emptyMass && blueMass > C.tinyMass) {
      return C.unopposedSpeed * clamp(blueMass / C.usefulMass, 0.15, 1);
    }
    if (blueMass < C.emptyMass && redMass > C.tinyMass) {
      return -C.unopposedSpeed * clamp(redMass / C.usefulMass, 0.15, 1);
    }
    return C.balancedForce * (blueMass - redMass);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function run(seconds: number, sim: OneDimensionalFront): Sample[] {
  const samples: Sample[] = [];
  const steps = Math.round(seconds / C.dt);
  for (let step = 0; step < steps; step++) {
    sim.tick();
    if (step % Math.round(10 / C.dt) === 0) samples.push(sim.sample());
  }
  return samples;
}

describe('One-dimensional resource front experiment', () => {
  it('keeps a symmetric two-city front metastable', () => {
    const sim = new OneDimensionalFront();
    const start = sim.frontX;
    run(80, sim);
    expect(Math.abs(sim.frontX - start)).toBeLessThan(1.2);
  });

  it('breaks through when one city source is disabled', () => {
    const sim = new OneDimensionalFront();
    run(20, sim);
    const start = sim.frontX;
    sim.redSource = false;
    const trace = run(90, sim);
    const end = sim.sample();

    expect(trace.length).toBeGreaterThan(5);
    expect(end.frontX).toBeGreaterThan(start + 5);
    expect(end.blueMass).toBeGreaterThan(end.redMass);
    expect(end.redIncoming).toBeLessThan(0.05);
  });
});
