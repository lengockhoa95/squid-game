export const DRAG_THRESHOLD_PX = 5;

export type RightGesture = 'tap' | 'drag';

/** A right-button press that moved more than the threshold rotates the camera; otherwise it means "stop". */
export function classifyRightGesture(totalDx: number, totalDy: number): RightGesture {
  return Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD_PX ? 'drag' : 'tap';
}

/**
 * Convert keyboard axes (forward/right in -1..1) to a world XZ direction relative to the camera.
 * Camera yaw convention: the camera sits at target + (sin(yaw), cos(yaw)) * distance, looking at the target.
 */
export function keyboardToWorldDir(fwd: number, right: number, camYaw: number, out: { x: number; z: number }): void {
  const s = Math.sin(camYaw);
  const c = Math.cos(camYaw);
  // forward = (-s, -c), right = (c, -s)
  let x = -s * fwd + c * right;
  let z = -c * fwd - s * right;
  const len = Math.hypot(x, z);
  if (len < 1e-6) {
    out.x = 0;
    out.z = 0;
    return;
  }
  x /= len;
  z /= len;
  out.x = x;
  out.z = z;
}
