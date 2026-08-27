import { CFG, type Side } from './Config';
import type { City, MapDefinition, SimulationSnapshot, SimulationState, SimulationStats } from './types';
import { applyFrontConsumption, clamp, resolvePairCombat } from './combat';
import { computePairCommitment } from './commitment';
import { flipCityOwner, generateCityResource, toggleCityEnabled, updateCities } from './cities';
import { initializeControlFromCities } from './initialControl';
import { pointInTerrainRegion } from '../map/terrain';
import { rasterizeRivers } from './rivers';
import { assertStateDimensions, clearArrays, cloneCities } from './state';
import {
  CURRENT_SIDE_IDS,
  createSideFieldMap,
  requireSide,
  type SideFieldMap,
  type SideFields,
} from './sides';
import { rebuildPotential, sideAccess, transportResource } from './transport';

const EPS = 1e-6;

export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly cities: City[];
  readonly sides: SideFieldMap;

  readonly control: Float32Array;
  readonly terrainDefense: Float32Array;
  readonly terrainMobility: Float32Array;
  readonly terrainCapacity: Float32Array;
  readonly terrainBlocked: Uint8Array;
  readonly terrainForest: Uint8Array;
  readonly riverCrossingX: Float32Array;
  readonly riverCrossingY: Float32Array;

  private readonly forcing: Float32Array;
  private readonly frontConsumption: Float32Array;
  private readonly rawForcingDebug: Float32Array;
  private readonly pressureDebug: Float32Array;
  private readonly tmpControl: Float32Array;

  private stepCount = 0;
  private time = 0;

  constructor(
    private readonly map: MapDefinition,
    private readonly seed: number,
  ) {
    this.width = map.width;
    this.height = map.height;
    this.size = this.width * this.height;
    this.cities = map.cities.map((city) => ({ enabled: true, ...city }));
    this.sides = createSideFieldMap(CURRENT_SIDE_IDS, this.size);

    this.control = new Float32Array(this.size);
    this.terrainDefense = new Float32Array(this.size);
    this.terrainMobility = new Float32Array(this.size);
    this.terrainCapacity = new Float32Array(this.size);
    this.terrainBlocked = new Uint8Array(this.size);
    this.terrainForest = new Uint8Array(this.size);
    this.riverCrossingX = new Float32Array(this.size);
    this.riverCrossingY = new Float32Array(this.size);
    this.forcing = new Float32Array(this.size);
    this.frontConsumption = new Float32Array(this.size);
    this.rawForcingDebug = new Float32Array(this.size);
    this.pressureDebug = new Float32Array(this.size);
    this.tmpControl = new Float32Array(this.size);

    this.initializeTerrain();
    this.initializeControl();
    if (this.map.seedInitialResource !== false) this.seedInitialResource();
  }

  get warBlue(): Float32Array { return this.side('blue').war; }
  get warRed(): Float32Array { return this.side('red').war; }
  get committedBlue(): Float32Array { return this.side('blue').committed; }
  get committedRed(): Float32Array { return this.side('red').committed; }
  get instabilityBlue(): Float32Array { return this.side('blue').instability; }
  get instabilityRed(): Float32Array { return this.side('red').instability; }
  get flowBlueX(): Float32Array { return this.side('blue').flow.x; }
  get flowBlueY(): Float32Array { return this.side('blue').flow.y; }
  get flowRedX(): Float32Array { return this.side('red').flow.x; }
  get flowRedY(): Float32Array { return this.side('red').flow.y; }

  get step(): number { return this.stepCount; }
  get gameTime(): number { return this.time; }

  toggleCityEnabled(cityId: string): void {
    toggleCityEnabled(this.cities, cityId);
  }

  flipCityOwner(cityId: string): void {
    flipCityOwner(this.cities, cityId);
  }

  tick(): void {
    updateCities(this.cities, this.control, this.width, {
      captureThreshold: CFG.cityCaptureThreshold,
      integrationPerSecond: CFG.cityIntegrationPerSecond,
      dt: CFG.dt,
    });
    generateCityResource(this.cities, this.width, this.sides, CFG.dt);
    this.computeFrontMassAndNeed();

    if (this.stepCount % CFG.potentialEverySteps === 0) {
      for (const side of CURRENT_SIDE_IDS) this.rebuildPotential(side);
    }
    for (const side of CURRENT_SIDE_IDS) this.transportResource(side);

    this.resolveCombatAndInstability();
    this.updateControl();
    this.stepCount += 1;
    this.time += CFG.dt;
  }

  snapshot(): SimulationSnapshot {
    this.computeFrontMassAndNeed();
    const blue = this.side('blue');
    const red = this.side('red');
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      stats: this.computeStats(),
      control: this.control.slice(),
      warBlue: blue.war.slice(),
      warRed: red.war.slice(),
      committedBlue: blue.committed.slice(),
      committedRed: red.committed.slice(),
      instabilityBlue: blue.instability.slice(),
      instabilityRed: red.instability.slice(),
      potentialBlue: blue.potential.slice(),
      potentialRed: red.potential.slice(),
      frontMassBlue: blue.mass.slice(),
      frontMassRed: red.mass.slice(),
      incomingBlue: blue.incoming.slice(),
      incomingRed: red.incoming.slice(),
      drainBlue: blue.drain.slice(),
      drainRed: red.drain.slice(),
      advanceBlue: blue.advanceDebug.slice(),
      advanceRed: red.advanceDebug.slice(),
      stressBlue: blue.stressDebug.slice(),
      stressRed: red.stressDebug.slice(),
      rawForcing: this.rawForcingDebug.slice(),
      forcing: this.forcing.slice(),
      pressure: this.pressureDebug.slice(),
      flowBlueX: blue.flow.x.slice(),
      flowBlueY: blue.flow.y.slice(),
      flowRedX: red.flow.x.slice(),
      flowRedY: red.flow.y.slice(),
      terrainDefense: this.terrainDefense.slice(),
      terrainMobility: this.terrainMobility.slice(),
      terrainBlocked: this.terrainBlocked.slice(),
      cities: cloneCities(this.cities),
    };
  }

  saveState(): SimulationState {
    const blue = this.side('blue');
    const red = this.side('red');
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      control: this.control.slice(),
      warBlue: blue.war.slice(),
      warRed: red.war.slice(),
      committedBlue: blue.committed.slice(),
      committedRed: red.committed.slice(),
      instabilityBlue: blue.instability.slice(),
      instabilityRed: red.instability.slice(),
      potentialBlue: blue.potential.slice(),
      potentialRed: red.potential.slice(),
      collapseBlue: blue.collapse.slice(),
      collapseRed: red.collapse.slice(),
      cities: cloneCities(this.cities),
    };
  }

  restoreState(state: SimulationState): void {
    assertStateDimensions(state, this.width, this.height);
    const blue = this.side('blue');
    const red = this.side('red');
    this.stepCount = state.step;
    this.time = state.gameTime;
    this.cities.splice(0, this.cities.length, ...cloneCities(state.cities));
    this.control.set(state.control);
    blue.war.set(state.warBlue);
    red.war.set(state.warRed);
    blue.committed.set(state.committedBlue);
    red.committed.set(state.committedRed);
    blue.instability.set(state.instabilityBlue);
    red.instability.set(state.instabilityRed);
    blue.potential.set(state.potentialBlue);
    red.potential.set(state.potentialRed);
    blue.collapse.set(state.collapseBlue);
    red.collapse.set(state.collapseRed);
    this.clearDerivedFields();
  }

  private side(side: Side): SideFields {
    return requireSide(this.sides, side);
  }

  private clearDerivedFields(): void {
    const derived: Float32Array[] = [
      this.forcing,
      this.frontConsumption,
      this.rawForcingDebug,
      this.pressureDebug,
      this.tmpControl,
    ];
    for (const sideId of CURRENT_SIDE_IDS) {
      const side = this.side(sideId);
      derived.push(
        side.flow.x,
        side.flow.y,
        side.need,
        side.mass,
        side.commitmentTarget,
        side.availableMass,
        side.incoming,
        side.delta,
        side.drain,
        side.advanceDebug,
        side.stressDebug,
      );
    }
    clearArrays(derived);
  }

  private computeStats(): SimulationStats {
    const blue = this.side('blue');
    const red = this.side('red');
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
      maxInstabilityBlue = Math.max(maxInstabilityBlue, blue.instability[i]);
      maxInstabilityRed = Math.max(maxInstabilityRed, red.instability[i]);
      collapseBlueCells += blue.collapse[i];
      collapseRedCells += red.collapse[i];
      totalWarBlue += blue.war[i];
      totalWarRed += red.war[i];
      activeFlowBlue += Math.hypot(blue.flow.x[i], blue.flow.y[i]);
      activeFlowRed += Math.hypot(red.flow.x[i], red.flow.y[i]);
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

  private isBlocked(index: number): boolean {
    return this.terrainBlocked[index] !== 0;
  }

  private initializeControl(): void {
    if (this.map.initialControl === 'city-distance') {
      initializeControlFromCities(this.control, this.width, this.height, this.terrainBlocked, this.cities);
      return;
    }

    if (!this.map.initialFrontX) throw new Error('Map must define initialFrontX or initialControl');
    for (let y = 0; y < this.height; y++) {
      const frontX = this.map.initialFrontX(y);
      for (let x = 0; x < this.width; x++) {
        this.control[this.index(x, y)] = Math.tanh((frontX - x) / 2.4);
      }
    }
  }

  private initializeTerrain(): void {
    this.terrainDefense.fill(1);
    this.terrainMobility.fill(1);
    this.terrainCapacity.fill(1);

    const river = rasterizeRivers(this.width, this.height, this.map.rivers);
    this.riverCrossingX.set(river.crossingX);
    this.riverCrossingY.set(river.crossingY);

    for (const forest of this.map.forests) {
      const minX = Math.max(0, Math.floor(forest.x - forest.r * 1.25));
      const maxX = Math.min(this.width - 1, Math.ceil(forest.x + forest.r * 1.25));
      const minY = Math.max(0, Math.floor(forest.y - forest.r));
      const maxY = Math.min(this.height - 1, Math.ceil(forest.y + forest.r));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (pointInTerrainRegion(x + 0.5, y + 0.5, forest)) {
            this.terrainForest[this.index(x, y)] = 1;
          }
        }
      }
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const terrain = this.map.terrainAt?.(x, y) ?? 'open';
        if (terrain !== 'open') {
          this.terrainBlocked[i] = 1;
          this.terrainMobility[i] = 0;
          this.terrainCapacity[i] = 0;
          continue;
        }

        const riverStrength = river.strength[i];
        if (riverStrength > 0) {
          this.terrainDefense[i] *= 1 + 0.20 * riverStrength;
          this.terrainMobility[i] *= 1 - 0.42 * riverStrength;
          this.terrainCapacity[i] *= 1 - 0.40 * riverStrength;
        }

        if (this.terrainForest[i]) {
          this.terrainDefense[i] *= 1.55;
          this.terrainMobility[i] *= 0.30;
          this.terrainCapacity[i] *= 0.42;
        }
      }
    }
  }

  private seedInitialResource(): void {
    for (const city of this.cities) {
      const i = this.index(city.x, city.y);
      if (this.isBlocked(i)) continue;
      this.side(city.owner).war[i] += city.baseProduction * CFG.initialCityResourceSeconds;
    }

    const blue = this.side('blue');
    const red = this.side('red');
    for (let i = 0; i < this.size; i++) {
      if (this.isBlocked(i)) continue;
      const control = this.control[i];
      const proximity = Math.max(0, 1 - Math.abs(control) / 0.82);
      if (proximity <= 0) continue;
      const amount = CFG.initialFrontResource * proximity;
      (control >= 0 ? blue : red).war[i] += amount;
    }
  }

  private sideAccess(side: Side, index: number): number {
    if (this.isBlocked(index)) return 0;
    return sideAccess(side, this.control[index]);
  }

  private isFront(index: number): boolean {
    if (this.isBlocked(index)) return false;
    const control = this.control[index];
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    if (Math.abs(control) <= CFG.frontBand) return true;
    if (x > 0 && !this.isBlocked(index - 1) && control * this.control[index - 1] <= 0) return true;
    if (x + 1 < this.width && !this.isBlocked(index + 1) && control * this.control[index + 1] <= 0) return true;
    if (y > 0 && !this.isBlocked(index - this.width) && control * this.control[index - this.width] <= 0) return true;
    if (y + 1 < this.height && !this.isBlocked(index + this.width) && control * this.control[index + this.width] <= 0) return true;
    return false;
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
    computePairCommitment(
      this.side('blue'),
      this.side('red'),
      {
        width: this.width,
        height: this.height,
        radius: CFG.massRadius,
        terrainDefense: this.terrainDefense,
        isFront: (index) => this.isFront(index),
        firstAccess: (index) => this.sideAccess('blue', index),
        secondAccess: (index) => this.sideAccess('red', index),
      },
      CFG,
    );
  }

  private transportGrid(side: Side) {
    return {
      width: this.width,
      height: this.height,
      terrainMobility: this.terrainMobility,
      terrainCapacity: this.terrainCapacity,
      isFront: (index: number) => this.isFront(index),
      access: (index: number) => this.sideAccess(side, index),
      edgeFactor: (x: number, y: number, dx: number, dy: number) => this.edgeFactor(x, y, dx, dy),
    };
  }

  private rebuildPotential(side: Side): void {
    rebuildPotential(this.side(side), this.transportGrid(side), CFG);
  }

  private transportResource(side: Side): void {
    transportResource(this.side(side), this.transportGrid(side), CFG);
  }

  private resolveCombatAndInstability(): void {
    this.frontConsumption.fill(0);
    resolvePairCombat(
      this.side('blue'),
      this.side('red'),
      {
        forcing: this.forcing,
        rawForcing: this.rawForcingDebug,
        pressure: this.pressureDebug,
      },
      {
        width: this.width,
        height: this.height,
        terrainDefense: this.terrainDefense,
        isFront: (index) => this.isFront(index),
        addConsumption: (x, y, intensity) => this.accumulateFrontConsumption(x, y, intensity),
      },
      this.time,
      this.seed,
      CFG,
    );
    for (const side of CURRENT_SIDE_IDS) {
      applyFrontConsumption(this.side(side), this.frontConsumption, CFG.dt);
    }
  }

  private accumulateFrontConsumption(x: number, y: number, combatIntensity: number): void {
    const ratePerSecond = CFG.maintenanceRate + CFG.combatConsumptionRate * combatIntensity;
    const radius = CFG.massRadius;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= this.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= this.width) continue;
        const i = this.index(xx, yy);
        if (this.isBlocked(i)) continue;
        const weight = 1 / (1 + Math.hypot(dx, dy));
        this.frontConsumption[i] += ratePerSecond * weight;
      }
    }
  }

  private updateControl(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const control = this.control[i];
        if (this.isBlocked(i)) {
          this.tmpControl[i] = control;
          continue;
        }

        const leftIndex = i - 1;
        const rightIndex = i + 1;
        const upIndex = i - this.width;
        const downIndex = i + this.width;
        const hasLeft = x > 0 && !this.isBlocked(leftIndex);
        const hasRight = x + 1 < this.width && !this.isBlocked(rightIndex);
        const hasUp = y > 0 && !this.isBlocked(upIndex);
        const hasDown = y + 1 < this.height && !this.isBlocked(downIndex);
        const wl = hasLeft ? this.edgeFactor(x, y, -1, 0) : 0;
        const wr = hasRight ? this.edgeFactor(x, y, 1, 0) : 0;
        const wu = hasUp ? this.edgeFactor(x, y, 0, -1) : 0;
        const wd = hasDown ? this.edgeFactor(x, y, 0, 1) : 0;
        const left = hasLeft ? this.control[leftIndex] : control;
        const right = hasRight ? this.control[rightIndex] : control;
        const up = hasUp ? this.control[upIndex] : control;
        const down = hasDown ? this.control[downIndex] : control;
        const weightSum = wl + wr + wu + wd + EPS;
        const lap = (wl * left + wr * right + wu * up + wd * down) - weightSum * control;
        const interfaceWeight = Math.max(0, 1 - control * control);
        const mobility = this.terrainMobility[i];
        const smoothing = CFG.controlSmooth * lap * mobility;
        const restoring = CFG.controlRestore * control * interfaceWeight;
        const forcing = CFG.controlForce * this.forcing[i] * interfaceWeight * mobility;
        this.tmpControl[i] = clamp(
          control + (smoothing + restoring + forcing) * CFG.dt,
          -CFG.controlClamp,
          CFG.controlClamp,
        );
      }
    }
    this.control.set(this.tmpControl);
  }
}
