import type { City } from './types';
import type { Side } from './Config';

const INF = Number.POSITIVE_INFINITY;
const SQRT2 = Math.SQRT2;
const SMOOTH_PASSES = 8;

interface HeapNode {
  index: number;
  distance: number;
}

class MinHeap {
  private readonly items: HeapNode[] = [];

  get length(): number { return this.items.length; }

  push(node: HeapNode): void {
    const items = this.items;
    items.push(node);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].distance <= node.distance) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = node;
  }

  pop(): HeapNode | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const root = items[0];
    const tail = items.pop()!;
    if (items.length === 0) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= items.length) break;
      const right = left + 1;
      const child = right < items.length && items[right].distance < items[left].distance ? right : left;
      if (items[child].distance >= tail.distance) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = tail;
    return root;
  }
}

function distancesFromCities(
  width: number,
  height: number,
  blocked: Uint8Array,
  cities: City[],
  side: Side,
): Float64Array {
  const size = width * height;
  const distance = new Float64Array(size);
  distance.fill(INF);
  const heap = new MinHeap();

  for (const city of cities) {
    if (city.owner !== side) continue;
    const index = city.y * width + city.x;
    if (blocked[index] || distance[index] === 0) continue;
    distance[index] = 0;
    heap.push({ index, distance: 0 });
  }

  while (heap.length > 0) {
    const current = heap.pop()!;
    if (current.distance !== distance[current.index]) continue;

    const x = current.index % width;
    const y = Math.floor(current.index / width);

    const visit = (nx: number, ny: number, cost: number): void => {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
      const next = ny * width + nx;
      if (blocked[next]) return;

      // Do not let a diagonal path squeeze through the touching corners of
      // impassable cells; mountain and sea geometry should remain solid.
      if (nx !== x && ny !== y) {
        if (blocked[y * width + nx] || blocked[ny * width + x]) return;
      }

      const nextDistance = current.distance + cost;
      if (nextDistance >= distance[next]) return;
      distance[next] = nextDistance;
      heap.push({ index: next, distance: nextDistance });
    };

    visit(x - 1, y, 1);
    visit(x + 1, y, 1);
    visit(x, y - 1, 1);
    visit(x, y + 1, 1);
    visit(x - 1, y - 1, SQRT2);
    visit(x + 1, y - 1, SQRT2);
    visit(x - 1, y + 1, SQRT2);
    visit(x + 1, y + 1, SQRT2);
  }

  return distance;
}

function smoothControl(
  control: Float32Array,
  width: number,
  height: number,
  blocked: Uint8Array,
  cities: City[],
): void {
  const next = new Float32Array(control.length);
  const pinned = new Int8Array(control.length);
  for (const city of cities) pinned[city.y * width + city.x] = city.owner === 'blue' ? 1 : -1;

  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (blocked[i]) {
          next[i] = 0;
          continue;
        }
        if (pinned[i] !== 0) {
          next[i] = pinned[i];
          continue;
        }

        let sum = control[i] * 2;
        let weight = 2;
        const add = (xx: number, yy: number, w: number): void => {
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) return;
          const j = yy * width + xx;
          if (blocked[j]) return;
          if (xx !== x && yy !== y && (blocked[y * width + xx] || blocked[yy * width + x])) return;
          sum += control[j] * w;
          weight += w;
        };

        add(x - 1, y, 1);
        add(x + 1, y, 1);
        add(x, y - 1, 1);
        add(x, y + 1, 1);
        add(x - 1, y - 1, 0.7);
        add(x + 1, y - 1, 0.7);
        add(x - 1, y + 1, 0.7);
        add(x + 1, y + 1, 0.7);
        next[i] = sum / weight;
      }
    }
    control.set(next);
  }
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
    if (!Number.isFinite(blueDistance) && !Number.isFinite(redDistance)) {
      control[i] = 0;
    } else if (!Number.isFinite(blueDistance)) {
      control[i] = -1;
    } else if (!Number.isFinite(redDistance)) {
      control[i] = 1;
    } else {
      control[i] = Math.tanh((redDistance - blueDistance) / 2.4);
    }
  }

  smoothControl(control, width, height, blocked, cities);
}
