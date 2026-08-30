import { CFG, type Side } from './Config';
import type { City, MapDefinition, RegionId, SimulationSnapshot, SimulationState } from './types';
import { applyFrontConsumption, resolvePairCombat } from './combat';
import { computePairCommitment } from './commitment';
import {
  flipCityOwner,
  generateCityResource,
  setCityEnabled,
  setCityOwner,
  toggleCityEnabled,
  updateCities,
} from './cities';
import { updateControlField } from './control';
import { initializeControl } from './initialControl';
import { seedInitialResource } from './initialResource';
import { RegionTopology } from './regions';
import {
  assertStateDimensions,
  clearDerivedFields,
  cloneCities,
  restoreSimulationFields,
} from './state';
import {
  CURRENT_SIDE_IDS,
  createSideFieldMap,
  requireSide,
  type SideFieldMap,
  type SideFields,
} from './sides';
import { computeSimulationStats } from './stats';
import { initializeTerrainFields } from './terrain';
import { SimulationTopology } from './topology';
import { rebuildPotential, transportResource } from './transport';

export interface SimulationInitialization {
  initializeControl?: boolean;
  seedInitialResource?: boolean;
}

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
  private readonly regions: RegionTopology;
  private readonly topology: SimulationTopology;

  private stepCount = 0;
  private time = 0;
  private potentialDirty = true;

  constructor(
    private readonly map: MapDefinition,
    private readonly seed: number,
    initialization: SimulationInitialization = {},
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

    initializeTerrainFields(this.map, {
      defense: this.terrainDefense,
      mobility: this.terrainMobility,
      capacity: this.terrainCapacity,
      blocked: this.terrainBlocked,
      forest: this.terrainForest,
      riverCrossingX: this.riverCrossingX,
      riverCrossingY: this.riverCrossingY,
    });
    this.regions = new RegionTopology(this.map);
    this.topology = new SimulationTopology({
      width: this.width,
      height: this.height,
      control: this.control,
      blocked: this.terrainBlocked,
      riverCrossingX: this.riverCrossingX,
      riverCrossingY: this.riverCrossingY,
    }, this.regions);

    if (initialization.initializeControl !== false) {
      initializeControl(this.control, this.map, this.terrainBlocked, this.cities);
    }
    if (initialization.seedInitialResource !== false && this.map.seedInitialResource !== false) {
      seedInitialResource(this.cities, this.width, this.control, this.terrainBlocked, this.sides);
    }
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

  setCityEnabled(cityId: string, enabled: boolean): void {
    setCityEnabled(this.cities, cityId, enabled);
  }

  setCityOwner(cityId: string, owner: Side, integration = 1): void {
    setCityOwner(this.cities, cityId, owner, integration);
  }

  flipCityOwner(cityId: string): void {
    flipCityOwner(this.cities, cityId);
  }

  regionIdAt(x: number, y: number): RegionId | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.regions.regionIdAt(y * this.width + x);
  }

  regionNeighbors(regionId: RegionId): readonly RegionId[] {
    return this.regions.neighbors(regionId);
  }

  setRegionBorderOpen(first: RegionId, second: RegionId, open: boolean): void {
    if (this.regions.setBorderOpen(first, second, open)) this.potentialDirty = true;
  }

  isRegionBorderOpen(first: RegionId, second: RegionId): boolean {
    return this.regions.isBorderOpen(first, second);
  }

  initializeRegionalControl(regionOwners: readonly (readonly [RegionId, Side])[]): void {
    const ownerByRegion = new Map<RegionId, Side>(regionOwners);
    for (let i = 0; i < this.size; i++) {
      if (this.terrainBlocked[i]) {
        this.control[i] = 0;
        continue;
      }
      const regionId = this.regions.regionIdAt(i);
      if (regionId === null) {
        this.control[i] = 0;
        continue;
      }
      const owner = ownerByRegion.get(regionId);
      if (!owner) throw new Error(`Missing owner for region ${regionId}`);
      this.control[i] = owner === 'blue' ? 1 : -1;
    }
    this.potentialDirty = true;
  }

  tick(): void {
    updateCities(this.cities, this.control, this.width, {
      captureThreshold: CFG.cityCaptureThreshold,
      integrationPerSecond: CFG.cityIntegrationPerSecond,
      dt: CFG.dt,
    });
    generateCityResource(this.cities, this.width, this.sides, CFG.dt);
    this.computeFrontMassAndNeed();

    if (this.potentialDirty || this.stepCount % CFG.potentialEverySteps === 0) {
      for (const side of CURRENT_SIDE_IDS) this.rebuildPotential(side);
      this.potentialDirty = false;
    }
    for (const side of CURRENT_SIDE_IDS) this.transportResource(side);

    this.resolveCombatAndInstability();
    updateControlField(this.control, this.tmpControl, this.forcing, {
      width: this.width,
      height: this.height,
      terrainMobility: this.terrainMobility,
      isBlocked: (index) => this.topology.isBlocked(index),
      edgeFactor: (x, y, dx, dy) => this.topology.edgeFactor(x, y, dx, dy),
    });
    this.stepCount += 1;
    this.time += CFG.dt;
  }

  snapshot(): SimulationSnapshot {
    this.computeFrontMassAndNeed();
    const blue = this.side('blue');
    const red = this.side('red');
    const frontMask = this.actualFrontMask();
    return {
      width: this.width,
      height: this.height,
      step: this.stepCount,
      gameTime: this.time,
      stats: computeSimulationStats(this.size, this.cities, blue, red, (index) => frontMask[index] !== 0),
      control: this.control.slice(),
      frontMask,
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
      openRegionBorders: this.regions.openBorders(),
    };
  }

  restoreState(state: SimulationState): void {
    assertStateDimensions(state, this.width, this.height);
    this.stepCount = state.step;
    this.time = state.gameTime;
    this.regions.restoreOpenBorders(state.openRegionBorders ?? []);
    restoreSimulationFields(state, this.cities, this.control, this.sides);
    clearDerivedFields(this.sides, [
      this.forcing,
      this.frontConsumption,
      this.rawForcingDebug,
      this.pressureDebug,
      this.tmpControl,
    ]);
    this.potentialDirty = false;
  }

  private side(side: Side): SideFields {
    return requireSide(this.sides, side);
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private actualFrontMask(): Uint8Array {
    const mask = new Uint8Array(this.size);
    for (let i = 0; i < this.size; i++) {
      if (this.topology.isFront(i)) mask[i] = 1;
    }
    return mask;
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
        isFront: (index) => this.topology.isFront(index),
        firstAccess: (index) => this.topology.sideAccess('blue', index),
        secondAccess: (index) => this.topology.sideAccess('red', index),
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
      isFront: (index: number) => this.topology.isFront(index),
      potentialDemand: (index: number) => this.topology.potentialDemand(index),
      access: (index: number) => this.topology.sideAccess(side, index),
      edgeFactor: (x: number, y: number, dx: number, dy: number) => this.topology.edgeFactor(x, y, dx, dy),
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
        isFront: (index) => this.topology.isFront(index),
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
        if (this.topology.isBlocked(i)) continue;
        const weight = 1 / (1 + Math.hypot(dx, dy));
        this.frontConsumption[i] += ratePerSecond * weight;
      }
    }
  }
}
