/**
 * WebGL background of the desktop layout: when the pointer enters a pane of the grid (a rail cell, a header cell, a
 * pane, a metric…), its outline lights up from the entry point, spreading both ways around the pane behind a bright
 * accent front, and stays brightest near the cursor. Leaving fades the outline out.
 *
 * The canvas paints the page background itself, so the panes above it are transparent. It only draws when
 * something changes (pointer, layout, theme, a fade), pauses during a solve and stays out when WebGL is missing.
 */
import { useEffect, useRef, useState } from "react";

/** The panes that own a lattice. A pixel belongs to the smallest pane containing it. */
const BOXES = [
  ".rail-cell",
  ".page-head",
  ".page-head .control",
  ".page-controls .button",
  ".stage",
  ".prompt",
  ".timer",
  ".cube-box",
  ".pane-toggle",
  ".metrics .metric",
  ".column-right",
  ".md-list-head",
  ".md-list-scroll",
  ".md-detail",
  ".setup-modes",
  ".setup-detail",
  ".setup-cases .setup-pane-head",
  ".ov-card",
  ".profile-main .panel",
].join(",");
/** Panes attached to the pane they sit in (the cube in the timer, a close button…): they light up with it, and it
 * with them. */
const ATTACHED = ".cube-box, .pane-toggle";
/** Attached cells shown only while the pointer is over their own pane: they are panes only then. */
const CELLS = ".pane-toggle";
const MAX = 48;
const RADIUS = 260;
const FADE_MS = 260;
/** Duration of the entry wave: it crosses any pane, small or large, in the same time. */
const WAVE_MS = 500;
/** Width of the wave front over which the outline catches the light. */
const FRONT = 40;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
#define MAX ${MAX}
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uBg;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec2 uMouse;
uniform float uShown; // 1, fading to 0 while a solve runs
uniform float uLine;
uniform int uCount;
uniform vec4 uRect[MAX];
uniform vec4 uInfo[MAX];
uniform vec4 uFill[MAX];
uniform vec4 uWave[MAX]; // entry point, wave radius, wave progress 0…1

float box(vec2 p, vec4 r, float radius) {
  vec2 half_ = (r.zw - r.xy) * 0.5;
  vec2 q = abs(p - (r.xy + r.zw) * 0.5) - half_ + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// Coverage of p by a pane's ring: the 1px band just inside its line rectangle, antialiased on rounded panes.
float ringOf(vec4 r, float radius, vec2 p) {
  float d = box(p, r, radius);
  return radius > 0.0 ? clamp(1.0 - abs(d + 0.5) * 2.0 / (1.0 + 1.0 / uDpr), 0.0, 1.0) : step(-1.0, d) * step(d, 0.0);
}

// The smallest pane containing p, -1 outside every pane.
int owner(vec2 p) {
  int found = -1;
  float area = 1e12;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    float a = (r.z - r.x) * (r.w - r.y);
    if (a < area && box(p, r, uInfo[i].y) < 0.0) { found = i; area = a; }
  }
  return found;
}

// How far the entry wave of a pane has reached p: 1 behind the front, 0 ahead of it.
float reached(vec4 wave, vec2 p) {
  return 1.0 - smoothstep(wave.z - ${FRONT}.0, wave.z, distance(p, wave.xy));
}

// A pane's light at p: its fade, limited to its own ring (not the collinear lines of its neighbours) and to where
// its wave has already been.
float lightOf(int index, vec2 p) {
  float f = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    if (i == index) f = uInfo[i].x * reached(uWave[i], p) * step(0.001, ringOf(uRect[i], uInfo[i].y, p));
  }
  return f;
}

