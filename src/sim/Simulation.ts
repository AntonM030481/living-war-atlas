import { CFG, type Side } from './Config';
import type { City, MapDefinition, SimulationSnapshot, SimulationState, SimulationStats } from './types';
import { clamp, hashNoise } from './combat';
import { frontCommitment, updateCommittedAmounts } from './commitment';
import { flipCityOwner, generateCityResource, toggleCityEnabled, updateCities } from './cities';
import { assertStateDimensions, clearArrays, cloneCities } from './state';
import { sideAccess } from './transport';

const EPS = 1e-6;

export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly cities: City[];

  readonly control: Float32Array;
  readonly warBlue: Float32Array;
  readonly warRed: Float32Array;
  readonly committedBlue: Float32Array;
  readonly committedRed: Float32Array;
  readonly instabilityBlue: Float32Array;
  readonly instabilityRed: Float32Array;
  readonly terrainDefense: Float32Array;
  readonly terrainMobility: Float32Array;
  readonly terrainCapacity: Float32Array;
  readonly riverCrossingX: Float32Array;
  readonly riverCrossingY: Float32Array;

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
  private readonly commitmentTargetBlue: Float32Array;
  private readonly commitmentTargetRed: Float32Array;
  private readonly availableMassBlue: Float32Array;
  private readonly availableMassRed: Float32Array;
  private readonly incomingBlue: Float32Array;
  private readonly incomingRed: Float32Array;
  private readonly frontConsumption: Float32Array;
  private readonly deltaBlue: Float32Array;
  private readonly deltaRed: Float32Array;
  private readonly drainBlue: Float32Array;
  private readonly drainRed: Float32Array;
  private readonly advanceBlueDebug: Float32Array;
  private readonly advanceRedDebug: Float32Array;
  private readonly stressBlueDebug: Float32Array;
  private readonly stressRedDebug: Float32Array;
  private readonly rawForcingDebug: Float32Array;
  private readonly pressureDebug: Float32Array;
  private readonly tmpControl: Float32Array;
  private readonly collapseBlue: Uint8Array;
  private readonly collapseRed: Uint8Array;

  private stepCount = 0;
  private time = 0;

  constructor(
    private readonly map: MapDefinition,
    private readonly seed: number,
  ) {
    this.width = map.width;
    this.height = map.height;
    this.size = this.width * this.height;
    this.cities = map.cities.map((c) => ({ enabled: true, ...c }));

    this.control = new Float32Array(this.size);
    this.warBlue = new Float32Array(this.size);
    this.warRed = new Float32Array(this.size);
    this.committedBlue = new Float32Array(this.size);
    this.committedRed = new Float32Array(this.size);
    this.instabilityBlue = new Float32Array(this.size);
    this.instabilityRed = new Float32Array(this.size);
    this.terrainDefense = new Float32Array(this.size);
    this.terrainMobility = new Float32Array(this.size);
    this.terrainCapacity = new Float32Array(this.size);
    this.riverCrossingX = new Float32Array(this.size);
    this.riverCrossingY = new Float32Array(this.size);

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
    this.commitmentTargetBlue = new Float32Array(this.size);
    this.commitmentTargetRed = new Float32Array(this.size);
    this.availableMassBlue = new Float32Array(this.size);
    this.availableMassRed = new Float32Array(this.size);
    this.incomingBlue = new Float32Array(this.size);
    this.incomingRed = new Float32Array(this.size);
    this.frontConsumption = new Float32Array(this.size);
    this.deltaBlue = new Float32Array(this.size);
    this.deltaRed = new Float32Array(this.size);
    this.drainBlue = new Float32Array(this.size);
    this.drainRed = new Float32Array(this.size);
    this.advanceBlueDebug = new Float32Array(this.size);
    this.advanceRedDebug = new Float32Array(this.size);
    this.stressBlueDebug = new Float32Array(this.size);
    this.stressRedDebug = new Float32Array(this.size);
    this.rawForcingDebug = new Float32Array(this.size);
    this.pressureDebug = new Float32Array(this.size);
    this.tmpControl = new Float32Array(this.size);
    this.collapseBlue = new Uint8Array(this.size);
    this.collapseRed = new Uint8Array(this.size);

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

  toggleCityEnabled(cityId: string): void {
    toggleCityEnabled(this.cities, cityId);
  }

  flipCityOwner(cityId: string): void {
    flipCityOwner(this.cities, cityId);
  }

  runWarmup(seconds = CFG.warmupSeconds): void {
    const steps = Math.ceil(seconds / CFG.dt);
    for (let i = 0; i < steps; i++) this.tick();
  }

  tick(): void {
    updateCities(this.cities, this.control, this.width, {
      captureThreshold: CFG.cityCaptureThreshold,
      integrationPerSecond: CFG.cityIntegrationPerSecond,
      dt: CFG.dt,
    });
    generateCityResource(this.cities, this.width, this.warBlue, this.warRed, CFG.dt);
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
    this.computeFrontMassAndNeed();
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      stats: this.computeStats(),
      control: this.control.slice(),
      warBlue: this.warBlue.slice(),
      warRed: this.warRed.slice(),
      committedBlue: this.committedBlue.slice(),
      committedRed: this.committedRed.slice(),
      instabilityBlue: this.instabilityBlue.slice(),
      instabilityRed: this.instabilityRed.slice(),
      frontMassBlue: this.massBlue.slice(),
      frontMassRed: this.massRed.slice(),
      incomingBlue: this.incomingBlue.slice(),
      incomingRed: this.incomingRed.slice(),
      drainBlue: this.drainBlue.slice(),
      drainRed: this.drainRed.slice(),
      advanceBlue: this.advanceBlueDebug.slice(),
      advanceRed: this.advanceRedDebug.slice(),
      stressBlue: this.stressBlueDebug.slice(),
      stressRed: this.stressRedDebug.slice(),
      rawForcing: this.rawForcingDebug.slice(),
      forcing: this.forcing.slice(),
      pressure: this.pressureDebug.slice(),
      flowBlueX: this.flowBlueX.slice(),
      flowBlueY: this.flowBlueY.slice(),
      flowRedX: this.flowRedX.slice(),
      flowRedY: this.flowRedY.slice(),
      terrainDefense: this.terrainDefense.slice(),
      terrainMobility: this.terrainMobility.slice(),
      cities: cloneCities(this.cities),
    };
  }

  saveState(): SimulationState {
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      control: this.control.slice(),
      warBlue: this.warBlue.slice(),
      warRed: this.warRed.slice(),
      committedBlue: this.committedBlue.slice(),
      committedRed: this.committedRed.slice(),
      instabilityBlue: this.instabilityBlue.slice(),
      instabilityRed: this.instabilityRed.slice(),
      potentialBlue: this.potentialBlue.slice(),
      potentialRed: this.potentialRed.slice(),
      collapseBlue: this.collapseBlue.slice(),
      collapseRed: this.collapseRed.slice(),
      cities: cloneCities(this.cities),
    };
  }

  restoreState(state: SimulationState): void {
    assertStateDimensions(state, this.width, this.height);
    this.stepCount = state.step;
    this.time = state.gameTime;
    this.cities.splice(0, this.cities.length, ...cloneCities(state.cities));
    this.control.set(state.control);
    this.warBlue.set(state.warBlue);
    this.warRed.set(state.warRed);
    this.committedBlue.set(state.committedBlue);
    this.committedRed.set(state.committedRed);
    this.instabilityBlue.set(state.instabilityBlue);
    this.instabilityRed.set(state.instabilityRed);
    this.potentialBlue.set(state.potentialBlue);
    this.potentialRed.set(state.potentialRed);
    this.collapseBlue.set(state.collapseBlue);
    this.collapseRed.set(state.collapseRed);
    this.clearDerivedFields();
  }

  private clearDerivedFields(): void {
    clearArrays([
      this.flowBlueX,
      this.flowBlueY,
      this.flowRedX,
      this.flowRedY,
      this.needBlue,
      this.needRed,
      this.forcing,
      this.massBlue,
      this.massRed,
      this.commitmentTargetBlue,
      this.commitmentTargetRed,
      this.availableMassBlue,
      this.availableMassRed,
      this.incomingBlue,
      this.incomingRed,
      this.frontConsumption,
      this.deltaBlue,
      this.deltaRed,
      this.drainBlue,
      this.drainRed,
      this.advanceBlueDebug,
      this.advanceRedDebug,
      this.stressBlueDebug,
      this.stressRedDebug,
      this.rawForcingDebug,
      this.pressureDebug,
      this.tmpControl,
    ]);
  }

  private computeStats(): SimulationStats {
    let frontCells = 0;
    let maxInstabilityBlue = 0;
    let maxInstabilityRed = 0;
    let collapseBlueCells = 0;
    let collapseRedCells = 0;
    let totalWarBlue = 0;
    let totalWarRed = 0;
    let activeFlowBlue = 0;
    let activeFlowRed = 0;

    for (let i = 0; i < this.size; i++) {
      if (this.isFront(i)) frontCells += 1;
      maxInstabilityBlue = Math.max(maxInstabilityBlue, this.instabilityBlue[i]);
      maxInstabilityRed = Math.max(maxInstabilityRed, this.instabilityRed[i]);
      collapseBlueCells += this.collapseBlue[i];
      collapseRedCells += this.collapseRed[i];
      totalWarBlue += this.warBlue[i];
      totalWarRed += this.warRed[i];
      activeFlowBlue += Math.hypot(this.flowBlueX[i], this.flowBlueY[i]);
      activeFlowRed += Math.hypot(this.flowRedX[i], this.flowRedY[i]);
    }

    let blueCities = 0;
    let redCities = 0;
    let activeCityPointsBlue = 0;
    let activeCityPointsRed = 0;
    let controlledCityPointsBlue = 0;
    let controlledCityPointsRed = 0;
    for (const city of this.cities) {
      const activePoints = city.enabled === false ? 0 : city.baseProduction * city.integration;
      if (city.owner === 'blue') {
        blueCities += 1;
        controlledCityPointsBlue += city.baseProduction;
        activeCityPointsBlue += activePoints;
      } else {
        redCities += 1;
        controlledCityPointsRed += city.baseProduction;
        activeCityPointsRed += activePoints;
      }
    }

    return {
      frontCells,
      maxInstabilityBlue,
      maxInstabilityRed,
      collapseBlueCells,
      collapseRedCells,
      totalWarBlue,
      totalWarRed,
      activeFlowBlue,
      activeFlowRed,
      blueCities,
      redCities,
      activeCityPointsBlue,
      activeCityPointsRed,
      controlledCityPointsBlue,
      controlledCityPointsRed,
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
    this.riverCrossingX.fill(1);
    this.riverCrossingY.fill(1);

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

        for (const forest of this.map.forests) {
          const dx = x - forest.x;
          const dy = y - forest.y;
          const d = Math.hypot(dx, dy);
          if (d < forest.r) {
            const strength = 1 - d / forest.r;
            this.terrainDefense[i] *= 1 + 0.55 * strength;
            this.terrainMobility[i] *= 1 - 0.70 * strength;
            this.terrainCapacity[i] *= 1 - 0.58 * strength;
          }
        }

        if (x + 1 < this.width) {
          const crossesRiver = x < riverX && x + 1 >= riverX;
          if (crossesRiver) this.riverCrossingX[i] = 0.26;
        }
        if (y + 1 < this.height) {
          const nextRiverX = this.map.riverX(y + 1);
          const midRiverX = (riverX + nextRiverX) * 0.5;
          const drift = Math.abs(nextRiverX - riverX);
          const parallelNearBank = Math.abs(x - midRiverX) < 0.65 + drift * 0.25;
          if (parallelNearBank) this.riverCrossingY[i] = 0.82;
        }
      }
    }
  }

  private seedInitialResource(): void {
    for (const city of this.cities) {
      const i = this.index(city.x, city.y);
      const target = city.owner === 'blue' ? this.warBlue : this.warRed;
      target[i] += city.baseProduction * CFG.initialCityResourceSeconds;
    }

    for (let i = 0; i < this.size; i++) {
      const c = this.control[i];
      const frontProximity = Math.max(0, 1 - Math.abs(c) / 0.82);
      if (frontProximity <= 0) continue;
      const amount = CFG.initialFrontResource * frontProximity;
      if (c >= 0) this.warBlue[i] += amount;
      else this.warRed[i] += amount;
    }
  }

  private sideAccess(side: Side, i: number): number {
    return sideAccess(side, this.control[i]);
  }

  private isFront(i: number): boolean {
    const c = this.control[i];
    const x = i % this.width;
    const y = Math.floor(i / this.width);
    if (!this.isFrontEligible(x, y)) return false;
    if (Math.abs(c) <= CFG.frontBand) return true;
    if (x > 0 && c * this.control[i - 1] <= 0) return true;
    if (x + 1 < this.width && c * this.control[i + 1] <= 0) return true;
    if (y > 0 && c * this.control[i - this.width] <= 0) return true;
    if (y + 1 < this.height && c * this.control[i + this.width] <= 0) return true;
    return false;
  }

  private isFrontEligible(x: number, y: number): boolean {
    const px = this.width > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;
    const py = this.height > CFG.frontBoundaryPadding * 2 + 1 ? CFG.frontBoundaryPadding : 0;
    return x >= px && y >= py && x < this.width - px && y < this.height - py;
  }

  private edgeFactor(x: number, y: number, dx: number, dy: number): number {
    const i = this.index(x, y);
    if (dx === 1) return this.riverCrossingX[i];
    if (dx === -1) return this.riverCrossingX[i - 1];
    if (dy === 1) return this.riverCrossingY[i];
    if (dy === -1) return this.riverCrossingY[i - this.width];
    return 1;
  }

  private computeFrontMassAndNeed(): void {
    this.massBlue.fill(0);
    this.massRed.fill(0);
    this.availableMassBlue.fill(0);
    this.availableMassRed.fill(0);
    this.commitmentTargetBlue.fill(0);
    this.commitmentTargetRed.fill(0);
    this.needBlue.fill(0);
    this.needRed.fill(0);

    const r = CFG.massRadius;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        if (!this.isFront(i)) continue;

        let blueAvailable = 0;
        let redAvailable = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= this.height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= this.width) continue;
            const j = this.index(xx, yy);
            const w = 1 / (1 + Math.hypot(dx, dy));
            blueAvailable += this.warBlue[j] * w;
            redAvailable += this.warRed[j] * w;
          }
        }
        this.availableMassBlue[i] = blueAvailable;
        this.availableMassRed[i] = redAvailable;

        const blueTarget = frontCommitment(
          blueAvailable,
          redAvailable,
          this.terrainDefense[i],
          this.collapseBlue[i] === 1,
          CFG,
        );
        const redTarget = frontCommitment(
          redAvailable,
          blueAvailable,
          this.terrainDefense[i],
          this.collapseRed[i] === 1,
          CFG,
        );

        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= this.height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= this.width) continue;
            const j = this.index(xx, yy);
            if (blueTarget > 0 && this.sideAccess('blue', j) > 0.01) {
              this.commitmentTargetBlue[j] = Math.max(this.commitmentTargetBlue[j], blueTarget);
            }
            if (redTarget > 0 && this.sideAccess('red', j) > 0.01) {
              this.commitmentTargetRed[j] = Math.max(this.commitmentTargetRed[j], redTarget);
            }
          }
        }
      }
    }

    updateCommittedAmounts('blue', this.size, this.commitmentFields(), CFG);
    updateCommittedAmounts('red', this.size, this.commitmentFields(), CFG);

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
            blue += this.committedBlue[j] * w;
            red += this.committedRed[j] * w;
          }
        }
        this.massBlue[i] = blue;
        this.massRed[i] = red;
        const blueShortage = Math.max(0, red - blue);
        const redShortage = Math.max(0, blue - red);
        this.needBlue[i] = 0.65 + 1.8 * this.instabilityBlue[i] + 0.025 * red + 0.018 * blueShortage;
        this.needRed[i] = 0.65 + 1.8 * this.instabilityRed[i] + 0.025 * blue + 0.018 * redShortage;
      }
    }
  }

  private commitmentFields() {
    return {
      warBlue: this.warBlue,
      warRed: this.warRed,
      committedBlue: this.committedBlue,
      committedRed: this.committedRed,
      commitmentTargetBlue: this.commitmentTargetBlue,
      commitmentTargetRed: this.commitmentTargetRed,
      collapseBlue: this.collapseBlue,
      collapseRed: this.collapseRed,
    };
  }

  private rebuildPotential(side: Side): void {
    const need = side === 'blue' ? this.needBlue : this.needRed;
    const destination = side === 'blue' ? this.potentialBlue : this.potentialRed;
    destination.fill(0);
    const heapIndex: number[] = [];
    const heapValue: number[] = [];

    const push = (index: number, value: number): void => {
      let node = heapIndex.length;
      heapIndex.push(index);
      heapValue.push(value);
      while (node > 0) {
        const parent = (node - 1) >> 1;
        if (heapValue[parent] >= value) break;
        heapIndex[node] = heapIndex[parent];
        heapValue[node] = heapValue[parent];
        node = parent;
      }
      heapIndex[node] = index;
      heapValue[node] = value;
    };

    const pop = (): { index: number; value: number } | null => {
      if (heapIndex.length === 0) return null;
      const index = heapIndex[0];
      const value = heapValue[0];
      const lastIndex = heapIndex.pop()!;
      const lastValue = heapValue.pop()!;
      if (heapIndex.length > 0) {
        let node = 0;
        while (true) {
          const left = node * 2 + 1;
          const right = left + 1;
          if (left >= heapIndex.length) break;
          const child = right < heapIndex.length && heapValue[right] > heapValue[left] ? right : left;
          if (heapValue[child] <= lastValue) break;
          heapIndex[node] = heapIndex[child];
          heapValue[node] = heapValue[child];
          node = child;
        }
        heapIndex[node] = lastIndex;
        heapValue[node] = lastValue;
      }
      return { index, value };
    };

    for (let i = 0; i < this.size; i++) {
      if (this.isFront(i) && this.sideAccess(side, i) > 0.05) {
        const value = 1 + need[i];
        destination[i] = value;
        push(i, value);
      }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    while (true) {
      const entry = pop();
      if (!entry) break;
      if (entry.value < destination[entry.index] - 1e-7) continue;
      const x = entry.index % this.width;
      const y = Math.floor(entry.index / this.width);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const j = this.index(nx, ny);
        const access = this.sideAccess(side, j);
        if (access <= 0.01) continue;
        const terrainTransmission = 0.72 + 0.28 * this.terrainMobility[j];
        const nextValue = entry.value * CFG.potentialDecay * this.edgeFactor(x, y, dx, dy) * access * terrainTransmission;
        if (nextValue <= destination[j] + 1e-7) continue;
        destination[j] = nextValue;
        push(j, nextValue);
      }
    }
  }

  private transportResource(side: Side): void {
    const war = side === 'blue' ? this.warBlue : this.warRed;
    const committed = side === 'blue' ? this.committedBlue : this.committedRed;
    const potential = side === 'blue' ? this.potentialBlue : this.potentialRed;
    const delta = side === 'blue' ? this.deltaBlue : this.deltaRed;
    const incoming = side === 'blue' ? this.incomingBlue : this.incomingRed;
    const flowX = side === 'blue' ? this.flowBlueX : this.flowRedX;
    const flowY = side === 'blue' ? this.flowBlueY : this.flowRedY;

    delta.fill(0);
    incoming.fill(0);
    flowX.fill(0);
    flowY.fill(0);

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const reserve = Math.max(0, war[i] - committed[i]);
        if (reserve <= 0.0001) continue;
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
          const crossing = this.edgeFactor(x, y, dx, dy);
          const capacity = CFG.baseEdgeCapacityPerSecond * terrainCap * crossing * conductivity * CFG.dt;
          if (capacity <= 0) continue;
          gradientSum += gradient;
          candidates.push({ j, dx, dy, gradient, capacity });
        }

        if (gradientSum <= 0 || candidates.length === 0) continue;
        const movable = reserve * CFG.resourceMoveFraction;
        let sent = 0;
        for (const candidate of candidates) {
          const desired = movable * (candidate.gradient / gradientSum);
          const moved = Math.min(desired, candidate.capacity, reserve - sent);
          if (moved <= 0) continue;
          delta[i] -= moved;
          delta[candidate.j] += moved;
          incoming[candidate.j] += moved / CFG.dt;
          flowX[i] += (moved / CFG.dt) * candidate.dx;
          flowY[i] += (moved / CFG.dt) * candidate.dy;
          sent += moved;
          if (sent >= reserve - EPS) break;
        }
      }
    }

    for (let i = 0; i < this.size; i++) {
      war[i] = Math.max(committed[i], war[i] + delta[i]);
    }
  }

  private resolveCombatAndInstability(): void {
    this.forcing.fill(0);
    this.drainBlue.fill(0);
    this.drainRed.fill(0);
    this.frontConsumption.fill(0);
    this.advanceBlueDebug.fill(0);
    this.advanceRedDebug.fill(0);
    this.stressBlueDebug.fill(0);
    this.stressRedDebug.fill(0);
    this.rawForcingDebug.fill(0);
    this.pressureDebug.fill(0);
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

        this.instabilityBlue[i] = this.updateInstability(this.instabilityBlue[i], stressBlue, blueMass, this.incomingBlue[i]);
        this.instabilityRed[i] = this.updateInstability(this.instabilityRed[i], stressRed, redMass, this.incomingRed[i]);
        if (this.instabilityBlue[i] >= CFG.collapseEnter) this.collapseBlue[i] = 1;
        else if (this.instabilityBlue[i] <= CFG.collapseExit) this.collapseBlue[i] = 0;
        if (this.instabilityRed[i] >= CFG.collapseEnter) this.collapseRed[i] = 1;
        else if (this.instabilityRed[i] <= CFG.collapseExit) this.collapseRed[i] = 0;

        const redCollapsed = this.collapseRed[i] === 1;
        const blueCollapsed = this.collapseBlue[i] === 1;
        let advanceBlue = Math.max(0, stressRed - 1);
        let advanceRed = Math.max(0, stressBlue - 1);
        if (redMass < CFG.emptyFrontMass && blueMass > CFG.unopposedTinyMass) {
          const strength = clamp(blueMass / CFG.unopposedUsefulMass, 0.15, 1);
          advanceBlue = Math.max(advanceBlue, CFG.unopposedAdvance * strength);
        }
        if (blueMass < CFG.emptyFrontMass && redMass > CFG.unopposedTinyMass) {
          const strength = clamp(redMass / CFG.unopposedUsefulMass, 0.15, 1);
          advanceRed = Math.max(advanceRed, CFG.unopposedAdvance * strength);
        }
        if (redCollapsed) advanceBlue *= CFG.collapseAdvanceMultiplier;
        if (blueCollapsed) advanceRed *= CFG.collapseAdvanceMultiplier;

        const rawForcing = advanceBlue - advanceRed;
        this.forcing[i] = clamp(rawForcing, -2.5, 2.5);
        this.advanceBlueDebug[i] = advanceBlue;
        this.advanceRedDebug[i] = advanceRed;
        this.stressBlueDebug[i] = stressBlue;
        this.stressRedDebug[i] = stressRed;
        this.rawForcingDebug[i] = rawForcing;
        this.pressureDebug[i] = (blueMass - redMass) / (blueMass + redMass + EPS);
        const combatIntensity = Math.min(blueMass, redMass) / (8 + Math.min(blueMass, redMass));
        this.accumulateFrontConsumption(x, y, combatIntensity);
      }
    }

    this.applyFrontConsumption();
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

  private accumulateFrontConsumption(x: number, y: number, combatIntensity: number): void {
    const ratePerSecond = CFG.maintenanceRate + CFG.combatConsumptionRate * combatIntensity;
    const r = CFG.massRadius;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= this.width) continue;
        const j = this.index(xx, yy);
        const weight = 1 / (1 + Math.hypot(dx, dy));
        this.frontConsumption[j] += ratePerSecond * weight;
      }
    }
  }

  private applyFrontConsumption(): void {
    for (let i = 0; i < this.size; i++) {
      const exposure = this.frontConsumption[i];
      if (exposure <= 0) continue;
      const survival = Math.exp(-exposure * CFG.dt);
      const blueBefore = this.committedBlue[i];
      const redBefore = this.committedRed[i];
      const blueAfter = blueBefore * survival;
      const redAfter = redBefore * survival;
      const blueLoss = blueBefore - blueAfter;
      const redLoss = redBefore - redAfter;
      this.committedBlue[i] = blueAfter;
      this.committedRed[i] = redAfter;
      this.warBlue[i] = Math.max(blueAfter, this.warBlue[i] - blueLoss);
      this.warRed[i] = Math.max(redAfter, this.warRed[i] - redLoss);
      this.drainBlue[i] = blueLoss;
      this.drainRed[i] = redLoss;
    }
  }

  private updateControl(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const c = this.control[i];
        const wl = x > 0 ? this.edgeFactor(x, y, -1, 0) : 0;
        const wr = x + 1 < this.width ? this.edgeFactor(x, y, 1, 0) : 0;
        const wu = y > 0 ? this.edgeFactor(x, y, 0, -1) : 0;
        const wd = y + 1 < this.height ? this.edgeFactor(x, y, 0, 1) : 0;
        const left = x > 0 ? this.control[i - 1] : c;
        const right = x + 1 < this.width ? this.control[i + 1] : c;
        const up = y > 0 ? this.control[i - this.width] : c;
        const down = y + 1 < this.height ? this.control[i + this.width] : c;
        const weightSum = wl + wr + wu + wd + EPS;
        const lap = (wl * left + wr * right + wu * up + wd * down) - weightSum * c;
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
