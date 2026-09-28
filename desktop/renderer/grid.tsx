/**
 * WebGL background of the desktop layout: every pane of the grid (a rail cell, a page header, a pane, a
 * metric…) owns a lattice of dots, 28px apart from its own top-left corner. At rest the lattice is barely there;
 * the pane under the pointer fades its dots in, brightest around the cursor, and lights its outline lines. Rows
 * of text (`--grid-dots: 0`: rail cells, headers, metrics) only light their outline.
 *
 * The canvas paints the page background itself, so the panes above it are transparent. It only draws when
 * something changes (pointer, layout, theme, a fade), pauses during a solve and stays out when WebGL is missing.
 */
import { useEffect, useRef, useState } from "react";

/** The panes that own a lattice. A pixel belongs to the smallest pane containing it. */
const BOXES = [
  ".rail-cell",
  ".page-head",
  ".stage",
  ".prompt",
  ".cube-box",
  ".metrics .metric",
  ".column-right",
  ".md-list",
  ".md-list-head",
  ".md-detail",
  ".setup-modes",
  ".setup-detail",
  ".setup-cases .setup-pane-head",
  ".ov-card",
  ".profile-main .panel",
].join(",");
/** Panes whose sticky rows copy their lattice in CSS (`.list-group-head`): they get its origin and light level. */
const MIRRORS = ".md-list";
const MAX = 48;
const SPACING = 28;
const RADIUS = 260;
const FADE_MS = 260;

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
uniform float uDot;
uniform float uLine;
uniform int uCount;
uniform vec4 uRect[MAX];
uniform vec4 uInfo[MAX];
uniform vec4 uFill[MAX];