// The bright band of a wave still spreading.
float frontOf(int index, vec2 p) {
  float f = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    if (i == index) {
      vec4 w = uWave[i];
      float d = (distance(p, w.xy) - w.z + ${FRONT}.0 * 0.5) / (${FRONT}.0 * 0.35);
      f = uInfo[i].x * (1.0 - w.w) * exp(-d * d) * step(0.001, ringOf(uRect[i], uInfo[i].y, p));
    }
  }
  return f;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 color = uBg;
  float glow = exp(-pow(distance(p, uMouse) / (${RADIUS}.0 * 0.5), 2.0));
  vec3 ink = mix(uInk, uAccent, 0.35 + 0.45 * glow);

  // Outline lines: the 1px ring just inside a pane's line rectangle, lit by the panes found on either side of it,
  // so a pane never lights a stretch of its ring that runs along other panes.
  float line = 0.0;
  float ring = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    ring = max(ring, ringOf(uRect[i], uInfo[i].y, p));
  }
  float front = 0.0;
  if (ring > 0.0) {
    int a = owner(p), b = owner(p + vec2(2.0, 0.0)), c = owner(p - vec2(2.0, 0.0)), d = owner(p + vec2(0.0, 2.0)), e = owner(p - vec2(0.0, 2.0));
    line = max(max(lightOf(a, p), lightOf(b, p)), max(lightOf(c, p), max(lightOf(d, p), lightOf(e, p))));
    front = max(max(frontOf(a, p), frontOf(b, p)), max(frontOf(c, p), max(frontOf(d, p), frontOf(e, p))));
  }

  // Filled panes (profile cards) get their colour from the canvas, the panes above it being transparent.
  int o = owner(p);
  vec4 fill = vec4(0.0);
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    if (i == o) fill = uFill[i];
  }
  if (o >= 0) color = mix(color, fill.rgb, fill.a * uShown);
  if (ring > 0.0) {
    color = mix(color, ink, ring * line * (0.55 + 0.45 * glow) * uLine);
    color = mix(color, uAccent, ring * min(front, 1.0) * uLine);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

type Box = { el: Element; rect: number[]; radius: number; fill: number[] };

/** Parses any CSS colour through a 2D context into [r, g, b, a] in 0…1. */
function colorParser() {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const cache = new Map<string, number[]>();
  return (value: string) => {
    value = value.trim();
    if (!value) return [0, 0, 0, 0];
    let parsed = cache.get(value);
    if (parsed) return parsed;
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    const s = String(ctx.fillStyle);
    if (s.startsWith("#")) parsed = [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255).concat(1);
    else {
      const [r = 0, g = 0, b = 0, a = 1] = s.slice(s.indexOf("(") + 1, -1).split(",").map(Number);
      parsed = [r / 255, g / 255, b / 255, a];
    }
    cache.set(value, parsed);
    return parsed;
  };
}

function compile(gl: WebGLRenderingContext) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? "program");
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const names = ["uRes", "uDpr", "uBg", "uInk", "uAccent", "uMouse", "uShown", "uLine", "uCount", "uRect", "uInfo", "uFill", "uWave"];
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<string, WebGLUniformLocation>;
}

