import type { City, SimulationStats } from './types';
import type { SideFields } from './sides';

export function computeSimulationStats(
  size: number,
  cities: readonly City[],
  blue: SideFields,
  red: SideFields,
  isFront: (index: number) => boolean,
): SimulationStats {
  let frontCells = 0;
  let maxInstabilityBlue = 0;
  let maxInstabilityRed = 0;
  let collapseBlueCells = 0;
  let collapseRedCells = 0;
  let totalWarBlue = 0;
  let totalWarRed = 0;
  let activeFlowBlue = 0;
  let activeFlowRed = 0;

  for (let i = 0; i < size; i++) {
    if (isFront(i)) frontCells += 1;
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

  for (const city of cities) {
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
