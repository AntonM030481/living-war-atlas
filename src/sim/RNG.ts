export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x12345678;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }

  signed(): number {
    return this.next() * 2 - 1;
  }
}
