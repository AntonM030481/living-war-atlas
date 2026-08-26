import type { City } from './types';
import type { Side } from './Config';

const INF = 0x3fffffff;

function distancesFromCities(
  width: number,
  height: number,
  blocked: Uint8Array,
  cities: City[],
  side: Side,
): Int32Array {
  const size = width * height;
  const distance = new Int32Array(size);
  distance.fill(INF);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  for (const city of cities) {
    if (city.owner !== side) continue;
    const index = city.y * width + city.x;
    if (blocked[index]) continue;
    if (distance[index] === 0) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const nextDistance = distance[index] + 1;

    const visit = (next: number): void => {
      if (blocked[next] || distance[next] <= nextDistance) return;
      distance[next] = nextDistance;
      queue[tail++] = next;
    };

    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }

  return distance;
}

export function initializeControlFromCities(
  control: Float32Array,
  width: number,
  height: number,
  blocked: Uint8Array,
  cities: City[],
): void {
  const blue = distancesFromCities(width, height, blocked, cities, 'blue');
  const red = distancesFromCities(width, height, blocked, cities, 'red');

  for (let i = 0; i < control.length; i++) {
    if (blocked[i]) {
      control[i] = 0;
      continue;
    }

    const blueDistance = blue[i];
    const redDistance = red[i];
    if (blueDistance === INF && redDistance === INF) {
      control[i] = 0;
    } else if (blueDistance === INF) {
      control[i] = -1;
    } else if (redDistance === INF) {
      control[i] = 1;
    } else {
      control[i] = Math.tanh((redDistance - blueDistance) / 2.4);
    }
  }
}
