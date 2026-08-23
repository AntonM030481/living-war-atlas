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
  canvasScaleX: number;
  canvasScaleY: number;
}

export function worldToScreen(point: Point, transform: ViewTransform): Point {
  return {
    x:
      transform.canvasRect.left +
      (transform.worldX + point.x * transform.scaleX) * transform.canvasScaleX,
    y:
      transform.canvasRect.top +
      (transform.worldY + point.y * transform.scaleY) * transform.canvasScaleY,
  };
}

export function clientToWorld(clientX: number, clientY: number, transform: ViewTransform): Point {
  return {
    x:
      ((clientX - transform.canvasRect.left) / transform.canvasScaleX - transform.worldX) /
      transform.scaleX,
    y:
      ((clientY - transform.canvasRect.top) / transform.canvasScaleY - transform.worldY) /
      transform.scaleY,
  };
}
