/**
 * The view of a cube drawn as it stands rather than played (the assisted solve's): turned under the pointer, put back,
 * its front face marked, with the same calls as `AlgPlayer` so both renderers' view buttons and mark take either.
 */
import { cubeFace, cubeOrientation, turnCube, type CubeOrientation } from "../../shared/cubeScene";

/** The face held in front, in cube axes, and how long `showFront` marks it. */
const FRONT = [0, 0, 1], FRONT_PULSE_MS = 2200;

// ponytail: mirrors AlgPlayer's view half; AlgPlayer can extend this once nobody else is editing it.
export class CubeView {
  orientation: CubeOrientation;
  private home: CubeOrientation;
  private listeners = new Set<() => void>();
  private pulseStart = 0;
  private pulseFrame = 0;
  constructor(readonly size = 3) {
    this.home = this.orientation = cubeOrientation();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  rotate = (across: number, down = 0) => {
    this.orientation = turnCube(this.orientation, across, down);
    this.emit();
  };
  /** Shown as a cube with a gyroscope is held: that is the view to come back to. */
  hold = (orientation: CubeOrientation) => {
    this.home = this.orientation = orientation;
    this.emit();
  };
  resetView = () => {
    this.orientation = this.home;
    this.emit();
  };
  showFront = () => {
    if (!cubeFace(this.size, FRONT, this.orientation).seen) this.orientation = this.home;
    this.pulseStart = Date.now();
    if (this.pulseFrame) cancelAnimationFrame(this.pulseFrame);
    const tick = () => {
      this.emit();
      this.pulseFrame = Date.now() - this.pulseStart < FRONT_PULSE_MS ? requestAnimationFrame(tick) : 0;
    };
    tick();
  };
  pulse = () => {
    const t = (Date.now() - this.pulseStart) / FRONT_PULSE_MS;
    if (!this.pulseStart || t >= 1) return null;
    const face = cubeFace(this.size, FRONT, this.orientation);
    return face.seen ? { ...face, t } : null;
  };
  turned = () => this.orientation !== this.home;
  dispose = () => {
    if (this.pulseFrame) cancelAnimationFrame(this.pulseFrame);
    this.pulseFrame = 0;
    this.listeners.clear();
  };
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
