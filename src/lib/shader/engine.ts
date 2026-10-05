/**
 * The shader engine (ui-motion.md §6.5), host-injected so shader-check can drive
 * it with a fake canvas and a fake clock. runtime.ts gives it the browser; it is
 * reached only through runtime.ts's import() chunk, never from first-load code.
 *
 * Two levels:
 *   mount(el, spec) → SlotHandle | null     the spec's low-level API: a context
 *        now, or null (unsupported, degraded, mediump-only, program off, or
 *        another slot is live; a WAIT mount takes the context from a live
 *        AMBIENT slot). handle: update · hold · resume · dispose.
 *   attach(el, spec) → { set, detach }      what ShaderSlot uses: the page
 *        conductor gates the slot (gate.ts) on every change, waits for a quiet
 *        moment before a context, holds it offscreen, releases it after 10 s
 *        offscreen, and gives a freed context to the visible slot that has
 *        waited longest.
 *
 * Rules kept here: ≤ 1 live context per document (so one loop per page); a
 * context only while a slot loops; one shared rAF ticker with a per-program
 * frame rate; the AMBIENT budget (5 s of visible drawing per program per
 * session, sessionStorage) with a 400 ms ramp in and out; WAIT ≤ 90 s per run;
 * the throttle governor; context-loss counting; dispose (listeners first, so a
 * self-initiated loseContext is never counted). Nothing here calls
 * console.error or getError.
 */
import { gate, type GateInput } from "./gate";
import { gateInputOf, type Env, type SlotSpec } from "./env";
import { AMBIENT_KEY, FX, LIMITS, WAIT_PAUSED_KEY, dprOf, medianOf, paletteFromVars, slotPixels, throttleVerdict, type Rgb, type ShaderProgram, type ShaderVar } from "./params";
import { PROGRAMS, TRIANGLE, VERT, type UniformFrame } from "./programs";

export type { SlotSpec };

/** What the engine needs from the page. runtime.ts gives it the browser; shader-check gives it fakes. */
export interface Host {
  now(): number;
  /** Wall clock (Date.now), for a WAIT run's start time. */
  wall(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  timeout(cb: () => void, ms: number): number;
  clear(id?: number): void;
  /** requestIdleCallback with a 1500 ms timeout, or setTimeout(0). */
  idle(cb: () => void): void;
  env(): Env;
  get(k: string): string | null;
  set(k: string, v: string): void;
  canvas(): HTMLCanvasElement;
  /** The whitelisted custom properties at the slot (getComputedStyle). */
  vars(el: HTMLElement): (name: ShaderVar) => string;
  /** The slot's CSS size. */
  size(el: HTMLElement): [number, number];
  dpr(): number;
  /** ≥ 50% in view → true. Returns the unobserve. */
  view(el: HTMLElement, cb: (inView: boolean) => void): () => void;
  /** Size changes (the engine debounces). Returns the unobserve. */
  resize(el: HTMLElement, cb: () => void): () => void;
  /** <html>, for data-shader-running. */
  root: HTMLElement;
  /** window.__XTNL_SHD_FORCE: drops failIfMajorPerformanceCaveat (headless SwiftShader). */
  force(): boolean;
  /** The window 'load' event has fired. */
  loaded(): boolean;
  /** The first slot attached (true) or the last one detached (false): wire or unwire the page listeners. */
  active?(on: boolean): void;
}

export interface SlotHandle {
  /** New params (the seed first); also re-reads the palette at the next drawn frame. */
  update(params?: number[]): void;
  /** Keep the context, draw nothing, run no rAF. */
  hold(): void;
  resume(): void;
  /** Release now, or (ramp, a visible horizon) after its air ramps out. */
  dispose(ramp?: boolean): void;
}

export interface Attachment {
  set(spec: Partial<SlotSpec>): void;
  detach(): void;
}

export interface RuntimeStatus {
  supported: boolean | null;
  highp: boolean | null;
  live: number;
  running: string[];
  degraded: boolean;
  countedLosses: number;
}

interface Slot {
  el: HTMLElement;
  spec: SlotSpec;
  /** Gated by the conductor (attach), or a raw mount. */
  managed: boolean;
  born: number;
  /** clock(ms): test time added to a WAIT run's age. */
  skew: number;
  inView: boolean;
  /** When it went offscreen or hidden while live (null: in view). */
  offSince: number | null;
  /** Since when it could loop but has no context (null: not waiting). */
  waitSince: number | null;
  starting?: boolean;
  why: string;
  holdT?: number;
  resizeT?: number;
  unview?: () => void;
  unsize?: () => void;
  canvas?: HTMLCanvasElement | null;
  gl?: WebGLRenderingContext | null;
  ext?: WEBGL_lose_context | null;
  prog?: WebGLProgram | null;
  loc: Record<string, WebGLUniformLocation | null>;
  /** Has a context. */
  live?: boolean;
  /** data-live is set (the canvas replaced the SVG soft layer). */
  shown?: boolean;
  held?: boolean;
  lost?: boolean;
  disposing?: boolean;
  liveAt: number;
  t0: number;
  rampIn: number;
  rampOut: number;
  lastDraw: number;
  air: number;
  ink: Rgb;
  cap: number;
  dirty: boolean;
  dpr: number;
  onLost?: (e: Event) => void;
  onRestored?: () => void;
}

const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);
const ZERO: UniformFrame = { w: 1, h: 1, dpr: 1, time: 0, ink: [0, 0, 0], cap: 0, seed: 0, air: 0 };
const ATTRS: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" };

