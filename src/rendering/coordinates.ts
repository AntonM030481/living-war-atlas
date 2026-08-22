export interface Point {
  x: number;
  y: number;
}

export interface ViewTransform {
  canvasRect: DOMRect;
  worldX: number;
  worldY: number;
  scaleX: number;
  scaleY: number;
}

export function worldToScreen(point: Point, transform: ViewTransform): Point {
  return {
    x: transform.canvasRect.left + transform.worldX + point.x * transform.scaleX,
    y: transform.canvasRect.top + transform.worldY + point.y * transform.scaleY,
  };
}

export function clientToWorld(clientX: number, clientY: number, transform: ViewTransform): Point {
  return {
    x: (clientX - transform.canvasRect.left - transform.worldX) / transform.scaleX,
    y: (clientY - transform.canvasRect.top - transform.worldY) / transform.scaleY,
  };
}