float box(vec2 p, vec4 r, float radius) {
  vec2 half_ = (r.zw - r.xy) * 0.5;
  vec2 q = abs(p - (r.xy + r.zw) * 0.5) - half_ + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
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

float fadeOf(int index) {
  float f = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    if (i == index) f = uInfo[i].x;
  }
  return f;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 color = uBg;
  float glow = exp(-pow(distance(p, uMouse) / (${RADIUS}.0 * 0.5), 2.0));
  vec3 ink = mix(uInk, uAccent, 0.15 + 0.45 * glow);

  // Outline lines: the 1px ring just inside a pane's line rectangle, lit by the panes found on either side of it,
  // so a pane never lights a stretch of its ring that runs along other panes.
  float line = 0.0;
  float ring = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    float d = box(p, uRect[i], uInfo[i].y);
    float r = uInfo[i].y > 0.0 ? clamp(1.0 - abs(d + 0.5) * 2.0 / (1.0 + 1.0 / uDpr), 0.0, 1.0)
                               : step(-1.0, d) * step(d, 0.0);
    ring = max(ring, r);
  }
  if (ring > 0.0) {
    line = max(fadeOf(owner(p)), max(fadeOf(owner(p + vec2(2.0, 0.0))), fadeOf(owner(p - vec2(2.0, 0.0)))));
    line = max(line, max(fadeOf(owner(p + vec2(0.0, 2.0))), fadeOf(owner(p - vec2(0.0, 2.0)))));
  }

  int o = owner(p);
  float fade = 0.0;
  vec4 rect = vec4(0.0);
  vec4 fill = vec4(0.0);
  float radius = 0.0;
  float dots = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    if (i == o) { rect = uRect[i]; fade = uInfo[i].x; radius = uInfo[i].y; dots = uInfo[i].z; fill = uFill[i]; }
  }
  if (o >= 0) {
    color = mix(color, fill.rgb, fill.a * uShown);
    // The faintest wash of the accent around the cursor in the lit pane.
    color = mix(color, uAccent, fade * glow * 0.05);
    vec2 local = p - rect.xy;
    vec2 node = floor(local / ${SPACING}.0 + 0.5) * ${SPACING}.0;
    // Whole cells only: no dot on the outline or hugging the far edges.
    float inside = step(0.5, node.x) * step(0.5, node.y) * step(box(rect.xy + node, rect, radius), -8.0);
    float size = mix(0.75, 1.4, glow * fade);
    float dotShape = 1.0 - smoothstep(size - 0.5 / uDpr, size + 0.5 / uDpr, length(local - node));
    float strength = uShown * 0.1 + fade * (0.15 + 0.85 * glow);
    color = mix(color, ink, dotShape * inside * dots * strength * uDot);
  }
  if (ring > 0.0) color = mix(color, ink, ring * line * (0.25 + 0.75 * glow) * uLine);
  gl_FragColor = vec4(color, 1.0);
}
`;

type Box = { el: Element; rect: number[]; radius: number; dots: number; fill: number[] };

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
  const names = ["uRes", "uDpr", "uBg", "uInk", "uAccent", "uMouse", "uShown", "uDot", "uLine", "uCount", "uRect", "uInfo", "uFill"];
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
  let boxes: Box[] = [];
  const fades = new Map<Element, number>();
  let hot: Element | null = null;
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
        rect: [r.left - (own("left") ? 0 : 1), r.top - (own("top") ? 0 : 1), r.right + (own("right") ? 0 : 1), r.bottom + (own("bottom") ? 0 : 1)],
        radius: parseFloat(style.borderTopLeftRadius) || 0,
        dots: style.getPropertyValue("--grid-dots").trim() === "0" ? 0 : 1,
        fill: color(style.getPropertyValue("--grid-fill")),
      });
    }
    boxes = next;
  };

  /**
   * Sticky rows above a pane's content hide the canvas: they repeat the lattice in CSS from these variables,
   * lined up by a viewport-fixed background, at the pane's current light level.
   */
  const mirrored = new WeakSet<Element>();
  const mirror = () => {
    for (const b of boxes) {
      if (!b.el.matches(MIRRORS)) continue;
      const style = (b.el as HTMLElement).style;
      const set = (name: string, value: string) => style.getPropertyValue(name) !== value && style.setProperty(name, value);
      set("--grid-x", b.rect[0] + "px");
      set("--grid-y", b.rect[1] + "px");
      set("--grid-lit", ((fades.get(b.el) ?? 0) * shown).toFixed(2));
      mirrored.add(b.el);
    }
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
    gl.uniform1f(u.uDot!, theme.light ? 0.6 : 0.85);
    gl.uniform1f(u.uLine!, theme.light ? 0.55 : 0.75);
    const rects = new Float32Array(MAX * 4),
      info = new Float32Array(MAX * 4),
      fills = new Float32Array(MAX * 4);
    boxes.forEach((b, i) => {
      rects.set(b.rect, i * 4);
      info.set([fades.get(b.el) ?? 0, b.radius, b.dots, 0], i * 4);
      fills.set(b.fill, i * 4);
    });
    gl.uniform1i(u.uCount!, boxes.length);
    gl.uniform4fv(u.uRect!, rects);
    gl.uniform4fv(u.uInfo!, info);
    gl.uniform4fv(u.uFill!, fills);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** One frame: measure while the layout is moving, step the fades, draw, and ask for another only if needed. */
  const tick = (now: number) => {
    frame = 0;
    if (layoutFrames > 0) {
      layoutFrames--;
      measure();
    }
    hot = hit();
    const step = reduced.matches || !last ? 1 : Math.min(1, (now - last) / FADE_MS);
    last = now;
    let moving = false;
    for (const b of boxes) {
      const target = b.el === hot ? 1 : 0,
        current = fades.get(b.el) ?? 0,
        value = target > current ? Math.min(target, current + step) : Math.max(target, current - step);
      if (value) fades.set(b.el, value);
      else fades.delete(b.el);
      if (value !== target) moving = true;
    }
    for (const el of fades.keys()) if (!boxes.some((b) => b.el === el)) fades.delete(el);
    const shownTarget = running ? 0 : 1;
    shown = shownTarget > shown ? Math.min(shownTarget, shown + step) : Math.max(shownTarget, shown - step);
    if (shown !== shownTarget) moving = true;
    mirror();
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
    // Our own writes of the mirrored variables are not layout changes.
    if (records.every((r) => r.attributeName === "style" && mirrored.has(r.target as Element))) return;
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