export function createEngine(host: Host) {
  const slots: Slot[] = [];
  const st = {
    supported: null as boolean | null,
    highp: null as boolean | null,
    degraded: false,
    off: {} as Partial<Record<ShaderProgram, boolean>>,
    losses: [] as number[],
    /** lose({ counted }) classifies the next loss. */
    forced: null as boolean | null,
    frames: 0,
    used: {} as Partial<Record<ShaderProgram, number>>,
    saved: 0,
    lastInput: -1e9,
    ready: false,
    win: [] as number[],
    winT0: 0,
    wins: [] as number[],
  };
  let raf = 0;
  let lastT = -1;
  let quietT = 0;

  const used = (p: ShaderProgram) => (st.used[p] ??= Number(host.get(AMBIENT_KEY(p))) || 0);
  const persist = (p: ShaderProgram) => host.set(AMBIENT_KEY(p), String(Math.round(used(p))));
  const card = (s: Slot) => s.el.closest("[data-wait]");
  const age = (s: Slot) => (s.spec.startedAt ? host.wall() - s.spec.startedAt : host.now() - s.born) + s.skew;
  const running = (s: Slot) => s.shown && !s.held && !s.lost && !!s.prog;
  const idOf = (s: Slot) => s.el.id || `${s.spec.program}-${slots.indexOf(s)}`;
  const drop = (s: Slot) => {
    const i = slots.indexOf(s);
    if (i >= 0) slots.splice(i, 1);
  };
  const sim = (s: Slot) => (s.el.closest("[data-fx-sim]")?.getAttribute("data-fx-sim") ?? "").split(" ");

  // ─── the gate, per slot ───────────────────────────────────────────────────

  function input(s: Slot, others = true): GateInput {
    const c = card(s);
    return gateInputOf(
      host.env(),
      s.el,
      s.spec,
      {
        supported: st.supported,
        highp: st.highp,
        degraded: st.degraded,
        programOff: !!st.off[s.spec.program],
        // ?shd=hold on the fx page: a live slot reads as offscreen.
        inView: s.inView && !(s.live && sim(s).includes("hold")),
        offscreenMs: s.offSince === null ? 0 : host.now() - s.offSince,
        live: !!s.live,
        otherLoopLive: others && otherLoop(s),
        runAgeMs: age(s),
      },
      used(s.spec.program),
      s.spec.kind === "wait" && (!!c?.hasAttribute("data-paused") || host.get(WAIT_PAUSED_KEY) === "1")
    );
  }

  /** A WAIT loop (live, or about to be) wins over AMBIENT; a second slot of the same licence waits. */
  function otherLoop(s: Slot): boolean {
    return slots.some((x) =>
      x === s
        ? false
        : s.spec.kind === "ambient"
          ? (x.live && !x.lost) || (x.managed && x.spec.kind === "wait" && gate(input(x, false))[0] !== "css")
          : x.live && !x.lost && x.spec.kind === "wait"
    );
  }

  /** A live horizon ramps its air out before it releases, but only in full, visible and in view. */
  function canRamp(s: Slot): boolean {
    if (s.spec.program !== "horizon" || !running(s)) return false;
    const i = input(s, false);
    return i.level === "full" && !i.contrastMore && !i.forcedColors && !i.hidden && i.inView;
  }

  // ─── context, compile, draw ───────────────────────────────────────────────

  function create(s: Slot): boolean {
    const c = host.canvas();
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = c.getContext("webgl", { ...ATTRS, failIfMajorPerformanceCaveat: !host.force() });
    } catch {
      gl = null;
    }
    if (!gl) {
      st.supported = false;
      return false;
    }
    st.supported = true;
    const ext = gl.getExtension("WEBGL_lose_context");
    if (st.highp === null) {
      const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      st.highp = !!f && f.precision > 0;
    }
    if (!st.highp) {
      // fp16 breaks h21 and device-px coordinates: SVG for the session.
      ext?.loseContext();
      return false;
    }
    c.setAttribute("aria-hidden", "true");
    Object.assign(s, { canvas: c, gl, ext, prog: null, live: true, shown: false, held: false, lost: false, disposing: false, liveAt: host.now(), dirty: true, rampOut: 0, air: 0 });
    s.onLost = (e: Event) => lost(s, e);
    s.onRestored = () => restored(s);
    c.addEventListener("webglcontextlost", s.onLost);
    c.addEventListener("webglcontextrestored", s.onRestored);
    s.el.insertBefore(c, s.el.querySelector(".shd-marks"));
    s.unsize = host.resize(s.el, () => {
      host.clear(s.resizeT);
      s.resizeT = host.timeout(() => size(s), FX.resize);
    });
    compile(s);
    return true;
  }

  function compile(s: Slot) {
    const gl = s.gl!;
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, PROGRAMS[s.spec.program].frag],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    const kx = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    const finish = () => {
      if (s.gl !== gl || !s.live || s.lost) return;
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        // A compile or link failure switches the program off, silently.
        st.off[s.spec.program] = true;
        end(s, "device", false);
        return;
      }
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(TRIANGLE), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, "a_pos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      s.loc = {};
      for (const k of Object.keys(PROGRAMS[s.spec.program].uniforms(ZERO))) s.loc[k] = gl.getUniformLocation(p, k);
      gl.clearColor(0, 0, 0, 0);
      s.prog = p;
      first(s);
    };
    if (kx) {
      // KHR_parallel_shader_compile: poll across frames, then read LINK_STATUS.
      const poll = () => {
        if (s.gl !== gl || !s.live) return;
        if (gl.getProgramParameter(p, kx.COMPLETION_STATUS_KHR)) finish();
        else host.raf(poll);
      };
      poll();
    } else finish();
  }

  /** The rest frame (air 0, TIME 0) equals the SVG soft layer; data-live comes one rAF later, so nothing pops. */
  function first(s: Slot) {
    size(s);
    s.t0 = host.now();
    s.air = 0;
    draw(s, s.t0, true);
    const gl = s.gl;
    host.raf(() => {
      if (s.gl !== gl || !s.live || s.lost || !s.prog) return;
      s.shown = true;
      s.rampIn = host.now();
      s.lastDraw = -Infinity;
      s.el.setAttribute("data-live", "");
      s.el.setAttribute("data-shd-state", "live");
      if (s.spec.program === "weave") card(s)?.setAttribute("data-weave-live", "");
      flag();
      ensure();
    });
  }

  function unshow(s: Slot) {
    s.shown = false;
    s.el.removeAttribute("data-live");
    s.el.setAttribute("data-shd-state", "fallback");
    if (s.spec.program === "weave") card(s)?.removeAttribute("data-weave-live");
  }

  function size(s: Slot) {
    if (!s.canvas) return;
    const [w, h] = host.size(s.el);
    const [pw, ph] = slotPixels(w, h, dprOf(s.spec.program, host.dpr()), s.spec.program);
    if (s.canvas.width !== pw) s.canvas.width = pw;
    if (s.canvas.height !== ph) s.canvas.height = ph;
    // The effective device-px ratio after the pixel cap (the noise scale and line widths use it).
    s.dpr = w > 0 ? pw / w : 1;
  }

  function draw(s: Slot, now: number, rest: boolean) {
    const gl = s.gl;
    if (!gl || !s.prog || s.lost || gl.isContextLost()) return;
    if (s.dirty) {
      // A theme change is read at the next DRAWN frame; a held slot draws nothing.
      const pal = paletteFromVars(host.vars(s.el), s.spec.program);
      if (pal) Object.assign(s, pal);
      s.dirty = false;
    }
    const c = s.canvas!;
    gl.viewport(0, 0, c.width, c.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const u = PROGRAMS[s.spec.program].uniforms({ w: c.width, h: c.height, dpr: s.dpr, time: rest ? 0 : ((now - s.t0) / 1000) % FX.wrap, ink: s.ink, cap: s.cap, seed: s.spec.params[0] ?? 0, air: rest ? 0 : s.air });
    for (const k in u) {
      const l = s.loc[k];
      if (l) gl.uniform4f(l, u[k][0], u[k][1], u[k][2], u[k][3]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    st.frames++;
  }

  // ─── the shared ticker ────────────────────────────────────────────────────

  /** html[data-shader-running] while any loop runs (written only when it changes, never per frame). */
  let flagged = false;
  function flag() {
    const on = slots.some(running);
    if (on === flagged) return;
    flagged = on;
    if (on) host.root.setAttribute("data-shader-running", "");
    else host.root.removeAttribute("data-shader-running");
  }

  function ensure() {
    if (raf || !slots.some(running)) return;
    lastT = -1;
    // The governor measures a run of consecutive frames only.
    st.win = [];
    st.winT0 = 0;
    st.wins = [];
    raf = host.raf(tick);
  }

  function tick(now: number) {
    raf = 0;
    const dt = lastT < 0 ? 0 : now - lastT;
    lastT = now;
    governor(dt, now);
    let any = false;
    for (const s of [...slots]) {
      if (!running(s)) continue;
      const p = s.spec.program;
      if (s.spec.kind === "ambient") {
        // AMBIENT visible time: only while drawing in view (a held slot is not running).
        st.used[p] = used(p) + Math.min(dt, 100);
        if (now - st.saved > 500) {
          persist(p);
          st.saved = now;
        }
      }
      if (s.spec.kind === "wait" && age(s) >= FX.waitMax) {
        end(s, "wait", false);
        continue;
      }
      if (p === "horizon") {
        const left = s.spec.kind === "ambient" ? FX.ambientMax - used(p) : Infinity;
        const out = Math.min(clamp01((left - 20) / FX.ramp), s.rampOut ? clamp01(1 - (now - s.rampOut) / FX.ramp) : 1);
        s.air = Math.min(clamp01((now - s.rampIn) / FX.ramp), out);
        if (out <= 0) {
          end(s, s.rampOut ? s.why : "ambient", false);
          continue;
        }
      } else if (s.rampOut) {
        end(s, s.why, false);
        continue;
      }
      any = true;
      // ≤ fps: a draw needs 1000 / fps since the last one (half a ms of rAF jitter allowed).
      if (now - s.lastDraw >= 1000 / LIMITS[p].fps - 0.5) {
        draw(s, now, false);
        s.lastDraw = now;
      }
    }
    if (any) raf = host.raf(tick);
    flag();
  }

  /** Two 2 s windows in a row with a median rAF interval over 22 ms: degraded for the session. */
  function governor(dt: number, now: number) {
    if (!st.ready || dt <= 0) return;
    if (dt > 1000) {
      st.win = [];
      st.winT0 = 0;
      return;
    }
    if (!st.winT0) st.winT0 = now;
    st.win.push(dt);
    if (now - st.winT0 < FX.govWindow) return;
    st.wins = [...st.wins, medianOf(st.win)].slice(-2);
    st.win = [];
    st.winT0 = now;
    if (throttleVerdict({ ready: true, windows: st.wins }) === "degrade") {
      st.degraded = true;
      for (const s of [...slots]) if (s.live) end(s, "device", true);
    }
  }

  // ─── hold, end, dispose, loss ─────────────────────────────────────────────

  function setHold(s: Slot, on: boolean) {
    if (s.held === on) return;
    s.held = on;
    if (on) s.el.setAttribute("data-shd-hold", "");
    else s.el.removeAttribute("data-shd-hold");
    if (!on) ensure();
    flag();
  }

  /** Stop a live slot: ramp its air out first when it can, else release now. */
  function end(s: Slot, why: string, ramp: boolean) {
    if (!s.live) return;
    s.why = why;
    if (ramp && canRamp(s)) {
      if (!s.rampOut) s.rampOut = host.now();
      return;
    }
    dispose(s);
    if (!s.managed) drop(s);
    kick();
  }

  /** §6.5 step 12. Listeners go first, so this loseContext is never counted as a loss. */
  function dispose(s: Slot) {
    s.disposing = true;
    const { canvas: c, ext } = s;
    if (c) {
      c.removeEventListener("webglcontextlost", s.onLost!);
      c.removeEventListener("webglcontextrestored", s.onRestored!);
      c.remove();
    }
    s.unsize?.();
    host.clear(s.resizeT);
    unshow(s);
    s.el.removeAttribute("data-shd-hold");
    try {
      ext?.loseContext();
    } catch {
      /* already lost */
    }
    Object.assign(s, { canvas: null, gl: null, ext: null, prog: null, live: false, held: false, lost: false, rampOut: 0, unsize: undefined, disposing: false });
    if (s.spec.kind === "ambient") persist(s.spec.program);
    if (!slots.some(running) && raf) {
      host.caf(raf);
      raf = 0;
    }
    flag();
  }

  function lost(s: Slot, e: Event) {
    e.preventDefault();
    if (s.disposing) return;
    const now = host.now();
    // Counted only when visible and the context had been live over 1 s (or as lose({ counted }) says).
    const counted = st.forced ?? (!host.env().hidden && now - s.liveAt > FX.lossMinLive);
    st.forced = null;
    s.lost = true;
    unshow(s);
    if (counted) {
      st.losses = [...st.losses.filter((t) => now - t < FX.lossWindow), now];
      if (st.losses.length >= 2) {
        st.supported = false;
        end(s, "device", false);
        return;
      }
    }
    flag();
  }

  function restored(s: Slot) {
    if (!s.live || !s.lost) return;
    s.lost = false;
    s.prog = null;
    s.dirty = true;
    compile(s);
  }

  // ─── the low-level API ────────────────────────────────────────────────────

  function slotOf(el: HTMLElement, spec: SlotSpec, managed: boolean): Slot {
    // Unset flags and handles start undefined (falsy); the rest is the rest state.
    const s: Slot = { el, spec: { ...spec, params: [...spec.params] }, managed, born: host.now(), skew: 0, inView: !managed, offSince: null, waitSince: null, why: "", loc: {}, liveAt: 0, t0: 0, rampIn: 0, rampOut: 0, lastDraw: -Infinity, air: 0, ink: [0.94, 0.95, 0.97], cap: 0.2, dirty: true, dpr: 1 };
    slots.push(s);
    return s;
  }

  const handle = (s: Slot): SlotHandle => ({
    update(params) {
      if (params) s.spec.params = [...params];
      s.dirty = true;
    },
    hold: () => setHold(s, true),
    resume: () => setHold(s, false),
    dispose: (ramp = false) => end(s, "gone", ramp),
  });

  function start(s: Slot): boolean {
    if (st.supported === false || st.highp === false || st.degraded || st.off[s.spec.program]) return false;
    if (s.live) return true;
    for (const x of [...slots]) {
      if (x === s || !x.live) continue;
      if (s.spec.kind === "wait" && x.spec.kind === "ambient") end(x, "other", false);
      else return false;
    }
    if (s.spec.kind === "ambient" && FX.ambientMax - FX.ramp - used(s.spec.program) <= 0) return false;
    if (!create(s)) return false;
    s.waitSince = null;
    return true;
  }

  function mount(el: HTMLElement, spec: SlotSpec): SlotHandle | null {
    const s = slots.find((x) => x.el === el) ?? slotOf(el, spec, false);
    if (start(s)) return handle(s);
    if (!s.managed) drop(s);
    return null;
  }

  // ─── the conductor ────────────────────────────────────────────────────────

  /** The quiet start: after 'load', with 400 ms of no input, in an idle slice; the longest-waiting visible slot first. */
  function kick() {
    host.clear(quietT);
    quietT = 0;
    if (!host.loaded()) return;
    const c = slots.filter((s) => s.managed && !s.live && !s.starting && s.waitSince !== null).sort((a, b) => a.waitSince! - b.waitSince!)[0];
    if (!c) return;
    quietT = host.timeout(
      () => {
        quietT = 0;
        if (host.now() - st.lastInput < FX.quiet) return kick();
        c.starting = true;
        host.idle(() => {
          c.starting = false;
          if (!slots.includes(c) || c.live) return;
          // Input resumed before getContext, or the page changed: wait for the next quiet window.
          if (host.now() - st.lastInput < FX.quiet || gate(input(c))[0] !== "loop" || !start(c)) regate();
        });
      },
      Math.max(0, FX.quiet - (host.now() - st.lastInput)) + 1
    );
  }

  function regate() {
    const now = host.now();
    for (const s of [...slots]) {
      if (!s.managed) continue;
      const [m, why] = gate(input(s));
      if (s.live) {
        if (m === "css") {
          if (!s.rampOut) end(s, why, true);
        } else if (m === "hold") {
          s.offSince ??= now;
          setHold(s, true);
          host.clear(s.holdT);
          s.holdT = host.timeout(regate, FX.offscreenMax - (now - s.offSince) + 5);
        } else {
          s.offSince = null;
          setHold(s, false);
        }
      } else {
        s.offSince = null;
        s.why = why;
        s.waitSince = m === "loop" ? (s.waitSince ?? now) : null;
      }
    }
    kick();
  }

  function attach(el: HTMLElement, spec: SlotSpec): Attachment {
    const s = slotOf(el, spec, true);
    if (slots.filter((x) => x.managed).length === 1) host.active?.(true);
    s.unview = host.view(el, (v) => {
      s.inView = v;
      regate();
    });
    regate();
    return {
      set(next) {
        Object.assign(s.spec, next);
        s.dirty = true;
        regate();
      },
      detach() {
        host.clear(s.holdT);
        s.unview?.();
        if (s.live) dispose(s);
        drop(s);
        if (!slots.some((x) => x.managed)) host.active?.(false);
        kick();
      },
    };
  }

  function status(): RuntimeStatus {
    return { supported: st.supported, highp: st.highp, live: slots.filter((s) => s.live).length, running: slots.filter(running).map(idOf), degraded: st.degraded, countedLosses: st.losses.length };
  }

  return {
    mount,
    attach,
    status,
    regate,
    /** A scroll, pointer or key event (the quiet window). */
    input: () => {
      st.lastInput = host.now();
    },
    /** After 'load' and the first idle callback: the governor may sample. */
    ready: () => {
      st.ready = true;
    },
    /** data-theme changed: live slots re-read the palette at their next drawn frame. */
    theme: () => {
      for (const s of slots) s.dirty = true;
    },
    /** pagehide (bfcache): release every context; pageshow re-gates. */
    pagehide: () => {
      for (const s of [...slots]) if (s.live) end(s, "away", false);
    },
    debug: {
      running: () => slots.filter(running).map(idOf),
      frames: () => st.frames,
      /** Draw the rest frame (air 0) and read RGBA at CSS-px points. */
      probe(target: HTMLElement | string, points: [number, number][]): number[][] | null {
        const s = slots.find((x) => x.el === target || idOf(x) === target);
        if (!s?.gl || !s.prog || !s.canvas) return null;
        draw(s, host.now(), true);
        const out: number[][] = [];
        const px = new Uint8Array(4);
        for (const [x, y] of points) {
          s.gl.readPixels(Math.floor(x * s.dpr), s.canvas.height - 1 - Math.floor(y * s.dpr), 1, 1, s.gl.RGBA, s.gl.UNSIGNED_BYTE, px);
          out.push([...px]);
        }
        return out;
      },
      lose({ counted }: { counted?: boolean } = {}) {
        st.forced = counted ?? null;
        for (const s of slots) if (s.live && !s.lost) s.ext?.loseContext();
      },
      restore() {
        for (const s of slots) if (s.live && s.lost) s.ext?.restoreContext();
      },
      /** Advance the test clock for the budgets: AMBIENT time spent, WAIT run age. */
      clock(ms: number) {
        for (const s of slots) {
          if (!running(s)) continue;
          if (s.spec.kind === "ambient") st.used[s.spec.program] = used(s.spec.program) + ms;
          else s.skew += ms;
        }
      },
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
