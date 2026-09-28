/**
 * The background of the desktop layout: one WebGL canvas behind the app that draws, for the pane under the
 * mouse, a fine grid aligned to that pane's own top-left corner, lit around the cursor in the accent colour.
 * The other panes stay clean. It only draws when something changes: the mouse, a fade, a resize, the theme.
 */
import { useEffect, useRef, useState } from "react";

/** The panes that own a grid. `data-grid` may carry the cell size in CSS pixels. */
const BOXES = [
  "[data-grid]",
  ".page-head",
  ".prompt",
  ".cube-box",
  ".timer",
  ".metrics > .metric",
  ".column-right",
  ".md-list",
  ".md-detail",
  ".setup-modes",
  ".setup-detail",
  ".ov-card",
  ".profile-main .panel",
].join(",");
const CELL = 24;
/** Rows as tall as the page header split into four. */
const ROW_CELL = 16;
const GLOW = 220;
const FADE_MS = 240;
const MAX = 6;

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uGlow;
uniform float uDpr;
uniform float uTrack;
uniform int uCount;
uniform vec4 uRect[${MAX}];
uniform vec4 uParam[${MAX}];
uniform vec4 uLine;
uniform vec3 uAccent;
uniform vec3 uLevels;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec4 color = vec4(0.0);
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec4 q = uParam[i];
    vec2 l = p - r.xy;
    if (l.x < 0.0 || l.y < 0.0 || l.x > r.z || l.y > r.w) continue;
    float radius = q.z;
    if (radius > 0.0 && length(l - clamp(l, vec2(radius), r.zw - vec2(radius))) > radius) continue;
    // The last device pixel of every cell, like the 1px borders of the layout.
    vec2 m = mod(floor(l), q.y);
    vec2 on = step(q.y - uDpr, m);
    float line = max(on.x, on.y);
    float cross = on.x * on.y;
    vec2 centre = mix(r.xy + r.zw * 0.5, uMouse, uTrack);
    float d = distance(p, centre) / uGlow;
    float g = exp(-d * d * 3.0);
    float a = q.x * q.w;
    float lineAlpha = a * line * (uLine.a * uLevels.x + uLevels.y * g * (1.0 + cross * 0.8));
    vec3 lineColor = mix(uLine.rgb, uAccent, clamp(g * 1.4, 0.0, 1.0));
    float fillAlpha = a * g * uLevels.z;
    vec4 fill = vec4(uAccent * fillAlpha, fillAlpha);
    vec4 grid = vec4(lineColor * min(lineAlpha, 1.0), min(lineAlpha, 1.0));
    color = grid + fill * (1.0 - grid.a);
  }
  gl_FragColor = color;
}`;

type Box = { a: number; target: number };
type Rgba = [number, number, number, number];

class Grid {
  private boxes = new Map<Element, Box>();
  private hovered: Element | null = null;
  private mouse = { x: -1e5, y: -1e5 };
  private frame = 0;
  private last = 0;
  private settleUntil = 0;
  private paused = false;
  private line: Rgba = [1, 1, 1, 0.1];
  private accent: Rgba = [0.3, 0.5, 1, 1];
  private light = false;
  private dpr = 1;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private u: Record<string, WebGLUniformLocation | null> = {};

  static create(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return null;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    return new Grid(canvas, gl, program);
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGLRenderingContext,
    program: WebGLProgram,
  ) {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of ["uRes", "uMouse", "uGlow", "uDpr", "uTrack", "uCount", "uRect", "uParam", "uLine", "uAccent", "uLevels"])
      this.u[name] = gl.getUniformLocation(program, name);
    addEventListener("pointermove", this.move, { passive: true });
    addEventListener("pointerdown", this.move, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.leave);
    addEventListener("blur", this.leave);
    addEventListener("resize", this.resize);
    this.reduced.addEventListener("change", this.poke);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    removeEventListener("pointermove", this.move);
    removeEventListener("pointerdown", this.move);
    document.documentElement.removeEventListener("pointerleave", this.leave);
    removeEventListener("blur", this.leave);
    removeEventListener("resize", this.resize);
    this.reduced.removeEventListener("change", this.poke);
  }

  /** Reads the theme from the custom properties of the app. */
  colors() {
    const style = getComputedStyle(this.canvas.parentElement!);
    this.line = rgba(style.getPropertyValue("--line"));
    this.accent = rgba(style.getPropertyValue("--accent"));
    this.light = this.canvas.parentElement!.classList.contains("light");
    this.schedule();
  }

  pause(paused: boolean) {
    this.paused = paused;
    if (paused) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.hovered = null;
      this.boxes.clear();
      this.clear();
    } else this.poke();
  }

  /** The layout may have moved (a page slides in, a pane opens): follow it for the length of a transition. */
  poke = () => {
    if (this.paused) return;
    this.settleUntil = performance.now() + 360;
    this.schedule();
  };

  private move = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    this.mouse = { x: e.clientX, y: e.clientY };
    this.schedule();
  };

  private leave = () => {
    this.mouse = { x: -1e5, y: -1e5 };
    this.schedule();
  };

  private resize = () => {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.schedule();
  };

  private schedule() {
    if (!this.paused && !this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  /** The pane under the mouse, if it belongs to the app itself rather than a dialog above it. */
  private pick() {
    const target = document.elementFromPoint(this.mouse.x, this.mouse.y);
    const box = target?.closest(BOXES) ?? null;
    return box && box.closest(".shell") && !box.closest("[data-exiting]") ? box : null;
  }

  private tick = (now: number) => {
    this.frame = 0;
    const step = this.reduced.matches ? 1 : Math.min(now - (this.last || now - 16), 64) / FADE_MS;
    this.last = now;
    const hovered = this.pick();
    if (hovered !== this.hovered) {
      if (this.hovered) this.boxes.get(this.hovered)!.target = 0;
      if (hovered) {
        const box = this.boxes.get(hovered) ?? { a: 0, target: 1 };
        box.target = 1;
        this.boxes.set(hovered, box);
      }
      this.hovered = hovered;
    }
    let moving = false;
    for (const [element, box] of this.boxes) {
      box.a = box.target > box.a ? Math.min(box.target, box.a + step) : Math.max(box.target, box.a - step);
      if (box.a !== box.target) moving = true;
      else if (!box.a || !element.isConnected) this.boxes.delete(element);
    }
    this.draw();
    if (moving || now < this.settleUntil) this.schedule();
    else this.last = 0;
  };

  private clear() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private draw() {
    const { gl, u, dpr } = this;
    this.clear();
    const rects: number[] = [];
    const params: number[] = [];
    for (const [element, box] of this.boxes) {
      if (rects.length / 4 >= MAX) break;
      const r = element.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(element);
      const cell = Number((element as HTMLElement).dataset.grid) || (Math.round(r.height) === 64 ? ROW_CELL : CELL);
      const eased = box.a * box.a * (3 - 2 * box.a);
      rects.push(Math.round(r.left * dpr), Math.round(r.top * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr));
      // A small box sits whole inside the glow: keep it quieter than a large pane.
      const strength = Math.min(1, Math.max(0.55, Math.sqrt(r.width * r.height) / 400));
      params.push(eased, Math.round(cell * dpr), (parseFloat(style.borderTopLeftRadius) || 0) * dpr, strength);
    }
    const count = rects.length / 4;
    if (!count) return;
    while (rects.length < MAX * 4) rects.push(0), params.push(0);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uMouse, this.mouse.x * dpr, this.mouse.y * dpr);
    gl.uniform1f(u.uGlow, GLOW * dpr);
    gl.uniform1f(u.uDpr, Math.max(1, Math.round(dpr)));
    gl.uniform1f(u.uTrack, this.reduced.matches ? 0 : 1);
    gl.uniform1i(u.uCount, count);
    gl.uniform4fv(u.uRect, rects);
    gl.uniform4fv(u.uParam, params);
    gl.uniform4f(u.uLine, this.line[0], this.line[1], this.line[2], this.line[3]);
    gl.uniform3f(u.uAccent, this.accent[0], this.accent[1], this.accent[2]);
    // Resting lines (a share of the layout's own lines), extra line alpha and accent wash under the cursor.
    gl.uniform3fv(u.uLevels, this.light ? [0.5, 0.36, 0.06] : [0.5, 0.5, 0.08]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/** Any CSS colour as 0–1 sRGB channels and alpha, resolved by the browser. */
const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
function rgba(value: string): Rgba {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value.trim() || "#000";
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

/** Mounted inside `.app`, under the shell. Renders nothing where WebGL is missing. */
export function GridBackdrop({ paused, theme }: { paused: boolean; theme: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const grid = useRef<Grid | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = ref.current!;
    const created = Grid.create(canvas);
    if (!created) return setFailed(true);
    grid.current = created;
    const lost = () => setFailed(true);
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      created.destroy();
      grid.current = null;
    };
  }, []);
  useEffect(() => grid.current?.colors(), [theme]);
  useEffect(() => grid.current?.pause(paused), [paused]);
  // Every store change may move the panes (navigation, dialogs, a list opening).
  useEffect(() => grid.current?.poke());
  return failed ? null : <canvas ref={ref} className="grid-backdrop" aria-hidden="true" />;
}
