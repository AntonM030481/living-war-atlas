import { CFG, type Side } from './Config';
import type { City, MapDefinition, SimulationSnapshot } from './types';

const EPS = 1e-6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hashNoise(index: number, bucket: number, seed: number): number {
  let x = (index * 0x9e3779b1) ^ (bucket * 0x85ebca6b) ^ seed;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly cities: City[];

  readonly control: Float32Array;
  readonly warBlue: Float32Array;
  readonly warRed: Float32Array;
  readonly instabilityBlue: Float32Array;
  readonly instabilityRed: Float32Array;
  readonly terrainDefense: Float32Array;
  readonly terrainMobility: Float32Array;
  readonly terrainCapacity: Float32Array;

  readonly flowBlueX: Float32Array;
  readonly flowBlueY: Float32Array;
  readonly flowRedX: Float32Array;
  readonly flowRedY: Float32Array;

  private readonly potentialBlue: Float32Array;
  private readonly potentialRed: Float32Array;
  private readonly needBlue: Float32Array;
  private readonly needRed: Float32Array;
  private readonly forcing: Float32Array;
  private readonly massBlue: Float32Array;
  private readonly massRed: Float32Array;
  private readonly incomingBlue: Float32Array;
  private readonly incomingRed: Float32Array;
  private readonly deltaBlue: Float32Array;
  private readonly deltaRed: Float32Array;
  private readonly tmpControl: Float32Array;
  private readonly collapseBlue: Uint8Array;
  private readonly collapseRed: Uint8Array;
  private readonly tmpPotentialA: Float32Array;
  private readonly tmpPotentialB: Float32Array;

  private stepCount = 0;
  private time = 0;

  constructor(
    private readonly map: MapDefinition,
    private readonly seed: number,
  ) {
    this.width = map.width;
    this.height = map.height;
    this.size = this.width * this.height;
    this.cities = map.cities.map((c) => ({ ...c }));

    this.control = new Float32Array(this.size);
    this.warBlue = new Float32Array(this.size);
    this.warRed = new Float32Array(this.size);
    this.instabilityBlue = new Float32Array(this.size);
    this.instabilityRed = new Float32Array(this.size);
    this.terrainDefense = new Float32Array(this.size);
    this.terrainMobility = new Float32Array(this.size);
    this.terrainCapacity = new Float32Array(this.size);

    this.flowBlueX = new Float32Array(this.size);
    this.flowBlueY = new Float32Array(this.size);
    this.flowRedX = new Float32Array(this.size);
    this.flowRedY = new Float32Array(this.size);

    this.potentialBlue = new Float32Array(this.size);
    this.potentialRed = new Float32Array(this.size);
    this.needBlue = new Float32Array(this.size);
    this.needRed = new Float32Array(this.size);
    this.forcing = new Float32Array(this.size);
    this.massBlue = new Float32Array(this.size);
    this.massRed = new Float32Array(this.size);
    this.incomingBlue = new Float32Array(this.size);
    this.incomingRed = new Float32Array(this.size);
    this.deltaBlue = new Float32Array(this.size);
    this.deltaRed = new Float32Array(this.size);
    this.tmpControl = new Float32Array(this.size);
    this.collapseBlue = new Uint8Array(this.size);
    this.collapseRed = new Uint8Array(this.size);
    this.tmpPotentialA = new Float32Array(this.size);
    this.tmpPotentialB = new Float32Array(this.size);

    this.initializeTerrain();
    this.initializeControl();
    this.seedInitialResource();
  }

  get step(): number {
    return this.stepCount;
  }

  get gameTime(): number {
    return this.time;
  }

  runWarmup(seconds = CFG.warmupSeconds): void {
    const steps = Math.ceil(seconds / CFG.dt);
    for (let i = 0; i < steps; i++) this.tick();
  }

  tick(): void {
    this.updateCities();
    this.generateCityResource();
    this.computeFrontMassAndNeed();

    if (this.stepCount % CFG.potentialEverySteps === 0) {
      this.rebuildPotential('blue');
      this.rebuildPotential('red');
    }

    this.transportResource('blue');
    this.transportResource('red');
    this.resolveCombatAndInstability();
    this.updateControl();

    this.stepCount += 1;
    this.time += CFG.dt;
  }

  snapshot(): SimulationSnapshot {
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      control: this.control.slice(),
      warBlue: this.warBlue.slice(),
      warRed: this.warRed.slice(),
      instabilityBlue: this.instabilityBlue.slice(),
      instabilityRed: this.instabilityRed.slice(),
      flowBlueX: this.flowBlueX.slice(),
      flowBlueY: this.flowBlueY.slice(),
      flowRedX: this.flowRedX.slice(),
      flowRedY: this.flowRedY.slice(),
      terrainDefense: this.terrainDefense.slice(),
      terrainMobility: this.terrainMobility.slice(),
      cities: this.cities.map((c) => ({ ...c })),
    };
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private initializeControl(): void {
    for (let y = 0; y < this.height; y++) {
      const frontX = this.map.initialFrontX(y);
      for (let x = 0; x < this.width; x++) {
        const signedDistance = (frontX - x) / 2.4;
        this.control[this.index(x, y)] = Math.tanh(signedDistance);
      }
    }
  }

  private initializeTerrain(): void {
    this.terrainDefense.fill(1);
    this.terrainMobility.fill(1);
    this.terrainCapacity.fill(1);

    for (let y = 0; y < this.height; y++) {
      const riverX = this.map.riverX(y);
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const riverDistance = Math.abs(x - riverX);
        if (riverDistance < 1.15) {
          const strength = 1 - riverDistance / 1.15;
          this.terrainDefense[i] *= 1 + 0.20 * strength;
          this.terrainMobility[i] *= 1 - 0.42 * strength;
          this.terrainCapacity[i] *= 1 - 0.40 * strength;
        }

        for (const mountain of this.map.mountains) {
          const dx = x - mountain.x;
          const dy = y - mountain.y;
          const d = Math.hypot(dx, dy);
          if (d < mountain.r) {
            const strength = 1 - d / mountain.r;
            this.terrainDefense[i] *= 1 + 0.55 * strength;
            this.terrainMobility[i] *= 1 - 0.70 * strength;
            this.terrainCapacity[i] *= 1 - 0.58 * strength;
          }
        }
      }
    }
  }

  private seedInitialResource(): void {
    for (const city of this.cities) {
      const i = this.index(city.x, city.y);
      const target = city.owner === 'blue' ? this.warBlue : this.warRed;
      target[i] += city.baseProduction * 12;
    }
  }

  private sideAccess(side: Side, i: number): number {
    const c = side === 'blue' ? this.control[i] : -this.control[i];
    return smoothstep(-0.10, 0.78, c);
  }

  private isFront(i: number): boolean {
    return Math.abs(this.control[i]) <= CFG.frontBand;
  }

  private updateCities(): void {
    const threshold = CFG.cityCaptureThreshold;
    for (const city of this.cities) {
      const c = this.control[this.index(city.x, city.y)];
      if (city.owner === 'blue' && c < -threshold) {
        city.owner = 'red';
        city.integration = 0;
      } else if (city.owner === 'red' && c > threshold) {
        city.owner = 'blue';
        city.integration = 0;
      }

      const secure = city.owner === 'blue' ? c > threshold : c < -threshold;
      if (secure) {
        city.integration = Math.min(
          1,
          city.integration + CFG.cityIntegrationPerSecond * CFG.dt,
        );
      }
    }
  }

  private generateCityResource(): void {
    for (const city of this.cities) {
      const i = this.index(city.x, city.y);
      const amount = city.baseProduction * city.integration * CFG.dt;
      if (city.owner === 'blue') this.warBlue[i] += amount;
      else this.warRed[i] += amount;
    }
  }

  private computeFrontMassAndNeed(): void {
    this.massBlue.fill(0);
    this.massRed.fill(0);
    this.needBlue.fill(0);
    this.needRed.fill(0);

    const r = CFG.massRadius;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        if (!this.isFront(i)) continue;

        let blue = 0;
        let red = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= this.height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= this.width) continue;
            const j = this.index(xx, yy);
            const w = 1 / (1 + Math.hypot(dx, dy));
            blue += this.warBlue[j] * w;
            red += this.warRed[j] * w;
          }
        }
        this.massBlue[i] = blue;
        this.massRed[i] = red;

        this.needBlue[i] = 0.65 + 1.8 * this.instabilityBlue[i] + 0.025 * red;
        this.needRed[i] = 0.65 + 1.8 * this.instabilityRed[i] + 0.025 * blue;
      }
    }
  }

  private rebuildPotential(side: Side): void {
    const need = side === 'blue' ? this.needBlue : this.needRed;
    const destination = side === 'blue' ? this.potentialBlue : this.potentialRed;
    let current = this.tmpPotentialA;
    let next = this.tmpPotentialB;
    current.fill(0);

    for (let i = 0; i < this.size; i++) {
      if (this.isFront(i) && this.sideAccess(side, i) > 0.05) {
        current[i] = 1 + need[i];
      }
    }

    for (let iter = 0; iter < CFG.potentialIterations; iter++) {
      next.set(current);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const i = this.index(x, y);
          const access = this.sideAccess(side, i);
          if (access <= 0.01) {
            next[i] = 0;
            continue;
          }

          let best = current[i];
          if (x > 0) best = Math.max(best, current[i - 1] * CFG.potentialDecay);
          if (x + 1 < this.width) best = Math.max(best, current[i + 1] * CFG.potentialDecay);
          if (y > 0) best = Math.max(best, current[i - this.width] * CFG.potentialDecay);
          if (y + 1 < this.height) best = Math.max(best, current[i + this.width] * CFG.potentialDecay);

          const terrainTransmission = 0.72 + 0.28 * this.terrainMobility[i];
          next[i] = Math.max(current[i], best * access * terrainTransmission);
        }
      }
      const tmp = current;
      current = next;
      next = tmp;
    }

    destination.set(current);
  }

  private transportResource(side: Side): void {
    const war = side === 'blue' ? this.warBlue : this.warRed;
    const potential = side === 'blue' ? this.potentialBlue : this.potentialRed;
    const delta = side === 'blue' ? this.deltaBlue : this.deltaRed;
    const incoming = side === 'blue' ? this.incomingBlue : this.incomingRed;
    const flowX = side === 'blue' ? this.flowBlueX : this.flowRedX;
    const flowY = side === 'blue' ? this.flowBlueY : this.flowRedY;

    delta.fill(0);
    incoming.fill(0);
    flowX.fill(0);
    flowY.fill(0);

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const amount = war[i];
        if (amount <= 0.0001) continue;
        const access = this.sideAccess(side, i);
        if (access <= 0.01) continue;

        let gradientSum = 0;
        const candidates: Array<{ j: number; dx: number; dy: number; gradient: number; capacity: number }> = [];

        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
          const j = this.index(nx, ny);
          const neighborAccess = this.sideAccess(side, j);
          if (neighborAccess <= 0.01) continue;
          const gradient = potential[j] - potential[i];
          if (gradient <= 1e-5) continue;

          const conductivity = Math.min(access, neighborAccess);
          const terrainCap = Math.min(this.terrainCapacity[i], this.terrainCapacity[j]);
          const capacity = CFG.baseEdgeCapacityPerSecond * terrainCap * conductivity * CFG.dt;
          if (capacity <= 0) continue;

          gradientSum += gradient;
          candidates.push({ j, dx, dy, gradient, capacity });
        }

        if (gradientSum <= 0 || candidates.length === 0) continue;

        const movable = amount * CFG.resourceMoveFraction;
        let sent = 0;
        for (const c of candidates) {
          const desired = movable * (c.gradient / gradientSum);
          const moved = Math.min(desired, c.capacity, amount - sent);
          if (moved <= 0) continue;
          delta[i] -= moved;
          delta[c.j] += moved;
          incoming[c.j] += moved / CFG.dt;
          flowX[i] += (moved / CFG.dt) * c.dx;
          flowY[i] += (moved / CFG.dt) * c.dy;
          sent += moved;
          if (sent >= amount - EPS) break;
        }
      }
    }

    for (let i = 0; i < this.size; i++) {
      war[i] = Math.max(0, war[i] + delta[i]);
    }
  }

  private resolveCombatAndInstability(): void {
    this.forcing.fill(0);
    const noiseBucket = Math.floor(this.time / 2.5);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        if (!this.isFront(i)) {
          this.instabilityBlue[i] *= 0.985;
          this.instabilityRed[i] *= 0.985;
          if (this.instabilityBlue[i] < CFG.collapseExit) this.collapseBlue[i] = 0;
          if (this.instabilityRed[i] < CFG.collapseExit) this.collapseRed[i] = 0;
          continue;
        }

        const blueMass = this.massBlue[i];
        const redMass = this.massRed[i];
        const localNoise = 1 + CFG.noiseAmplitude * hashNoise(i, noiseBucket, this.seed);

        const blueAttack = blueMass * CFG.baseProbe * localNoise;
        const redAttack = redMass * CFG.baseProbe / localNoise;
        const blueDefence = blueMass * CFG.defenceAdvantage * this.terrainDefense[i] + EPS;
        const redDefence = redMass * CFG.defenceAdvantage * this.terrainDefense[i] + EPS;

        const stressBlue = redAttack / blueDefence;
        const stressRed = blueAttack / redDefence;

        this.instabilityBlue[i] = this.updateInstability(
          this.instabilityBlue[i],
          stressBlue,
          blueMass,
          this.incomingBlue[i],
        );
        this.instabilityRed[i] = this.updateInstability(
          this.instabilityRed[i],
          stressRed,
          redMass,
          this.incomingRed[i],
        );

        if (this.instabilityBlue[i] >= CFG.collapseEnter) this.collapseBlue[i] = 1;
        else if (this.instabilityBlue[i] <= CFG.collapseExit) this.collapseBlue[i] = 0;
        if (this.instabilityRed[i] >= CFG.collapseEnter) this.collapseRed[i] = 1;
        else if (this.instabilityRed[i] <= CFG.collapseExit) this.collapseRed[i] = 0;

        const redCollapsed = this.collapseRed[i] === 1;
        const blueCollapsed = this.collapseBlue[i] === 1;

        let advanceBlue = Math.max(0, stressRed - 1);
        let advanceRed = Math.max(0, stressBlue - 1);
        if (redCollapsed) advanceBlue *= CFG.collapseAdvanceMultiplier;
        if (blueCollapsed) advanceRed *= CFG.collapseAdvanceMultiplier;

        this.forcing[i] = clamp(advanceBlue - advanceRed, -2.5, 2.5);

        const combatIntensity = Math.min(blueMass, redMass) / (8 + Math.min(blueMass, redMass));
        this.consumeNearFront(i, combatIntensity);
      }
    }
  }

  private updateInstability(current: number, stress: number, mass: number, incoming: number): number {
    if (stress > 1) {
      current += CFG.instabilityGrow * Math.pow(stress - 1, 1.45) * CFG.dt;
    } else {
      const massFactor = clamp(mass / 18, 0.15, 1.25);
      const flowFactor = clamp(incoming / 2.2, 0, 1.2);
      const recovery = CFG.instabilityRecover * (0.35 + 0.45 * massFactor + 0.35 * flowFactor);
      current -= recovery * CFG.dt;
    }

    if (current < CFG.collapseExit) return Math.max(0, current);
    return clamp(current, 0, 1.8);
  }

  private consumeNearFront(i: number, combatIntensity: number): void {
    const base = CFG.maintenanceRate * CFG.dt;
    const combat = CFG.combatConsumptionRate * combatIntensity * CFG.dt;
    const blueRate = base + combat;
    const redRate = base + combat;

    this.warBlue[i] = Math.max(0, this.warBlue[i] * (1 - blueRate));
    this.warRed[i] = Math.max(0, this.warRed[i] * (1 - redRate));
  }

  private updateControl(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const c = this.control[i];

        const left = x > 0 ? this.control[i - 1] : c;
        const right = x + 1 < this.width ? this.control[i + 1] : c;
        const up = y > 0 ? this.control[i - this.width] : c;
        const down = y + 1 < this.height ? this.control[i + this.width] : c;
        const lap = left + right + up + down - 4 * c;

        const interfaceWeight = Math.max(0, 1 - c * c);
        const mobility = this.terrainMobility[i];
        const smoothing = CFG.controlSmooth * lap * mobility;
        const restoring = CFG.controlRestore * c * interfaceWeight;
        const forcing = CFG.controlForce * this.forcing[i] * interfaceWeight * mobility;

        this.tmpControl[i] = clamp(
          c + (smoothing + restoring + forcing) * CFG.dt,
          -CFG.controlClamp,
          CFG.controlClamp,
        );
      }
    }

    this.control.set(this.tmpControl);
  }
}