/** Starts the background on a canvas placed in the app root; returns its teardown, or null without WebGL. */
function start(canvas: HTMLCanvasElement, app: HTMLElement, lost: () => void) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) return null;
  let u: Record<string, WebGLUniformLocation>;
  try {
    u = compile(gl);
  } catch (error) {
    console.warn("Grid background unavailable", error);
    return null;
  }
  const color = colorParser();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let measured: Box[] = [];
  /** The measured panes on screen: attached cells only while their pane is hovered, as the CSS shows them. */
  let boxes: Box[] = [];
  const fades = new Map<Element, number>();
  /** The entry wave of each lit pane: where the pointer came in, when, and how far it has to go. */
  const waves = new Map<Element, { x: number; y: number; start: number; duration: number; reach: number; radius: number; progress: number }>();
  let lit = new Set<Element>();
  let mouse = { x: -1e4, y: -1e4 };
  let running = app.classList.contains("is-running");
  // Everything the canvas adds to the page colour, faded out during a solve.
  let shown = running ? 0 : 1;
  let frame = 0;
  let last = 0;
  let layoutFrames = 0;
  let theme = { bg: [0, 0, 0, 1], ink: [1, 1, 1, 1], accent: [0, 0, 1, 1], light: false };

  const readTheme = () => {
    const style = getComputedStyle(app);
    theme = {
      bg: color(style.getPropertyValue("--bg")),
      ink: color(style.getPropertyValue("--text")),
      accent: color(style.getPropertyValue("--accent")),
      light: app.classList.contains("light"),
    };
  };

  /** Pane rectangles, widened by 1px on the sides where the separating line belongs to the neighbour. */
  const measure = () => {
    const next: Box[] = [];
    for (const el of app.querySelectorAll(BOXES)) {
      if (next.length >= MAX || el.closest("[data-exiting]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const style = getComputedStyle(el);
      const own = (side: string) => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0;
      next.push({
        el,
        // Kept inside the window, so a pane against its edge still lights that side of its outline.
        rect: [
          Math.max(0, r.left - (own("left") ? 0 : 1)),
          Math.max(0, r.top - (own("top") ? 0 : 1)),
          Math.min(innerWidth, r.right + (own("right") ? 0 : 1)),
          Math.min(innerHeight, r.bottom + (own("bottom") ? 0 : 1)),
        ],
        radius: parseFloat(style.borderTopLeftRadius) || 0,
        fill: color(style.getPropertyValue("--grid-fill")),
      });
    }
    measured = next;
  };
  const pick = () => {
    boxes = measured.filter((b) => !b.el.matches(CELLS) || b.el.parentElement?.matches(":hover") || b.el.matches(":focus-visible"));
  };

  /** The pane a pane is attached to, through its attached ancestors; itself when it is not attached. */
  const root = (el: Element): Element => {
    const parent = el.matches(ATTACHED) ? el.parentElement?.closest(BOXES) : null;
    return parent ? root(parent) : el;
  };

  /** The pane under the pointer: the smallest one containing it, as in the shader. */
  const hit = () => {
    let found: Element | null = null,
      area = Infinity;
    for (const b of boxes) {
      const [l, t, r, bt] = b.rect as [number, number, number, number];
      if (mouse.x >= l && mouse.x < r && mouse.y >= t && mouse.y < bt && (r - l) * (bt - t) < area) {
        found = b.el;
        area = (r - l) * (bt - t);
      }
    }
    return running ? null : found;
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr),
      h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  };

  const draw = () => {
    const dpr = resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uRes!, canvas.width, canvas.height);
    gl.uniform1f(u.uDpr!, dpr);
    gl.uniform3fv(u.uBg!, theme.bg.slice(0, 3));
    gl.uniform3fv(u.uInk!, theme.ink.slice(0, 3));
    gl.uniform3fv(u.uAccent!, theme.accent.slice(0, 3));
    gl.uniform2f(u.uMouse!, mouse.x, mouse.y);
    gl.uniform1f(u.uShown!, shown);
    gl.uniform1f(u.uLine!, theme.light ? 0.55 : 0.75);
    const rects = new Float32Array(MAX * 4),
      info = new Float32Array(MAX * 4),
      fills = new Float32Array(MAX * 4),
      spread = new Float32Array(MAX * 4);
    boxes.forEach((b, i) => {
      rects.set(b.rect, i * 4);
      info.set([fades.get(b.el) ?? 0, b.radius, 0, 0], i * 4);
      fills.set(b.fill, i * 4);
      const w = waves.get(b.el);
      spread.set(w ? [w.x, w.y, w.radius, w.progress] : [0, 0, 0, 1], i * 4);
    });
    gl.uniform1i(u.uCount!, boxes.length);
    gl.uniform4fv(u.uRect!, rects);
    gl.uniform4fv(u.uInfo!, info);
    gl.uniform4fv(u.uFill!, fills);
    gl.uniform4fv(u.uWave!, spread);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** One frame: measure while the layout is moving, step the fades, draw, and ask for another only if needed. */
  const tick = (now: number) => {
    frame = 0;
    if (layoutFrames > 0) {
      layoutFrames--;
      measure();
    }
    pick();
    const previous = lit;
    const hot = hit();
    // The pane under the pointer, with every pane attached to the same one.
    const pane = hot && root(hot);
    lit = new Set(pane ? boxes.filter((b) => root(b.el) === pane).map((b) => b.el) : []);
    // Entering a pane starts its wave from the pointer, unless the pane is still lit from a moment ago.
    for (const el of lit) {
      if (previous.has(el) || (fades.get(el) ?? 0) >= 0.05) continue;
      const b = boxes.find((v) => v.el === el)!;
      const [l, t, r, bt] = b.rect as [number, number, number, number];
      const reach = Math.max(Math.hypot(mouse.x - l, mouse.y - t), Math.hypot(mouse.x - r, mouse.y - t), Math.hypot(mouse.x - l, mouse.y - bt), Math.hypot(mouse.x - r, mouse.y - bt)) + FRONT;
      waves.set(el, { x: mouse.x, y: mouse.y, start: now, duration: WAVE_MS, reach, radius: reduced.matches ? reach : 0, progress: reduced.matches ? 1 : 0 });
    }
    const step = reduced.matches || !last ? 1 : Math.min(1, (now - last) / FADE_MS);
    last = now;
    let moving = false;
    for (const [el, w] of waves) {
      if (!fades.has(el) && !lit.has(el)) {
        waves.delete(el);
        continue;
      }
      if (w.progress >= 1) continue;
      const t = Math.min(1, (now - w.start) / w.duration);
      w.progress = t;
      w.radius = w.reach * (1 - Math.pow(1 - t, 3));
      if (t < 1) moving = true;
    }
    for (const b of boxes) {
      const target = lit.has(b.el) ? 1 : 0,
        current = fades.get(b.el) ?? 0,
        value = target > current ? Math.min(target, current + step) : Math.max(target, current - step);
      if (value) fades.set(b.el, value);
      else fades.delete(b.el);
      if (value !== target) moving = true;
    }
    for (const el of fades.keys()) if (!boxes.some((b) => b.el === el)) fades.delete(el);
    for (const el of waves.keys()) if (!boxes.some((b) => b.el === el)) waves.delete(el);
    const shownTarget = running ? 0 : 1;
    shown = shownTarget > shown ? Math.min(shownTarget, shown + step) : Math.max(shownTarget, shown - step);
    if (shown !== shownTarget) moving = true;
    draw();
    if (moving || layoutFrames > 0) request();
    else last = 0;
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const layout = (frames = 1) => {
    layoutFrames = Math.max(layoutFrames, frames);
    request();
  };
  // Menus and dialogs sit above the grid: over them, no pane is lit.
  const pointer = (e: PointerEvent) => {
    if (running || e.pointerType === "touch") return;
    mouse = (e.target as Element).closest?.(".shell") ? { x: e.clientX, y: e.clientY } : { x: -1e4, y: -1e4 };
    request();
  };
  const leave = (e: Event) => {
    if (e.type === "mouseout" && (e as MouseEvent).relatedTarget) return;
    mouse = { x: -1e4, y: -1e4 };
    request();
  };
  // Page transitions and layout animations move panes without resizing them: follow them for a moment.
  // During a solve nothing is measured or drawn once the lattice has faded out.
  const mutations = new MutationObserver((records) => {
    const wasRunning = running;
    if (records.some((r) => r.target === app && r.type === "attributes")) {
      readTheme();
      running = app.classList.contains("is-running");
    }
    if (!running) layout(24);
    else if (!wasRunning) {
      layoutFrames = 0;
      request();
    }
  });
  mutations.observe(app, { attributes: true, attributeFilter: ["class", "style"], childList: true, subtree: true });
  const sizes = new ResizeObserver(() => layout(2));
  sizes.observe(app);
  const contextLost = (e: Event) => {
    e.preventDefault();
    stop();
    lost();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  addEventListener("pointermove", pointer, { passive: true });
  addEventListener("mouseout", leave);
  addEventListener("blur", leave);
  readTheme();
  measure();
  pick();
  draw();
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = -1;
    mutations.disconnect();
    sizes.disconnect();
    canvas.removeEventListener("webglcontextlost", contextLost);
    removeEventListener("pointermove", pointer);
    removeEventListener("mouseout", leave);
    removeEventListener("blur", leave);
  };
  return () => {
    stop();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

/**
 * Full-window canvas behind the app, a direct child of it. `onReady` reports whether it draws, so the app turns
 * its panes transparent only then; without WebGL, or once its context is lost, the canvas goes away and the page
 * keeps its plain background.
 */
export function GridBackground({ onReady }: { onReady: (ready: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fail = () => {
      setFailed(true);
      onReady(false);
    };
    const stop = start(canvas, canvas.parentElement!, fail);
    if (!stop) return fail();
    onReady(true);
    return () => {
      stop();
      onReady(false);
    };
  }, []);
  return failed ? null : <canvas ref={ref} className="grid-canvas" aria-hidden="true" />;
}
