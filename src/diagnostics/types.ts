export interface Point {
  x: number;
  y: number;
}

export interface FrontDebugInfo extends Point {
  index: number;
  distance: number;
  radius: number;
  control: number;
  warBlue: number;
  warRed: number;
  frontMassBlue: number;
  frontMassRed: number;
  incomingBlue: number;
  incomingRed: number;
  drainBlue: number;
  drainRed: number;
  advanceBlue: number;
  advanceRed: number;
  stressBlue: number;
  stressRed: number;
  rawForcing: number;
  forcing: number;
  pressure: number;
  instabilityBlue: number;
  instabilityRed: number;
  terrainDefense: number;
  terrainMobility: number;
  flowBlue: number;
  flowRed: number;
  localWarBlue: number;
  localWarRed: number;
  localDrainBlue: number;
  localDrainRed: number;
}

export interface CityDiagnostic {
  cityName: string;
  production: number;
  cellWar: number;
  localWar: number;
  cellFlow: number;
  localFlow: number;
  weak: boolean;
}
