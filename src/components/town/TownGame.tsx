"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Attribute } from "@prisma/client";
import { profileFor, type TownInput } from "@/lib/town/rules";
import {
  BUILDABLE, CATALOG, COURSES, CROP_YIELD, DISHES, FARM_LOSS, FISH_CATCH, FISH_SEASON, GATE_COST, LAB_RECIPES, LADDERS, LAND_CROPS,
  ARMY_PER_POINT, DIG_HOURS, FILL_HOURS, KNIGHT_RECRUIT, PAVEMENT_COST, RECIPES, RECRUIT_RANK, STORE_PER_LEVEL, TRAIN_CAP, UTILITIES,
  COMBINE_COST, COMBINE_FROM, GRADE_NAMES, hallMinDay, HOME_TIERS, grade, homeTier, homeTitle, jewelCost, knightPay, knightTitle, soldierTitle, upgradePeople,
  WALL_COST, WATER_CROPS, bedUpgradeCost, maxBedUpgrades, utilitySlots,
} from "@/lib/town/sim/catalog";
import {
  ASCEND_FROM, GEAR, PARTS, SORTIE_HOURS, STACK, advanceKnight, advanceRequirement, armorySlots, ascensionCap, ascensionOdds,
  attemptAscension, canDeploy, craftCheck, crafterFor, deploy, equip, forgeOf, gearCap, gearOf, isAway, isSpecial, stash, startCraft,
  stock, unequip, xpToNext, knightCapFor, wizardCapFor, MAX_KNIGHT, MAX_WIZARD, type GearSlot,
} from "@/lib/town/sim/loot";
import {
  addUtility, assignGuard, relocate, movers, moveHours, MOVER_LEVEL, setNightShift, setOvertime, setClearOvertime, cancelWork, cancelLeft, CANCEL_MS, bindEmblem, buyBed, cancelClear, clear, demolish, fire, freeWorkers, harvestYield, hire, paint, place, recruit,
  cancelEarthworks, combineHomes, combinePartners, markEarthworks, upgradeWalls, schoolTrain, sell, sendOnBreak, setMode, stokeFire, trade, unpaint, upgrade,
} from "@/lib/town/sim/actions";
import { MONSTERS, partyName } from "@/lib/town/sim/bestiary";
import { plural } from "@/lib/town/sim/words";
import { hintState, revealHint, type Act } from "@/lib/town/sim/advisor";
import { armyFor, assaultGate, assaultOdds, gateGuard } from "@/lib/town/sim/endgame";
import { endgameTown } from "@/lib/town/sim/showcase";
import { MUSEUM_HOURS, TRAVEL_COST, TRAVEL_HOURS, couldGo, isAway as isAwayLeisure, openMuseum, sendToMuseum, sendTravelling } from "@/lib/town/sim/leisure";
import { EFFORT_LABEL, EFFORT_POINTS, NIGHT_SHIFT_LEVEL, capacity, hasNightShift, jobEffort, spent, weakness, workLevel } from "@/lib/town/sim/work";
import { LEGENDS, ascendLegend, candidateFor, legendChecks, legendOf, titleOf, type Legend } from "@/lib/town/sim/legends";
import { FIRE_BANISH, canRepel, performRite, repelRequirement, stepCombat } from "@/lib/town/sim/combat";
import {
  beds, byId, census, clock, countedTroops, guardsAt, isMilitary, migrate, militaryCapacity, newTown, packSave, residents, totalBeds, unpackSave,
} from "@/lib/town/sim/state";
import { advance, FESTIVAL_COST, holdFestival, raidForecast, scheduleRaid, trainingPace, type SimContext } from "@/lib/town/sim/tick";
import { buildingEffects, type Effect } from "@/lib/town/sim/effects";
import { alertRadius, fireAirDT, burnRate, checkMove, checkPlacement, checkTile, computeLinks, costText, farmReachesMarket, fieldFrozen, findPath, fuelCap, growsInWinter, guardSlots, warmFields, idx, irrigation, isLit, lightRange, occupancy, rng, warmthRange, LIGHT_TYPES, MILITARY_TYPES, armyPointsAllowed, captainBonus, commanderOf, hallDistance, hallRadius, isGuardPost, mineRareRate, passiveRadius, storeRoom, WALL_MAX_LEVEL, wallHp, wallLevel, wallMaxHp, wallUpgradeCost, fitAt } from "@/lib/town/sim/world";
import { FOREST_FLOOR, REGROW, TILE_WOOD, forestOf, regrows } from "@/lib/town/sim/woods";
import { PACK_SLOTS, RATION_MEALS, adventureReach, broodOf, canPack, packRation, packTorch, sendScout, unpackSlot } from "@/lib/town/sim/wilds";
import { LAIR_NAMES } from "@/lib/town/sim/vision";
import { MAP_H, MAP_W, Overlay, Terrain, TERRAIN_NAME, TILE, YEAR_DAYS, type GameState, type MonsterKind, type Structure, type StructureType, type Villager } from "@/lib/town/sim/types";
import {
  drawFrame, drawMinimap, newWorld, structureArt, MINI_H, MINI_W, VIEW_H, VIEW_W, WORLD_H, WORLD_W,
  type Camera, type Walker, type Overlays, type World,
} from "./map/render";
import type { TroopArt } from "./art/sprites";
import { troopLook, type Look } from "./art/heroes";
import { NemesisPanel, NodeList, SocietyPanel, StudyPanel, SoilPanel, StoresPanel, ThreatPanel, Vitals, WeatherBadge, ZonePanel } from "./SurvivalPanels";
import { IconCanvas, InventoryPanel, ResourceHud } from "./Inventory";
import { TrophyPanel } from "./Trophies";
import { HALL_AGES, hallAge } from "./art/special";
import { AUG_CAP, AUG_LABEL, AUG_LEVEL, augBonus, augment, canAugment, dimReturn, isFoot, partLabel } from "@/lib/town/sim/augment";

/**
 * The town, as a game.
 *
 * State lives in a ref and is mutated in place by the engine; React only
 * re-renders the panels a few times a second. The canvas loop reads the same
 * object every frame. Saves go to localStorage per profile — it is the
 * player's town, on the player's device — every few seconds and on leaving.
 */

const SAVE_KEY = (scenario: string) => `xtnl-town-v2:${scenario}`;
/** Game minutes per real second at 1×. One in-game hour every 30 seconds. */
const MIN_PER_SEC = 2;
const SPEEDS = [0, 1, 3, 10, 30];
const ZOOMS = [1, 2, 3, 4];

type Tool =
  | { kind: "select" }
  | { kind: "build"; type: StructureType }
  | { kind: "pavement" | "wall" | "gate" | "clear" | "unpave" | "demolish" | "dig" | "fill" | "upwall" }
  | { kind: "scout"; villagerId: number }
  | { kind: "move"; id: number };

const ALLOWED_EMBLEM: Record<"wizard" | "knight", Attribute[]> = {
  wizard: ["ABSTRACT", "CREATIVITY", "MIND", "LOGIC", "REASON"],
  knight: ["PHYSICAL", "STUBBORNNESS", "FAITH", "SELF_RESPECT", "COMPASSION"],
};

function loadOrFound(scenario: string, bonus: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY(scenario));
    if (raw) {
      const s = unpackSave(raw);
      if (s.version === 2) return migrate(s);
    }
  } catch {
    /* private mode, corrupt save: found a new town */
  }
  return found(scenario, bonus);
}

/** A new town for a profile: the end-game preview is built at the summit, with its dragon fight on the way. */
const found = (scenario: string, bonus: number) =>
  scenario === "endgame" ? endgameTown(Math.floor(Math.random() * 1e9), bonus) : newTown(Math.floor(Math.random() * 1e9), bonus, foundingFor(scenario));

/** Your own town starts from nothing much; the preview towns show a fuller layout. */
const foundingFor = (scenario: string) => (scenario === "yours" ? "starter" : "showcase");

function save(scenario: string, s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY(scenario), packSave(s));
  } catch {
    /* quota or private mode — the game keeps running unsaved */
  }
}

/** Axis-aligned L from a to b: across first, then down. How roads are drawn. */
function lPath(a: [number, number], b: [number, number]): number[] {
  const out: number[] = [];
  const sx = Math.sign(b[0] - a[0]) || 1;
  for (let x = a[0]; x !== b[0] + sx; x += sx) out.push(idx(x, a[1]));
  const sy = Math.sign(b[1] - a[1]) || 1;
  for (let y = a[1] + sy; b[1] !== a[1] && y !== b[1] + sy; y += sy) out.push(idx(b[0], y));
  return out;
}

function rectTiles(a: [number, number], b: [number, number]): number[] {
  const out: number[] = [];
  for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
    for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push(idx(x, y));
  return out;
}

const pct = (v: number) => `${Math.round(v)}%`;

export function TownGame({ input, scenario, bonus }: { input: TownInput; scenario: string; bonus: number }) {
  const profile = useMemo(() => profileFor(input), [input]);
  const ctx: SimContext = useMemo(() => ({ profile, input }), [profile, input]);
  /**
   * The game object lives in state so render can read it; the engine mutates
   * it in place and a tick re-renders the panels. The ref is only the
   * animation loop's handle on the same object.
   */
  const [game, setGame] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [, setTick] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selected, setSelected] = useState<number | null>(null);
  /** A tree, rock or rubble tile picked for harvesting. */
  const [tileSel, setTileSel] = useState<number | null>(null);
  const [inv, setInv] = useState(false);
  const [tab, setTab] = useState<"build" | "info" | "hall" | "raid" | "trade" | "log" | "trophy">("build");
  // Full screen, for phones and foldables: the map fills the screen in
  // landscape, and the side panel becomes a quest-log pop-up over it.
  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [quest, setQuest] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const onFs = () => {
      if (!document.fullscreenElement) {
        setFull(false);
        setQuest(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: 80, y: 120, zoom: 1 });
  // The static world, painted a chunk at a time as it comes into view.
  const world = useRef<World>(newWorld());
  // The minimap's window: follows the camera until dragged.
  const miniOrigin = useRef<[number, number]>([0, 0]);
  const miniFollow = useRef(true);
  const miniDrag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const ui = useRef({
    hover: null as [number, number] | null,
    dragFrom: null as [number, number] | null,
    panFrom: null as [number, number, number, number] | null,
    moved: false,
    /** Touch points on the canvas, for the two-finger pinch. */
    pointers: new Map<number, [number, number]>(),
    pinch: null as { dist: number; mid: [number, number] } | null,
    /** Ctrl-wheel travel not yet spent on a zoom step (trackpads send small deltas). */
    wheel: 0,
  });
  const walkersRef = useRef<{ key: string; list: Walker[] }>({ key: "", list: [] });
  /** Effects on buildings, refreshed a few times a second rather than every frame. */
  const effectsRef = useRef<Map<number, Effect[]>>(new Map());
  const toolRef = useRef(tool);
  const selectedRef = useRef(selected);
  /** A building offered in the Build here list, shown where it would go. */
  const previewRef = useRef<{ type: StructureType; x: number; y: number } | null>(null);
  const tileRef = useRef(tileSel);
  const speedRef = useRef(speedIdx);
  useEffect(() => {
    toolRef.current = tool;
    selectedRef.current = selected;
    tileRef.current = tileSel;
    speedRef.current = speedIdx;
  });

  // Found or load on mount (localStorage is client-only).
  useEffect(() => {
    const s = loadOrFound(scenario, bonus);
    stateRef.current = s;
    world.current = newWorld();
    miniFollow.current = true;
    const hall = s.structures.find((st) => st.type === "townhall");
    if (hall) {
      cam.current.x = Math.max(0, hall.x * TILE + 56 - VIEW_W / 2);
      cam.current.y = Math.max(0, hall.y * TILE + 28 - VIEW_H / 2);
    }
    const persist = () => stateRef.current && save(scenario, stateRef.current);
    const id = window.setInterval(persist, 5000);
    window.addEventListener("beforeunload", persist);
    // Deferred so the first paint is not a synchronous render inside the effect.
    const ready = window.setTimeout(() => setGame(s), 0);
    return () => {
      window.clearTimeout(ready);
      window.clearInterval(id);
      window.removeEventListener("beforeunload", persist);
      persist();
    };
  }, [scenario, bonus]);

  const say = useCallback((msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  // ── The loop ─────────────────────────────────────────────
  const loaded = game !== null;
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    // The frame is graded pixel by pixel (see map/lighting), so keep it CPU-side.
    const c = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !c) return;
    let raf = 0;
    let last = performance.now();
    let uiAcc = 0;
    const t0 = last;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (s) {
        const speed = SPEEDS[speedRef.current];
        if (speed > 0) {
          if (s.raid?.phase === "fighting") stepCombat(s, dt * Math.min(3, speed));
          else advance(s, dt * speed * MIN_PER_SEC, ctx);
        }


        const ov: Overlays = {
          hover: ui.current.hover, ghost: null, paint: null, selected: selectedRef.current, tile: tileRef.current,
          walkers: walkersRef.current.list, arch: profile.archetype, effects: effectsRef.current,
        };
        const tl = toolRef.current;
        const h = ui.current.hover;
        if (h && tl.kind === "move") {
          const st = byId(s, tl.id);
          if (st) {
            const gx = h[0] - Math.floor(st.w / 2);
            const gy = h[1] - Math.floor(st.h / 2);
            const check = checkMove(s, st, gx, gy);
            ov.ghost = { type: st.type, x: gx, y: gy, w: st.w, h: st.h, ok: check.ok, art: structureArt({ ...st, x: gx, y: gy, buildUntil: undefined }, profile.archetype) };
          }
        } else if (h && tl.kind === "build") {
          const def = CATALOG[tl.type];
          const gx = h[0] - Math.floor(def.w / 2);
          const gy = h[1] - Math.floor(def.h / 2);
          const check = checkPlacement(s, tl.type, gx, gy);
          const fake: Structure = { id: 999999, type: tl.type, x: gx, y: gy, w: def.w, h: def.h, level: 1, hp: 1, condition: 100, workers: [] };
          ov.ghost = { type: tl.type, x: gx, y: gy, w: def.w, h: def.h, ok: check.ok, art: structureArt(fake, profile.archetype) };
        } else if (h && (tl.kind === "pavement" || tl.kind === "wall" || tl.kind === "gate" || tl.kind === "clear" || tl.kind === "unpave" || tl.kind === "dig" || tl.kind === "fill" || tl.kind === "upwall")) {
          const from = ui.current.dragFrom ?? h;
          const tiles = tl.kind === "clear" || tl.kind === "unpave" || tl.kind === "upwall" ? rectTiles(from, h) : lPath(from, h);
          const occ = occupancy(s);
          const ok = tl.kind === "clear" || tl.kind === "unpave" || tl.kind === "dig" || tl.kind === "fill" || tl.kind === "upwall" || tiles.every((i) => !checkTile(s, i, tl.kind as "pavement", occ));
          ov.paint = { tiles, ok, kind: tl.kind };
        }
        const pv = previewRef.current;
        if (!ov.ghost && pv) {
          const def = CATALOG[pv.type];
          const fake: Structure = { id: 999999, type: pv.type, x: pv.x, y: pv.y, w: def.w, h: def.h, level: 1, hp: 1, condition: 100, workers: [] };
          ov.ghost = { type: pv.type, x: pv.x, y: pv.y, w: def.w, h: def.h, ok: true, art: structureArt(fake, profile.archetype) };
        }
        drawFrame(c, world.current, s, cam.current, ov, (now - t0) / 1000);
        // The camera, mirrored onto the element: lets tests and tools map a
        // screen point to a tile without reaching into component state.
        const camTag = `${cam.current.x},${cam.current.y},${cam.current.zoom}`;
        if (canvas.dataset.cam !== camTag) canvas.dataset.cam = camTag;

        uiAcc += dt;
        if (uiAcc > 0.25) {
          uiAcc = 0;
          effectsRef.current = buildingEffects(s, ctx);
          // Walkers follow the roads and the rota; recomputed only when either changes.
          const wk = walkersKey(s);
          if (walkersRef.current.key !== wk) walkersRef.current = { key: wk, list: computeWalkers(s) };
          setTick((n) => (n + 1) % 1e9);
          const mini = miniRef.current?.getContext("2d");
          if (mini) {
            if (miniFollow.current) {
              const cx = (cam.current.x + VIEW_W / cam.current.zoom / 2) / TILE;
              const cy = (cam.current.y + VIEW_H / cam.current.zoom / 2) / TILE;
              miniOrigin.current = [
                Math.max(0, Math.min(MAP_W - MINI_W, Math.round(cx - MINI_W / 2))),
                Math.max(0, Math.min(MAP_H - MINI_H, Math.round(cy - MINI_H / 2))),
              ];
            }
            drawMinimap(mini, s, cam.current, miniOrigin.current);
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded, ctx, profile.archetype]);

  // ── Pointer ──────────────────────────────────────────────
  const toTile = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    const lx = ((e.clientX - r.left) / r.width) * VIEW_W;
    const ly = ((e.clientY - r.top) / r.height) * VIEW_H;
    const wx = cam.current.x + lx / cam.current.zoom;
    const wy = cam.current.y + ly / cam.current.zoom;
    return [Math.max(0, Math.min(MAP_W - 1, Math.floor(wx / TILE))), Math.max(0, Math.min(MAP_H - 1, Math.floor(wy / TILE)))];
  };

  const clampCam = () => {
    const c = cam.current;
    c.x = Math.round(Math.max(0, Math.min(WORLD_W - VIEW_W / c.zoom, c.x)));
    c.y = Math.round(Math.max(0, Math.min(WORLD_H - VIEW_H / c.zoom, c.y)));
  };

  /** One zoom step in or out, keeping the world point under (clientX, clientY) still. */
  const zoomAt = useCallback((clientX: number, clientY: number, dir: 1 | -1) => {
    const c = cam.current;
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(c.zoom) + dir))];
    if (next === c.zoom || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const lx = ((clientX - r.left) / r.width) * VIEW_W;
    const ly = ((clientY - r.top) / r.height) * VIEW_H;
    const wx = c.x + lx / c.zoom;
    const wy = c.y + ly / c.zoom;
    c.zoom = next;
    c.x = Math.round(Math.max(0, Math.min(WORLD_W - VIEW_W / next, wx - lx / next)));
    c.y = Math.round(Math.max(0, Math.min(WORLD_H - VIEW_H / next, wy - ly / next)));
  }, []);

  // Zoom on Ctrl+wheel only — a plain wheel scrolls the page past the map.
  // Registered by hand because React's wheel listener is passive and cannot
  // stop the browser's own page zoom. Trackpad pinches arrive the same way.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      ui.current.wheel += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(ui.current.wheel) < 40) return;
      zoomAt(e.clientX, e.clientY, ui.current.wheel < 0 ? 1 : -1);
      ui.current.wheel = 0;
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [loaded, zoomAt]);

  /** Two fingers down: their spread zooms, their midpoint pans. */
  const pinchState = () => {
    const pts = [...ui.current.pointers.values()];
    const [a, b] = pts;
    return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
  };

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer already went away */
    }
    ui.current.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (ui.current.pointers.size === 2) {
      // A second finger turns a drag into a pinch; whatever the first began is off.
      ui.current.pinch = pinchState();
      ui.current.dragFrom = null;
      ui.current.panFrom = null;
      ui.current.moved = true;
      return;
    }
    if (ui.current.pointers.size > 2) return;
    const t = toTile(e);
    ui.current.moved = false;
    const tl = toolRef.current;
    const painting = tl.kind === "pavement" || tl.kind === "wall" || tl.kind === "gate" || tl.kind === "clear" || tl.kind === "unpave" || tl.kind === "dig" || tl.kind === "fill" || tl.kind === "upwall";
    if (painting && e.button === 0) ui.current.dragFrom = t;
    else ui.current.panFrom = [e.clientX, e.clientY, cam.current.x, cam.current.y];
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (ui.current.pointers.has(e.pointerId)) ui.current.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const pin = ui.current.pinch;
    if (pin && ui.current.pointers.size === 2) {
      const now = pinchState();
      const r = canvasRef.current!.getBoundingClientRect();
      const k = VIEW_W / r.width / cam.current.zoom;
      cam.current.x -= (now.mid[0] - pin.mid[0]) * k;
      cam.current.y -= (now.mid[1] - pin.mid[1]) * k;
      clampCam();
      pin.mid = now.mid;
      // Zoom is in whole steps, so a pinch spends its spread one step at a time.
      if (now.dist > pin.dist * 1.25) {
        zoomAt(now.mid[0], now.mid[1], 1);
        pin.dist = now.dist;
      } else if (now.dist < pin.dist * 0.8) {
        zoomAt(now.mid[0], now.mid[1], -1);
        pin.dist = now.dist;
      }
      return;
    }
    ui.current.hover = toTile(e);
    const p = ui.current.panFrom;
    if (p) {
      const r = canvasRef.current!.getBoundingClientRect();
      const k = VIEW_W / r.width / cam.current.zoom;
      const dx = (e.clientX - p[0]) * k;
      const dy = (e.clientY - p[1]) * k;
      if (Math.abs(dx) + Math.abs(dy) > 2) ui.current.moved = true;
      cam.current.x = p[2] - dx;
      cam.current.y = p[3] - dy;
      clampCam();
    }
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    ui.current.pointers.delete(e.pointerId);
    if (ui.current.pinch) {
      // The pinch ends when the fingers leave; neither lift is a click.
      if (ui.current.pointers.size === 0) ui.current.pinch = null;
      return;
    }
    const s = stateRef.current;
    if (!s) return;
    const t = toTile(e);
    const tl = toolRef.current;
    const from = ui.current.dragFrom;
    ui.current.dragFrom = null;
    const wasPan = !!ui.current.panFrom && ui.current.moved;
    ui.current.panFrom = null;
    if (wasPan) return;

    if (from && (tl.kind === "pavement" || tl.kind === "wall" || tl.kind === "gate")) say(paint(s, tl.kind, lPath(from, t)));
    else if (from && tl.kind === "clear") say(clear(s, rectTiles(from, t)));
    else if (from && tl.kind === "unpave") {
      const tiles = rectTiles(from, t);
      say(unpaint(s, tiles));
      cancelEarthworks(s, tiles);
    } else if (from && (tl.kind === "dig" || tl.kind === "fill")) say(markEarthworks(s, tl.kind, lPath(from, t)));
    else if (from && tl.kind === "upwall") say(upgradeWalls(s, rectTiles(from, t)));
    else if (tl.kind === "scout") {
      const err = sendScout(s, tl.villagerId, t[0], t[1]);
      say(err);
      if (!err) setTool({ kind: "select" });
    } else if (tl.kind === "move") {
      const st = byId(s, tl.id);
      if (st) {
        const err = relocate(s, st.id, t[0] - Math.floor(st.w / 2), t[1] - Math.floor(st.h / 2));
        say(err);
        if (!err) setTool({ kind: "select" });
      }
    } else if (tl.kind === "build") {
      const def = CATALOG[tl.type];
      const err = place(s, ctx, tl.type, t[0] - Math.floor(def.w / 2), t[1] - Math.floor(def.h / 2));
      say(err);
      if (!err && !e.shiftKey) setTool({ kind: "select" });
    } else {
      const id = occupancy(s)[idx(t[0], t[1])];
      if (tl.kind === "demolish") {
        const st = byId(s, id);
        if (st && window.confirm(`Tear down the ${CATALOG[st.type].name.toLowerCase()}? A level-10 worker could move it instead.`)) say(demolish(s, id));
        return;
      }
      setSelected(id || null);
      // Nothing built here: a tree, a rock or rubble can be picked to harvest.
      const tile = idx(t[0], t[1]);
      // Open ground too: it offers what could be built there.
      const loose = !id ? tile : null;
      previewRef.current = null;
      setTileSel(loose);
      if (id || loose !== null) {
        setTab("info");
        if (full) setQuest(true);
      }
    }
    setTick((n) => n + 1);
  }

  // The minimap: drag to look around the map, click to go there.
  function onMiniDown(e: React.PointerEvent<HTMLCanvasElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no live pointer to capture (a synthetic event): the drag still works inside the map */
    }
    miniDrag.current = { x: e.clientX, y: e.clientY, ox: miniOrigin.current[0], oy: miniOrigin.current[1], moved: false };
  }
  function onMiniMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = miniDrag.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / r.width) * MINI_W;
    const dy = ((e.clientY - d.y) / r.height) * MINI_H;
    if (Math.abs(dx) + Math.abs(dy) > 1.5) d.moved = true;
    if (!d.moved) return;
    miniFollow.current = false;
    miniOrigin.current = [
      Math.max(0, Math.min(MAP_W - MINI_W, Math.round(d.ox - dx))),
      Math.max(0, Math.min(MAP_H - MINI_H, Math.round(d.oy - dy))),
    ];
    const s = stateRef.current;
    const mini = miniRef.current?.getContext("2d");
    if (s && mini) drawMinimap(mini, s, cam.current, miniOrigin.current);
  }
  function onMiniUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = miniDrag.current;
    miniDrag.current = null;
    if (!d || d.moved) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = miniOrigin.current[0] + ((e.clientX - r.left) / r.width) * MINI_W;
    const my = miniOrigin.current[1] + ((e.clientY - r.top) / r.height) * MINI_H;
    cam.current.x = mx * TILE - VIEW_W / cam.current.zoom / 2;
    cam.current.y = my * TILE - VIEW_H / cam.current.zoom / 2;
    clampCam();
    miniFollow.current = true;
  }

  /** A new town in this slot: a fresh map, and the day's tally kept as the best if it was. */
  function resetGame() {
    const old = stateRef.current;
    if (old) recordDay(scenario, old.fallen?.day ?? clock(old.time).day);
    const fresh = found(scenario, bonus);
    stateRef.current = fresh;
    world.current = newWorld();
    miniFollow.current = true;
    save(scenario, fresh);
    setSelected(null);
    setTileSel(null);
    const hall = fresh.structures.find((st) => st.type === "townhall");
    if (hall) {
      cam.current.x = Math.max(0, hall.x * TILE + 56 - VIEW_W / 2);
      cam.current.y = Math.max(0, hall.y * TILE + 28 - VIEW_H / 2);
    }
    setGame(fresh);
  }

  const s = game;
  if (!s) return <div className="town-loading">Founding the town…</div>;

  const clk = clock(s.time);
  const run = (fn: () => string | null) => {
    say(fn());
    setTick((n) => n + 1);
  };
  const sel = byId(s, selected);
  const pop = s.villagers.length;
  const avgHealth = pop ? s.villagers.reduce((a, v) => a + v.health, 0) / pop : 100;
  const avgHappy = pop ? s.villagers.reduce((a, v) => a + v.happy, 0) / pop : 60;

  async function enterFull() {
    setFull(true);
    try {
      await rootRef.current?.requestFullscreen?.({ navigationUI: "hide" });
    } catch {
      /* no Fullscreen API (some phones): the fixed layout still fills the window */
    }
    try {
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {
      /* orientation lock is not allowed everywhere; landscape is then up to the player */
    }
  }
  /** Carries out one of the steward's suggestions: one tap, whatever it takes. */
  function act(a: Act) {
    const live = stateRef.current;
    if (!live) return;
    switch (a.kind) {
      case "build":
        setTool({ kind: "build", type: a.type });
        say(`Placing a ${CATALOG[a.type].name.toLowerCase()} — tap open ground on the map.`);
        if (full) setQuest(false);
        return;
      case "select": {
        const st = byId(live, a.id);
        if (!st) return;
        setSelected(st.id);
        setTab("info");
        const z = cam.current.zoom;
        cam.current.x = Math.max(0, Math.min(WORLD_W - VIEW_W / z, (st.x + st.w / 2) * TILE - VIEW_W / z / 2));
        cam.current.y = Math.max(0, Math.min(WORLD_H - VIEW_H / z, (st.y + st.h / 2) * TILE - VIEW_H / z / 2));
        return;
      }
      case "upgrade":
        run(() => upgrade(live, ctx, a.id));
        return;
      case "festival":
        run(() => holdFestival(live));
        return;
      case "tab":
        setTab(a.tab);
        return;
      case "inventory":
        setInv(true);
        if (full) setQuest(false);
        return;
      case "review":
        window.location.href = "/review";
        return;
    }
  }

  async function exitFull() {
    setFull(false);
    setQuest(false);
    try {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* already out */
    }
  }

  return (
    <div className={`tg ${full ? "tg-full" : ""}`} ref={rootRef}>
      <div className="tg-top">
        <div className="tg-clock">
          <span className={`tg-season ${clk.season}`}>{clk.season}</span>
          <b>Year {clk.year} · Day {clk.day}</b>
          <span className="mono">{String(clk.hour).padStart(2, "0")}:{String(clk.minute).padStart(2, "0")}{clk.night ? " ☾" : " ☀"}</span>
        </div>
        <WeatherBadge s={s} />
        <div className="tg-speed" role="group" aria-label="Game speed">
          {SPEEDS.map((sp, i) => (
            <button key={sp} className={`tg-sp ${speedIdx === i ? "on" : ""}`} onClick={() => setSpeedIdx(i)}>{sp === 0 ? "❚❚" : `${sp}×`}</button>
          ))}
        </div>
        <Meter label="Hope" value={s.mood} warn={s.mood < 50} hint={s.mood < 50 ? "below half — buildings are deteriorating" : "sets work speed; three days near nothing and the town is abandoned"} />
        <Meter label="Fed" value={s.hunger} warn={s.hunger < 75} hint="how full people's energy and fat stores are" />
        <Meter label="Health" value={avgHealth} warn={avgHealth < 60} />
        <Meter label="Sanity" value={avgHappy} warn={avgHappy < 60} hint="below 35 minds start to break" />
        <div className="tg-pop"><b>{pop}</b>/{totalBeds(s)} beds</div>
        <button className="town-btn sm" onClick={() => run(() => holdFestival(s))} title={`Costs ${costText(FESTIVAL_COST)}`}>
          {s.festivalUntil > s.time ? "Festival!" : "Festival"}
        </button>
        <button
          className="town-btn ghost sm"
          title={scenario === "yours" ? "Start over: a level-1 hall and one home with two villagers" : "Start this preview town over"}
          onClick={() => {
            if (!window.confirm(scenario === "yours"
              ? "Reset the game? Your town is lost for good, and you start again with a level-1 hall and one home with two villagers."
              : "Reset this preview town?")) return;
            resetGame();
          }}
        >
          Reset
        </button>
        {(touch || full) && (
          full
            ? <button className="town-btn sm tg-fullbtn" onClick={exitFull} aria-label="Leave full screen">✕ Exit</button>
            : <button className="town-btn sm tg-fullbtn" onClick={enterFull} aria-label="Play full screen in landscape">⛶ Full screen</button>
        )}
      </div>
      {s.debuffs.length > 0 && (
        <div className="tg-debuffs">{s.debuffs.map((d) => <span key={d.id} className="tg-debuff">{d.label} · {Math.ceil((d.until - s.time) / 60)}h</span>)}</div>
      )}

      <div className="tg-main">
        <div className="tg-mapcol">
          <div className="tg-stage">
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className="town-canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => (ui.current.hover = null)}
              onPointerCancel={(e) => {
                ui.current.pointers.delete(e.pointerId);
                if (!ui.current.pointers.size) ui.current.pinch = null;
              }}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Town map — drag to pan, Ctrl+scroll or pinch to zoom"
            />
            <ResourceHud s={s} ctx={ctx} onSell={(k) => run(() => sell(s, ctx, k, 10))} onOpen={() => setInv(true)} />
            {inv && (
              <InventoryPanel
                s={s}
                onSell={(k) => run(() => sell(s, ctx, k, 10))}
                onClose={() => setInv(false)}
                onBuildStore={() => {
                  setInv(false);
                  setTool({ kind: "build", type: "storehouse" });
                }}
              />
            )}
            <canvas
              ref={miniRef} width={MINI_W} height={MINI_H} className="tg-mini"
              onPointerDown={onMiniDown} onPointerMove={onMiniMove} onPointerUp={onMiniUp}
              title="Drag to look around the map; click to go there"
              aria-label="Minimap — drag to look around, click to go there"
            />
            {s.fallen && !s.fallen.seen && (
              <div className="tg-fallen" role="dialog" aria-label="The town has fallen">
                <p className="town-kicker">The run is over</p>
                <h2 className="town-title">The town fell on day {s.fallen.day}</h2>
                <p className="town-sub">{bestDay(scenario) > s.fallen.day ? `Your best is day ${bestDay(scenario)}.` : "Your longest yet."} Start again, or stay and rebuild from the ruins — the tally stays where it fell.</p>
                <div className="town-row">
                  <button className="town-btn" onClick={resetGame}>Start again</button>
                  <button className="town-btn ghost" onClick={() => {
                    const live = stateRef.current;
                    if (live?.fallen) live.fallen.seen = true;
                    setTick((n) => n + 1);
                  }}>Rebuild from the ruins</button>
                </div>
              </div>
            )}
            {s.victory && !s.victory.seen && (
              <div className="tg-fallen tg-victory" role="dialog" aria-label="The end-game phase">
                <p className="town-kicker">The end-game phase</p>
                <h2 className="town-title">Day {s.victory.day}: the summit</h2>
                <p className="town-sub">{s.victory.how}</p>
                <div className="town-row">
                  <button className="town-btn" onClick={() => {
                    const live = stateRef.current;
                    if (live?.victory) live.victory.seen = true;
                    setTick((n) => n + 1);
                  }}>Play on</button>
                </div>
              </div>
            )}
            {s.raid && (
              <div className="town-alarm">
                <span className="town-alarm-name">{partyName(s.raid.party)}</span>
                {s.raid.phase === "incoming" ? (
                  <span className="town-alarm-time">{Math.max(0, Math.ceil((s.raid.arrivesAt - s.time) / 60))}h</span>
                ) : (
                  <span className="town-alarm-time">⚔ {s.raid.combatants.filter((u) => u.side === "monster" && u.hp > 0).length} left</span>
                )}
              </div>
            )}
            {toast && <div className="tg-toast">{toast}</div>}
            <UndoBar s={s} onCancel={(id) => run(() => cancelWork(s, id))} />
            {full && !quest && (
              <button className="tg-quest-btn" onClick={() => setQuest(true)} aria-label="Open the quest log">
                <span aria-hidden>▤</span> Quest log{s.raid ? " !" : ""}
              </button>
            )}
          </div>
          <div className="tg-tools">
            <ToolBtn label="Select" on={tool.kind === "select"} onClick={() => setTool({ kind: "select" })} />
            <ToolBtn label={`Road · ${costText(PAVEMENT_COST)}`} on={tool.kind === "pavement"} onClick={() => setTool({ kind: "pavement" })} />
            <ToolBtn label={`Wall · ${costText(WALL_COST)}`} on={tool.kind === "wall"} onClick={() => setTool({ kind: "wall" })} />
            <ToolBtn label={`Gate · ${costText(GATE_COST)}`} on={tool.kind === "gate"} onClick={() => setTool({ kind: "gate" })} />
            <ToolBtn label="Clear" on={tool.kind === "clear"} onClick={() => setTool({ kind: "clear" })} />
            <ToolBtn label="Dig channel" on={tool.kind === "dig"} onClick={() => setTool({ kind: "dig" })} />
            <ToolBtn label="Fill water" on={tool.kind === "fill"} onClick={() => setTool({ kind: "fill" })} />
            <ToolBtn label="Raise wall" on={tool.kind === "upwall"} onClick={() => setTool({ kind: "upwall" })} />
            <ToolBtn label="Remove road/wall" on={tool.kind === "unpave"} onClick={() => setTool({ kind: "unpave" })} />
            <ToolBtn label="Demolish" on={tool.kind === "demolish"} onClick={() => setTool({ kind: "demolish" })} danger />
          </div>
          <p className="tg-hint">
            {tool.kind === "build" ? `Placing ${CATALOG[tool.type].name} — click to place, shift-click to place several.` :
              tool.kind === "move" ? "Moving a building — tap its new plot. It is out of use while the movers carry it, and building stops at night without a night shift." :
              tool.kind === "pavement" || tool.kind === "wall" || tool.kind === "gate" ? "Drag to lay a line; it bends once at the corner." :
              tool.kind === "clear" ? "Drag a box over trees, rocks or rubble — idle villagers clear it for resources." :
              tool.kind === "dig" ? `Drag out from the river to dig a channel. Slow: ${DIG_HOURS} villager-hours a tile (half with tools). Remove road/wall over a marked tile cancels it.` :
              tool.kind === "fill" ? `Drag over water to fill it in from the bank. ${FILL_HOURS} villager-hours a tile (half with tools).` :
              tool.kind === "demolish" ? "Click a building to tear it down. It leaves rubble to clear." :
              tool.kind === "upwall" ? "Drag a box over wall and gate to raise every tile in it a level: more hits to break, and at 10, 20 and 30 rebuilt grander. Click a wall with Select to see its level." :
              tool.kind === "scout" ? "Tap where to go — anywhere in the fog. The hero eats a ration every 12 hours and burns a torch every 2; lighting the last one turns them home. No torch beyond the town's light and they lose the way." :
              "Drag to pan · Ctrl+scroll or pinch to zoom · tap a building to manage it, or open ground to build there · minimap to jump. Only troops posted to a watchtower defend."}
          </p>
        </div>

        <div className={full ? `tg-side tg-quest ${quest ? "open" : ""}` : "tg-side"} role={full ? "dialog" : undefined} aria-label={full ? "Quest log" : undefined}>
          {full && (
            <div className="tg-quest-head">
              <span>✦ Quest log ✦</span>
              <button className="tg-quest-close" onClick={() => setQuest(false)} aria-label="Close the quest log">✕</button>
            </div>
          )}
          <div className="tg-tabs" role="tablist">
            {(["build", "info", "hall", "raid", "trade", "log", "trophy"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tg-tab ${tab === k ? "on" : ""} ${(k === "raid" && s.raid) || (k === "trade" && s.caravan) ? "alert" : ""}`} onClick={() => setTab(k)}>
                {{ build: "Actions", info: sel ? "Building" : tileSel !== null ? "Here" : "Building", hall: "Census", raid: "Raids", trade: "Trade", log: "Chronicle", trophy: "Trophies" }[k]}
              </button>
            ))}
          </div>
          <div className="tg-panel">
            {tab === "build" && (
              <>
                <NextActions s={s} ctx={ctx} onAct={act} onReveal={() => run(() => {
                  const h = revealHint(s, ctx);
                  return typeof h === "string" ? h : null;
                })} />
                <BuildPanel s={s} tool={tool} setTool={(t) => {
                  setTool(t);
                  if (full) setQuest(false); // back to the map to place it
                }} />
              </>
            )}
            {tab === "info" && (sel ? <InfoPanel s={s} st={sel} ctx={ctx} run={run} input={input} onMove={(id) => {
              setTool({ kind: "move", id });
              if (full) setQuest(false);
            }} onScout={(id) => {
              setTool({ kind: "scout", villagerId: id });
              if (full) setQuest(false);
            }} />
              : tileSel !== null && harvestYield(s, tileSel) ? <TilePanel s={s} tile={tileSel} run={run} />
              : tileSel !== null && s.map.terrain[tileSel] === Terrain.Forest ? <ForestPanel s={s} tile={tileSel} />
              : tileSel !== null && (s.map.overlay[tileSel] === Overlay.Wall || s.map.overlay[tileSel] === Overlay.Gate) ? <WallPanel s={s} tile={tileSel} run={run} />
              : tileSel !== null ? <BuildHere s={s} tile={tileSel} preview={(p) => (previewRef.current = p)} build={(type, x, y) => {
                previewRef.current = null;
                const err = place(s, ctx, type, x, y);
                run(() => err);
                if (!err) {
                  setTileSel(null);
                  if (full) setQuest(false);
                }
              }} />
              : <p className="town-sub">Tap a building on the map — or open ground to build there, a tree, rock, rubble or wild crop to gather it, or a forest to see its wood.</p>)}
            {tab === "hall" && (
              <>
                <Goal s={s} scenario={scenario} />
                <StudyPanel s={s} input={input} />
                <SocietyPanel s={s} run={run} />
                <CensusPanel s={s} run={run} />
                <LeisurePanel s={s} run={run} />
                <LegendsPanel s={s} run={run} />
                <StoresPanel s={s} />
              </>
            )}
            {tab === "raid" && (
              <>
                <RaidPanel s={s} ctx={ctx} run={run} />
                <GatesList s={s} run={run} />
              </>
            )}
            {tab === "trade" && <TradePanel s={s} run={run} />}
            {tab === "trophy" && <TrophyPanel s={s} />}
            {tab === "log" && (
              <ol className="tg-log">
                {s.log.map((l, i) => (
                  <li key={i} className={l.tone}><span className="mono">D{clock(l.t).day} {String(clock(l.t).hour).padStart(2, "0")}h</span> {l.text}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Walkers ───────────────────────────────────────────────

/** What the walkers depend on: who works where, what stands, and the roads. */
function walkersKey(s: GameState): string {
  let roads = 0;
  for (let i = 0; i < s.map.terrain.length; i++) if (s.map.terrain[i] === Terrain.Pavement) roads = (roads * 31 + i) | 0;
  return `${roads}|${s.structures.map((x) => `${x.id}${x.buildUntil ? "b" : ""}`).join(",")}|${s.villagers.map((v) => `${v.id}:${v.work ?? ""}:${v.house ?? ""}${v.scout ? "s" : ""}`).join(",")}`;
}

/** The longest a town has lasted in this slot, kept in the browser. */
function bestDay(scenario: string): number {
  try {
    return Number(localStorage.getItem(`xtnl-town-best:${scenario}`) ?? 0);
  } catch {
    return 0;
  }
}
function recordDay(scenario: string, day: number) {
  try {
    if (day > bestDay(scenario)) localStorage.setItem(`xtnl-town-best:${scenario}`, String(day));
  } catch {
    /* private mode */
  }
}


const WALKER_KIND: Partial<Record<string, TroopArt>> = { trader: "merchant", fisher: "fisher" };
const MILITARY_ROLES = ["infantry", "archer", "heavy", "wizard", "knight"];

/** Paths for the day's commute: house to workplace, farmers across grass. */
/**
 * Who is out on the streets. Free villagers wander all day between their
 * home and the town's gathering places; everyone with work is seen only on
 * the way — to work in the morning, home in the evening, once each a day.
 */
function computeWalkers(s: GameState): Walker[] {
  const occ = occupancy(s);
  const out: Walker[] = [];
  const r = rng(s.villagers.length + s.structures.length);
  const haunts = s.structures.filter((st) => !st.buildUntil && ["market", "townhall", "pitfire", "kitchen", "school", "storehouse"].includes(st.type));
  const hall = s.structures.find((st) => st.type === "townhall");
  for (const v of s.villagers) {
    if (out.length >= 40) break;
    if (isAway(s, v)) continue;
    const kind: Look = MILITARY_ROLES.includes(v.role) ? troopLook(v.role === "infantry" ? "footman" : v.role, v.rank) : WALKER_KIND[v.role] ?? "villager";
    const home = byId(s, v.house) ?? hall;
    if (!home) continue;
    const work = byId(s, v.work);
    if (work) {
      if (home.id === work.id) continue;
      const farmer = v.role === "farmhand" || v.role === "biologist";
      const path = findPath(s, home, work, farmer, occ);
      if (path) out.push({ kind, id: v.id, path, offset: 0, speed: 0, mode: "commute", leave: Math.floor(r() * 90) });
      continue;
    }
    if (v.role !== "idle") continue;
    // A free villager: out and back between home and somewhere people gather.
    const places = haunts.filter((h) => h.id !== home.id);
    if (!places.length) continue;
    const to = places[Math.floor(r() * places.length)];
    const path = findPath(s, home, to, true, occ);
    if (path) out.push({ kind, id: v.id, path, offset: r() * path.length * 2, speed: 1.2 + r() * 0.8, mode: "wander" });
  }
  return out;
}

// ── Small components ──────────────────────────────────────

function Meter({ label, value, warn, hint }: { label: string; value: number; warn?: boolean; hint?: string }) {
  return (
    <div className={`tg-meter ${warn ? "warn" : ""}`} title={hint}>
      <span>{label}</span>
      <span className="tg-bar"><span style={{ width: pct(value) }} /></span>
      <b>{pct(value)}</b>
    </div>
  );
}

function ToolBtn({ label, on, onClick, danger }: { label: string; on: boolean; onClick: () => void; danger?: boolean }) {
  return <button className={`tg-tool ${on ? "on" : ""} ${danger ? "danger" : ""}`} onClick={onClick}>{label}</button>;
}


/** A pixel icon, drawn at an integer scale so it stays crisp. */

/**
 * The store, in the frame: every resource the town holds, with its icon, laid
 * over the top of the map. Click one to sell ten at the market. After dusk it
 * also counts the buildings no light reaches.
 */
/**
 * The steward's hint: one next best action a game day, sealed until asked
 * for. Red is the town in danger now, amber is trouble coming, green is the
 * way forward. Between hints the card only says when the next one comes —
 * reading the town is the player's job.
 */
function NextActions({ s, ctx, onAct, onReveal }: { s: GameState; ctx: SimContext; onAct: (a: Act) => void; onReveal: () => void }) {
  const { shown, ready, nextIn } = hintState(s);
  const tag = { now: "Do this now", soon: "Next", grow: "To grow" } as const;
  void ctx;
  return (
    <div className="tg-next">
      <p className="town-kicker">The steward&apos;s counsel</p>
      {shown ? (
        <div className={`tg-next-card ${shown.urgency}`}>
          <span className="tg-next-tag">{tag[shown.urgency]} · given {Math.max(0, Math.floor((s.time - shown.at) / 60))}h ago</span>
          <h3>{shown.title}</h3>
          <p>{shown.why}</p>
          <button className="town-btn" onClick={() => onAct(shown.act)}>{shown.cta} →</button>
          <p className="town-dim">{ready ? "Another hint is ready." : `The next hint in ${Math.ceil(nextIn / 60)}h.`}</p>
        </div>
      ) : ready ? (
        <div className="tg-next-card sealed">
          <span className="tg-next-tag">One hint a day</span>
          <h3>The steward has one piece of advice</h3>
          <p>Open it for the single best thing to do now. After that the steward keeps counsel for a day — the rest is yours to read.</p>
          <button className="town-btn" onClick={onReveal}>Reveal the next best action</button>
        </div>
      ) : (
        <div className="tg-next-card sealed">
          <span className="tg-next-tag">Sealed</span>
          <h3>The steward keeps counsel</h3>
          <p>The next hint in {Math.ceil(nextIn / 60)}h. Until then: the bar over the map, the warnings on the buildings and the Chronicle tell you what you need.</p>
        </div>
      )}
      <p className="town-kicker tg-next-then">Build</p>
    </div>
  );
}

/**
 * Anything just ordered — a new build or an upgrade — can be called off for
 * ten real seconds with everything given back. This counts it down over the
 * map; it keeps its own clock, so it counts even with the game paused.
 */
function UndoBar({ s, onCancel }: { s: GameState; onCancel: (id: number) => void }) {
  const [, setNow] = useState(0);
  const open = s.structures.filter((st) => cancelLeft(st) > 0).sort((a, b) => (b.undo?.at ?? 0) - (a.undo?.at ?? 0));
  useEffect(() => {
    if (!open.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [open.length]);
  const st = open[0];
  if (!st?.undo) return null;
  const left = cancelLeft(st);
  return (
    <div className="tg-undo" role="status">
      <span>{st.undo.kind === "build" ? `${CATALOG[st.type].name} ordered` : `${CATALOG[st.type].name} → level ${st.level}`}</span>
      <button className="town-btn sm" onClick={() => onCancel(st.id)}>Cancel · full refund</button>
      <i className="tg-undo-clock" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
        <i style={{ width: `${(left / CANCEL_MS) * 100}%` }} />
      </i>
      <b>{Math.ceil(left / 1000)}s</b>
    </div>
  );
}

/**
 * Monster parts set into a watchtower or a mage spire past level 10: what
 * they give now, and what the forge's store holds to set. Every part gives
 * less than the one before.
 */
function AugmentPanel({ s, st, run }: { s: GameState; st: Structure; run: (fn: () => string | null) => void }) {
  const b = augBonus(st);
  const feet = Object.entries(st.aug?.feet ?? {});
  const held = [...new Set(stash(s).map((x) => x.item))].filter((i) => i === "heart" || i === "eye" || i === "jewel" || isFoot(i));
  return (
    <div className="tg-aug">
      <p className="town-kicker" style={{ marginTop: 10 }}>Monster parts</p>
      {st.level < AUG_LEVEL ? (
        <p className="town-dim">At level {AUG_LEVEL} this can take parts from high-tier monsters: feet (faster strikes against their kind), hearts (passive reach), jewels (damage) and eyes (active reach).</p>
      ) : (
        <>
          <p className="town-sub">
            Damage +{Math.round(b.jewel * 100)}% · passive reach +{b.heart.toFixed(1)} · active reach +{b.eye.toFixed(1)}
            {feet.length ? ` · faster against ${feet.map(([k, n]) => `${MONSTERS[k as MonsterKind]?.name ?? k} (+${Math.round(dimReturn(AUG_CAP.foot, n) * 100)}%)`).join(", ")}` : ""}
            {st.type === "wizardhut" ? " — for every wizard the town sends to fight." : "."}
          </p>
          {canAugment(st) && held.length > 0 ? (
            <div className="town-row wrap">
              {held.map((item) => {
                const kind = isFoot(item) ? "foot" : (item as "heart" | "eye" | "jewel");
                return (
                  <button key={item} className="town-btn ghost sm" onClick={() => run(() => augment(s, st.id, item))} title={`Each gives less than the last: ${AUG_LABEL[kind]}`}>
                    <IconCanvas id={item} /> Set a {(partLabel(item) ?? PARTS[item as keyof typeof PARTS]?.name ?? item).toLowerCase()} ({stock(s, item)})
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="town-dim">No feet, hearts, jewels or eyes in the forge&apos;s store. Monsters of level 10 and up leave them.</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Rest and wonder: send someone to the museum for three hours, or on a
 * day's journey. Both mend sanity and lift the town's hope; neither works
 * while away.
 */
function LeisurePanel({ s, run }: { s: GameState; run: (fn: () => string | null) => void }) {
  const [who, setWho] = useState<number | null>(null);
  const pool = couldGo(s).sort((a, b) => a.happy - b.happy);
  const pick = who && pool.some((v) => v.id === who) ? who : pool[0]?.id;
  const m = openMuseum(s);
  const away = s.villagers.filter((v) => isAwayLeisure(s, v));
  return (
    <div className="tg-leisure">
      <p className="town-kicker" style={{ marginTop: 10 }}>Rest and wonder</p>
      <p className="town-dim">
        The museum: {MUSEUM_HOURS} hours among the town&apos;s paintings — sanity back, and a little hope for everyone{m ? "" : " (build one, and put an artist to work in it)"}.
        A journey: a day away on {costText(TRAVEL_COST)} — far more of both. Good dishes from the kitchens lift hope too.
      </p>
      {pool.length > 0 && (
        <div className="town-row wrap">
          <select className="town-select" value={pick ?? ""} onChange={(e) => setWho(Number(e.target.value))}>
            {pool.map((v) => <option key={v.id} value={v.id}>{v.name} — sanity {Math.round(v.happy)}</option>)}
          </select>
          <button className="town-btn ghost sm" disabled={!m || !pick} onClick={() => pick && run(() => sendToMuseum(s, pick))}>To the museum ({MUSEUM_HOURS}h)</button>
          <button className="town-btn ghost sm" disabled={!pick} onClick={() => pick && run(() => sendTravelling(s, pick))}>On a journey ({TRAVEL_HOURS}h)</button>
        </div>
      )}
      {away.length > 0 && (
        <p className="town-dim">Away: {away.map((v) => `${v.name} (${v.awayFor === "travel" ? "travelling" : "at the museum"}, ${Math.ceil(((v.awayUntil ?? 0) - s.time) / 60)}h)`).join(", ")}.</p>
      )}
    </div>
  );
}

function BuildPanel({ s, tool, setTool }: { s: GameState; tool: Tool; setTool: (t: Tool) => void }) {
  const cats = ["civic", "food", "industry", "military", "infrastructure"] as const;
  return (
    <div className="tg-build">
      {cats.map((cat) => (
        <section key={cat}>
          <p className="town-kicker">{cat}</p>
          {BUILDABLE.filter((t) => CATALOG[t].category === cat).map((t) => {
            const def = CATALOG[t];
            const afford = Object.entries(def.cost).every(([k, v]) => s.res[k as keyof GameState["res"]] >= (v as number));
            const on = tool.kind === "build" && tool.type === t;
            return (
              <button key={t} className={`tg-bitem ${on ? "on" : ""} ${afford ? "" : "poor"}`} onClick={() => setTool({ kind: "build", type: t })}>
                <b>{def.name}</b> <span className="town-dim">{def.w}×{def.h} · {costText(def.cost)}</span>
                <span className="tg-bblurb">{def.blurb}</span>
                {def.rules.map((r) => <span key={r} className="tg-brule">• {r}</span>)}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function InfoPanel({ s, st, ctx, run, input, onScout, onMove }: { s: GameState; st: Structure; ctx: SimContext; run: (fn: () => string | null) => void; input: TownInput; onScout: (villagerId: number) => void; onMove: (id: number) => void }) {
  const def = CATALOG[st.type];
  const links = computeLinks(s);
  const workers = st.workers.map((id) => s.villagers.find((v) => v.id === id)).filter(Boolean) as GameState["villagers"];
  const clk = clock(s.time);
  const upCost = st.level < def.maxLevel ? def.upgrade(st.level) : null;
  const maxHp = def.hpPerLevel * st.level;
  const slots = def.slots(st.level);
  return (
    <div className="tg-info">
      <p className="town-kicker">Level {st.level}{st.buildUntil ? ` · building (${Math.ceil((st.buildUntil - s.time) / 60)}h)` : ""}</p>
      <h2 className="town-title">{st.type === "house" || st.type === "apartment" ? homeTitle(st.type, st.level) : def.name}{st.type === "townhall" ? ` · ${HALL_AGES[hallAge(st.level)]}` : grade(st.level) ? ` · ${GRADE_NAMES[grade(st.level)]}` : ""}</h2>
      <p className="town-sub">{def.blurb}</p>
      <div className="tg-stats">
        <Meter label="HP" value={(st.hp / maxHp) * 100} warn={st.hp < maxHp * 0.5} />
        {st.type !== "townhall" && <Meter label="Condition" value={st.condition} warn={st.condition < 50} hint="falls while mood is below half" />}
      </div>

      <EffectList list={buildingEffects(s, ctx).get(st.id) ?? []} />
      <ZonePanel s={s} st={st} run={run} />

      {st.type === "townhall" && <CensusPanel s={s} compact />}

      {(st.type === "house" || st.type === "apartment") && (
        <>
          {st.type === "house" && (
            <p className="town-dim">
              {HOME_TIERS.map((t, i) => `${i === homeTier(st.level) ? "▸ " : ""}${t.name} (${t.from}+)`).join(" · ")} · Apartment (two duplexes joined)
            </p>
          )}
          {st.type === "house" && st.level >= COMBINE_FROM && (() => {
            const partners = combinePartners(s, st.id);
            return (
              <div className="tg-combine">
                <p className="town-kicker" style={{ marginTop: 8 }}>Join into an apartment</p>
                {partners.length ? partners.map((b) => (
                  <button key={b.id} className="town-btn sm" onClick={() => run(() => combineHomes(s, st.id, b.id))}>
                    Join with the duplex at {b.x},{b.y} ({costText(COMBINE_COST)})
                  </button>
                )) : <p className="town-dim">Stand another duplex flush beside this one — same row, touching — and they can be joined into an apartment block.</p>}
              </div>
            );
          })()}
          <p className="town-sub">
            {residents(s, st).length}/{beds(s, st)} beds · {st.zone ? `${Math.round(st.zone.T)} °C inside` : ""}
            {st.breakUntil && st.breakUntil > s.time ? ` · on break ${Math.ceil((st.breakUntil - s.time) / 60)}h` : ""}
          </p>
          <div className="town-row wrap">
            <button className="town-btn sm" disabled={(st.bedUpgrades ?? 0) >= maxBedUpgrades(st.level)} onClick={() => run(() => buyBed(s, st.id))}>
              Add bed ({costText(bedUpgradeCost(st.bedUpgrades ?? 0))})
            </button>
            <button className="town-btn ghost sm" onClick={() => run(() => sendOnBreak(s, st.id))}>Send on break (8h)</button>
          </div>
          <p className="town-kicker" style={{ marginTop: 10 }}>Utilities {(st.utilities ?? []).length}/{utilitySlots(st.level)}</p>
          <div className="town-row wrap">
            {UTILITIES.map((u) => {
              const has = (st.utilities ?? []).includes(u.id);
              return (
                <button key={u.id} className={`town-tag ${has ? "" : "off"}`} disabled={has} onClick={() => run(() => addUtility(s, st.id, u.id))} title={`${costText(u.cost)} · +${u.happy} happiness/h`}>
                  {u.name}
                </button>
              );
            })}
          </div>
          <ul className="tg-people">
            {residents(s, st).map((v) => (
              <li key={v.id}><b>{v.name}</b> <span>{titleOf(v)}</span> <span className="town-dim">♥{Math.round(v.health)} ☺{Math.round(v.happy)}</span> <Vitals s={s} v={v} /></li>
            ))}
          </ul>
        </>
      )}

      {(st.type === "farm" || st.type === "waterfarm") && (() => {
        const w = workers[0];
        const rank = w ? (w.role === "biologist" ? 4 : Math.min(4, w.rank)) : 0;
        const crops: readonly string[] = st.type === "farm" ? LAND_CROPS : WATER_CROPS;
        const irr = irrigation(s, st);
        const reach = farmReachesMarket(s, links, st);
        return (
          <>
            <div className="town-row wrap">
              {crops.map((cr) => (
                <button key={cr} className={`town-tag ${st.mode === cr ? "" : "off"}`} onClick={() => run(() => setMode(s, st.id, cr))}>{cr} ({CROP_YIELD[cr]}/h)</button>
              ))}
            </div>
            <ul className="town-checks">
              <li data-ok={irr >= 1 ? "1" : undefined}>{irr >= 1 ? "✓" : "✗"} Irrigation {Math.round(irr * 100)}%{irr < 1 ? " — needs a watermill in range at this level" : ""}</li>
              <li data-ok={reach ? "1" : undefined}>{reach ? "✓ Paved route to the market" : "✗ No paved route to a market — the harvest is lost"}</li>
              <li data-ok={w ? "1" : undefined}>{w ? `✓ ${w.name}, ${titleOf(w)} — ${Math.round(FARM_LOSS[rank] * 100)}% of the crop lost` : "✗ No worker — every block needs one"}</li>
            </ul>
            <p className="town-dim">Blocks touching others of the same crop grow 12% faster each.</p>
            <SoilPanel st={st} />
            {clock(s.time).season === "winter" && (
              <p className="town-sub warn-text">
                {fieldFrozen(s, st, true) ? "Iced over — no pit fire reaches this field, so nothing grows until spring."
                  : growsInWinter(st) ? "Winter: potatoes keep growing here, inside the fire's warmth."
                  : "Winter: only potatoes grow. This field lies dormant until spring unless you switch it to potatoes."}
              </p>
            )}
          </>
        );
      })()}

      {st.type === "refinery" && (
        <div className="town-row wrap">
          {RECIPES.map((r) => (
            <button key={r.id} className={`town-tag ${st.mode === r.id ? "" : "off"}`} onClick={() => run(() => setMode(s, st.id, r.id))} title={`${costText(r.input)} → ${costText(r.output)}`}>
              {r.name}{r.scientist ? " (scientists)" : ""}
            </button>
          ))}
        </div>
      )}

      {st.type === "pitfire" && <FireFuel s={s} st={st} run={run} />}
      {st.type === "mine" && (
        <p className="town-sub">
          {Math.round(hallDistance(s, st))} tiles from the hall: {(mineRareRate(s, st) * 100).toFixed(1)}% an hour of striking something precious
          (0.5% close in, up to 8% far out), before depth and geologists. Silver most often, then platinum, diamond, and gold rarest.
        </p>
      )}
      {st.type === "townhall" && (
        <p className="town-sub">
          Its reach: {hallRadius(st.level)} tiles{st.level < 20 ? ` (${hallRadius(st.level + 1)} at level ${st.level + 1})` : ""}. Homes and schools must stand inside it — the violet
          circle when one is being placed. Buildings far outside it draw more raids, and stronger ones.
        </p>
      )}
      {st.type === "lamppost" && <p className="town-sub">Lights everything within {lightRange(st)} tiles. Needs no fuel.</p>}
      {st.type === "brazier" && <p className="town-sub">{(st.fuel ?? 0) > 0 ? `Burning — lights everything within ${lightRange(st)} tiles.` : "Out — no coal in store."} Burns a little coal every night hour.</p>}
      {!LIGHT_TYPES.includes(st.type) && !st.buildUntil && !isLit(s, st) && (
        <p className="town-sub warn-text">☾ No light reaches this building. At night something will come for it — put a fire, brazier or lamp nearby.</p>
      )}
      {st.type === "forge" && <ForgePanel s={s} st={st} ctx={ctx} run={run} />}
      {st.type === "armypoint" && <ArmyPointCaptain s={s} st={st} />}
      {(st.type === "watchtower" || st.type === "armypoint") && <TowerGuards s={s} st={st} run={run} />}
      {st.type === "storehouse" && (
        <p className="town-sub">
          This storehouse keeps {STORE_PER_LEVEL * st.level} of every bulk good — coal, iron, every crop and catch, planks, bricks, ice, peat, salt —
          and adds the same to the hall&apos;s wood, stone, potatoes and meals. All the storehouses together hold {storeRoom(s)} of each. Anything an
          hour brings in past that is wasted.
        </p>
      )}
      {st.type === "laboratory" && (() => {
        const sci = workers.filter((v) => v.role === "scientist").length;
        return (
          <>
            <p className="town-sub">{sci} scientist{sci === 1 ? "" : "s"} at the bench — each works the recipe {st.level} time{st.level === 1 ? "" : "s"} an hour. In store: {Math.floor(s.res.formula)} formula · {Math.floor(s.res.tonic)} tonic · {Math.floor(s.res.fertiliser)} fertiliser.</p>
            <ul className="tg-dishes">
              {LAB_RECIPES.map((r) => {
                const stocked = Object.entries(r.input).every(([k, n]) => s.res[k as keyof GameState["res"]] >= (n as number));
                return (
                  <li key={r.id}>
                    <button className={`town-tag ${st.mode === r.id ? "" : "off"}`} onClick={() => run(() => setMode(s, st.id, r.id))}>{r.name}</button>
                    <span className="town-dim">{costText(r.input)} → {costText(r.output)} · {r.blurb}{stocked ? "" : " — missing inputs"}</span>
                  </li>
                );
              })}
            </ul>
          </>
        );
      })()}
      {st.type === "fishery" && (() => {
        const season = FISH_SEASON[clk.season];
        const perHour = workers.reduce((a, v) => a + (FISH_CATCH + v.rank * 1.2), 0) * (1 + 0.2 * (st.level - 1)) * season;
        return (
          <p className="town-sub">
            About {perHour.toFixed(1)} fish an hour ({clk.season}: ×{season}). Fishers climb from angler to master angler and catch more as they do. Fish is a raw food: the kitchen cooks it, and grills it or stews it as a dish.
          </p>
        );
      })()}
      {st.type === "icefactory" && <p className="town-sub">Ice in store: {Math.round(s.res.ice)}. Cuts ice only in winter; summer draws on it to keep the town&apos;s mood up.</p>}
      {st.type === "watermill" && <p className="town-sub">Irrigates farms within 14 tiles, up to level {st.level}.</p>}
      {st.type === "kitchen" && (() => {
        const best = workers.reduce((m, v) => Math.max(m, v.role === "chef" ? v.rank : -1), -1);
        const ladder = LADDERS.chef!;
        return (
          <>
            <p className="town-sub">Meals in store: {Math.round(s.res.meals)}. The best chef here is {best >= 0 ? ladder[best] : "nobody yet"}. A dish needs its crops in store and a chef of its standing; otherwise the kitchen falls back to pottage.</p>
            <ul className="tg-dishes">
              {DISHES.map((d) => {
                const able = best >= d.rank;
                const stocked = Object.entries(d.input).every(([k, n]) => s.res[k as keyof GameState["res"]] >= (n as number));
                return (
                  <li key={d.id}>
                    <button className={`town-tag ${st.mode === d.id || (!st.mode && d.id === "pottage") ? "" : "off"}`} onClick={() => run(() => setMode(s, st.id, d.id))}>{d.name}</button>
                    <span className="town-dim">
                      {d.id === "pottage" ? d.blurb : `${costText(d.input)} → ${d.meals} meals · ${ladder[d.rank]}+${d.mood ? " · mood" : ""}${d.happy ? " · happiness" : ""}${d.health ? " · health" : ""}`}
                      {d.id !== "pottage" && (!able ? " — no chef good enough" : !stocked ? " — missing crops" : "")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        );
      })()}

      {st.type === "school" && (
        st.training ? (
          <p className="town-sub">Training {s.villagers.find((v) => v.id === st.training!.villagerId)?.name} as {st.training.role} — {trainingLeft(st, ctx)}.</p>
        ) : (
          <ul className="tg-courses">
            {COURSES.map((cr) => (
              <li key={cr.role}>
                <button className="town-btn ghost sm" onClick={() => run(() => schoolTrain(s, st.id, cr.role))}>{cr.name}</button>
                <span className="town-dim">{cr.hours}h · {costText(cr.cost)} — {cr.blurb}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {MILITARY_TYPES.includes(st.type) && (() => {
        const garrison = s.villagers.filter((v) => v.work === st.id && isMilitary(v));
        const onGuard = garrison.filter((v) => v.guard != null).length;
        const mine = links.of.get(st.id);
        const houses = s.structures.filter((h) => h.type === "house" && [...(links.of.get(h.id) ?? [])].some((c) => mine?.has(c)));
        return (
          <>
            <ul className="town-checks">
              <li data-ok={onGuard ? "1" : undefined}>{onGuard ? `✓ ${onGuard} of ${garrison.length} posted to a watchtower — they defend` : "✗ Nobody here is posted to a watchtower — these troops will not defend"}</li>
              <li data-ok={houses.length ? "1" : undefined}>{houses.length ? `✓ ${houses.length} house(s) connected — can recruit` : "✗ No house connected by pavement — cannot recruit"}</li>
            </ul>
            {(() => {
              const drill = Math.min(TRAIN_CAP[st.type] ?? 99, Math.max(st.level * 3, st.type === "armyschool" ? 3 : 2));
              const knights = st.type === "armyschool" || st.type === "nobleyard";
              const title = st.type === "wizardhut" ? `level ${st.level * 3}` : `${knights ? knightTitle(drill).name : soldierTitle(drill).name} (level ${drill})`;
              const start = RECRUIT_RANK[st.type] ?? 1;
              return (
                <>
                  <p className="town-sub">
                    Garrison {garrison.length}/{militaryCapacity(st)} · drills up to {title}
                    {st.type !== "wizardhut" ? `${drill < (TRAIN_CAP[st.type] ?? 0) ? `, ${knights ? knightTitle(TRAIN_CAP[st.type]!).name : soldierTitle(TRAIN_CAP[st.type]!).name} once upgraded` : ""}. Higher ranks are earned in battle.` : "."}
                  </p>
                  {knights && <KnightPay s={s} />}
                  {st.training ? (
                    <p className="town-sub">{st.training.recruit ? "Taking on a recruit" : "Training a recruit"} — {trainingLeft(st, ctx)}.</p>
                  ) : (
                    <button className="town-btn sm" onClick={() => run(() => recruit(s, st.id))}>
                      Recruit {knights ? `a ${knightTitle(start).name} (${costText(KNIGHT_RECRUIT)})` : st.type === "wizardhut" ? `(${15 * st.level} coin)` : `a ${soldierTitle(start).name} (${15 * st.level} coin)`} · 4h
                    </button>
                  )}
                </>
              );
            })()}
            <ul className="tg-people">
              {garrison.map((v) => {
                const heroic = (v.role === "wizard" && v.rank >= 15) || (v.role === "knight" && v.rank >= 22);
                const allowed = v.role === "wizard" ? ALLOWED_EMBLEM.wizard : ALLOWED_EMBLEM.knight;
                const options = input.emblems.filter((em) => em.attributes.some((a) => allowed.includes(a)));
                return (
                  <li key={v.id} className="tg-troop">
                    <b>{v.name}</b> <span>{titleOf(v)}</span>
                    {v.role === "knight" && <span className={`town-dim ${v.unpaidSince != null ? "warn-text" : ""}`}> · {knightPay(v.rank)} silver a day{v.unpaidSince != null ? " — UNPAID" : ""}</span>}
                    {isAway(s, v) && <span className="town-dim">— on a sortie, back in {Math.ceil((v.deployedUntil! - s.time) / 60)}h</span>}
                    <GuardPost s={s} v={v} run={run} />
                    {isSpecial(v) && <TroopGear s={s} v={v} run={run} />}
                    {canPack(v) && <HeroPack s={s} v={v} run={run} onScout={onScout} />}
                    {v.role === "wizard" && v.rank >= ASCEND_FROM && <Ascension s={s} v={v} ctx={ctx} run={run} />}
                    {v.role === "knight" && v.rank >= 22 && <EmblemKnight s={s} v={v} run={run} />}
                    {heroic && (
                      <select
                        className="town-select"
                        value={v.emblem?.code ?? ""}
                        onChange={(e) => {
                          const em = options.find((o) => o.code === e.target.value);
                          const attr = em?.attributes.find((a) => allowed.includes(a));
                          run(() => bindEmblem(s, v.id, em && attr ? { code: em.code, name: em.name, attribute: attr, depth: em.depth } : null));
                        }}
                        title="The emblem's depth sets how far this hero can climb"
                      >
                        <option value="">{options.length ? "Bind an emblem…" : "No suitable emblem equipped"}</option>
                        {options.map((o) => <option key={o.code} value={o.code}>{o.name} (d{o.depth} → cap {v.role === "wizard" ? wizardCapFor(o.depth) : knightCapFor(o.depth)})</option>)}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        );
      })()}

      {slots > 0 && (
        <>
          <p className="town-kicker" style={{ marginTop: 12 }}>Workers {workers.length}/{slots}</p>
          {jobEffort(st.type) !== "none" && (
            <p className="town-dim">
              {EFFORT_LABEL[jobEffort(st.type)]} work: a full shift here costs {EFFORT_POINTS[jobEffort(st.type)]} effort. A level-1 worker has 2 a day, one more a level — halved after a cold night or on an empty belly.
            </p>
          )}
          <ul className="tg-people">
            {workers.map((v) => {
              const cap = capacity(v);
              const used = spent(v);
              const w = weakness(v);
              return (
                <li key={v.id}>
                  <b>{v.name}</b> <span>{titleOf(v)}</span>
                  <span className={used > cap ? "warn-text" : "town-dim"} title="Effort spent today, of what they have">
                    {" "}· effort {used.toFixed(1)}/{cap}{used >= cap ? (used > cap ? " — past their strength" : " — spent") : ""}{w.cold || w.hungry ? ` · half strength (${[w.cold && "slept cold", w.hungry && "hungry"].filter(Boolean).join(", ")})` : ""}
                  </span>{" "}
                  {v.nightShift ? (
                    <button className="town-btn ghost sm" onClick={() => run(() => setNightShift(s, v.id, false))} title="Leads the night shift: sleeps by day">☾ night shift · take off</button>
                  ) : workLevel(v) >= NIGHT_SHIFT_LEVEL && (
                    <button className="town-btn ghost sm" onClick={() => run(() => setNightShift(s, v.id, true))} title="Building goes on through the night; they sleep by day">☾ lead the night shift</button>
                  )}{" "}
                  <button className="town-btn ghost sm" onClick={() => run(() => fire(s, v.id))}>release</button>
                </li>
              );
            })}
          </ul>
          {jobEffort(st.type) !== "none" && (
            <label className="tg-overtime" title="Past their strength, workers lose health the next dawn, and may die">
              <input type="checkbox" checked={!!st.overtime} onChange={(e) => run(() => setOvertime(s, st.id, e.target.checked))} />
              {" "}Overtime: drive them on past their strength — each dawn they pay in health, and some do not get up
            </label>
          )}
          {workers.length < slots && (
            <button className="town-btn sm" onClick={() => run(() => hire(s, st.id))} disabled={!!st.buildUntil}>
              Hire ({freeWorkers(s, st.type).length} available)
            </button>
          )}
        </>
      )}

      {(st.type === "watchtower" || st.type === "wizardhut") && <AugmentPanel s={s} st={st} run={run} />}
      {st.type === "museum" && <LeisurePanel s={s} run={run} />}
      {!st.buildUntil && (() => {
        const crew = movers(s);
        return crew.length ? (
          <p className="town-sub">
            <button className="town-btn ghost sm" onClick={() => onMove(st.id)}>Move it</button>{" "}
            {crew.length} mover{crew.length > 1 ? "s" : ""} of level {MOVER_LEVEL}+ · about {Math.ceil(moveHours(st, crew.length))}h (more movers, less time; the higher it stands, the longer)
          </p>
        ) : (
          <p className="town-dim">A worker of level {MOVER_LEVEL} could take this down and carry it to a new plot.</p>
        );
      })()}
      {st.buildUntil && clock(s.time).night && !hasNightShift(s) && (
        <p className="town-sub warn-text">Work stands still for the night. A worker of level {NIGHT_SHIFT_LEVEL} on the night shift would carry it on by torchlight.</p>
      )}

      <div className="town-upgrade">
        {upCost ? (
          <>
            <p className="town-kicker">Upgrade to {st.level + 1}{grade(st.level + 1) > grade(st.level) ? ` — ${GRADE_NAMES[grade(st.level + 1)]}` : ""}</p>
            {grade(st.level + 1) > grade(st.level) && (
              <p className="town-sub">A major step: rebuilt grander, half as many hit points again, a quarter more from everything it does — and something rare on the bill.</p>
            )}
            <p className="town-dim">{costText(upCost)}</p>
            {(() => {
              const need = upgradePeople(st.type, st.level);
              const ok = s.villagers.length >= need;
              return <p className={`town-dim ${ok ? "" : "warn-text"}`}>{ok ? "✓" : "✗"} Needs a town of {need} people — you have {s.villagers.length}.</p>;
            })()}
            {st.type === "townhall" && hallMinDay(st.level + 1) > 0 && (() => {
              const d = hallMinDay(st.level + 1);
              const ok = clock(s.time).day >= d;
              return <p className={`town-dim ${ok ? "" : "warn-text"}`}>{ok ? "✓" : "✗"} The town must have stood until day {d} (year {Math.floor((d - 1) / YEAR_DAYS) + 1}) — it is day {clock(s.time).day}. Level 100 is a twenty-year road.</p>;
            })()}
            {jewelCost(st.level + 1, st.type) > 0 && (
              <p className={`town-dim ${stock(s, "jewel") >= jewelCost(st.level + 1, st.type) ? "" : "warn-text"}`}>
                {stock(s, "jewel") >= jewelCost(st.level + 1, st.type) ? "✓" : "✗"} Set with {jewelCost(st.level + 1, st.type)} monster jewel{jewelCost(st.level + 1, st.type) === 1 ? "" : "s"} from the forge&apos;s store — it has {stock(s, "jewel")}.
              </p>
            )}
            <button className="town-btn" disabled={!!st.buildUntil} onClick={() => run(() => upgrade(s, ctx, st.id))}>Upgrade</button>
            {cancelLeft(st) > 0 && (
              <button className="town-btn ghost" onClick={() => run(() => cancelWork(s, st.id))}>Cancel · full refund ({Math.ceil(cancelLeft(st) / 1000)}s)</button>
            )}
          </>
        ) : (
          <p className="town-dim">At its highest level.</p>
        )}
      </div>
    </div>
  );
}

/** Hours of training left at the current pace. */
function trainingLeft(st: Structure, ctx: SimContext): string {
  const left = st.training?.left ?? 0;
  const pace = trainingPace(ctx.input);
  const h = Math.max(0, Math.ceil(left / pace.factor / 60));
  return `${h}h left at ${Math.round(pace.factor * 100)}% pace`;
}

/** What is acting on a building, with the same colour its radiance has on the map. */
function EffectList({ list }: { list: Effect[] }) {
  if (!list.length) return null;
  return (
    <ul className="tg-effects">
      {list.map((e) => (
        <li key={e.kind} className={`fx-${e.kind} ${e.tone}`}>
          <b>{e.label}</b> <span>{e.detail}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Fire and forest ───────────────────────────────────────

/**
 * A pit fire burns only what is loaded into its own grate. The bar over the
 * fire on the map shows the same fuel: green, amber past half, red in the
 * last fifth.
 */
function FireFuel({ s, st, run }: { s: GameState; st: Structure; run: (fn: () => string | null) => void }) {
  const cap = fuelCap(st.level);
  const fuel = st.fuel ?? 0;
  const clk = clock(s.time);
  const now = burnRate(clk.season, clk.night);
  const perDay = clk.season === "winter" ? burnRate("winter", true) * 10 + burnRate("winter", false) * 14 : burnRate(clk.season, false) * 24;
  const days = fuel / perDay;
  const room = cap - fuel;
  return (
    <>
      <Meter label="Fuel" value={(fuel / cap) * 100} warn={fuel < cap * 0.2} hint={`${Math.round(fuel)} of ${cap}`} />
      <p className="town-sub">
        {fuel > 0 ? `Burning ${now}/h now — about ${days < 1 ? `${Math.round(days * 24)} hours` : `${days.toFixed(1)} days`} left at this season's rate.` : "Out. A cold fire gives no light and no warmth."}{" "}
        Warms and lights everything within {warmthRange(st.level)} tiles{st.level < 30 ? ` (${warmthRange(st.level + 1)} at level ${st.level + 1})` : ""}; in winter it keeps the ground around it from freezing.
        {" "}While lit, the open air in that radius is {fireAirDT(st.level)} °C warmer{st.level < 30 ? ` (${fireAirDT(st.level + 1)} °C at level ${st.level + 1})` : ""}: the rooms there lose less heat, and anyone outdoors feels it.
        Things of the night that come into its light are scorched — slowed, weakened, burning — and any {FIRE_BANISH} or more levels below it
        {st.level > FIRE_BANISH ? ` (level ${st.level - FIRE_BANISH} and under, at this fire)` : ""} are destroyed outright.
      </p>
      {(() => {
        const w = warmFields(s).find((x) => x.id === st.id);
        if (!w) return null;
        const blocked = Array.from(w.reach).filter((r) => r < w.r - 0.01).length;
        return (
          <p className="town-sub">
            {blocked === w.reach.length
              ? "Walled in on every side: it warms its whole yard, right up to the walls, and nothing beyond them."
              : blocked
              ? `Walls stop ${Math.round((blocked / w.reach.length) * 100)}% of its warmth; what they stop is thrown back, so its open side reaches ${w.far.toFixed(1)} tiles instead of ${w.r}.`
              : "No wall in its way: its warmth spreads evenly all round."}{" "}
            Behind a wall stays cold. The dashed line on the map is its reach.
          </p>
        );
      })()}
      <p className="town-kicker" style={{ marginTop: 8 }}>Load the grate · {Math.round(fuel)}/{cap}</p>
      <div className="town-row wrap">
        {[10, 50].map((n) => (
          <button key={`w${n}`} className="town-btn ghost sm" disabled={room < 1 || s.res.wood < 1} onClick={() => run(() => stokeFire(s, st.id, "wood", n))}>+{n} wood</button>
        ))}
        {[10, 30].map((n) => (
          <button key={`c${n}`} className="town-btn ghost sm" disabled={room < 3 || s.res.coal < 1} onClick={() => run(() => stokeFire(s, st.id, "coal", n))}>+{n} coal</button>
        ))}
        <button className="town-btn sm" disabled={room < 1 || (s.res.wood < 1 && s.res.coal < 1)} onClick={() => run(() => {
          const coal = stokeFire(s, st.id, "coal", Infinity);
          const wood = stokeFire(s, st.id, "wood", Infinity);
          return coal && wood; // an error only if neither could load
        })}>Fill</button>
      </div>
      <p className="town-dim">A wood is one unit of fuel, a coal three. Fill uses coal first, then wood. Nothing loads itself: when the grate runs dry, the fire goes out. Summer burns a fifth of the usual; winter burns most.</p>
    </>
  );
}

/** A forest: the wood it holds, and whether it is still growing back. */
function ForestPanel({ s, tile }: { s: GameState; tile: number }) {
  const f = forestOf(s, tile);
  if (!f) return null;
  const season = clock(s.time).season;
  const share = f.wood / f.cap;
  const growing = regrows(f);
  const perHour = growing ? REGROW[season] * f.tiles.length : 0;
  const camps = s.structures.filter((st) => st.type === "lumbercamp" && f.tiles.some((t) => {
    const x = t % MAP_W;
    const y = Math.floor(t / MAP_W);
    return x >= st.x - 4 && x < st.x + st.w + 4 && y >= st.y - 4 && y < st.y + st.h + 4;
  })).length;
  return (
    <div className="tg-info">
      <p className="town-kicker">Tile {tile % MAP_W}, {Math.floor(tile / MAP_W)}</p>
      <h2 className="town-title">Forest</h2>
      <Meter label="Wood" value={share * 100} warn={!growing} hint={`${Math.round(f.wood)} of ${f.cap}`} />
      <p className="town-sub">
        {f.tiles.length} tiles holding {Math.round(f.wood)} of {f.cap} wood. This tile: {Math.round(s.map.meta[tile])} of {TILE_WOOD}.
      </p>
      <p className={`town-sub ${growing ? "" : "warn-text"}`}>
        {growing
          ? perHour > 0 ? `Growing back about ${perHour.toFixed(1)} wood an hour this ${season}.` : "Nothing grows back in winter."
          : `Below ${Math.round(FOREST_FLOOR * 100)}% — it no longer grows back. Every tile cut bare turns to open ground until the forest is gone. Trees that seed into it still add wood.`}
      </p>
      <p className="town-dim">
        {camps ? `${camps} lumber camp${camps === 1 ? "" : "s"} cut${camps === 1 ? "s" : ""} here.` : "No lumber camp works this forest."} Keep it above {Math.round(FOREST_FLOOR * 100)}% and it lasts for ever.
      </p>
    </div>
  );
}

// ── Captains ──────────────────────────────────────────────

/** Who leads an army point, and what they give its guards. */
function ArmyPointCaptain({ s, st }: { s: GameState; st: Structure }) {
  const cap = commanderOf(s, st);
  const k = captainBonus(s, st);
  const { allowed, troops, captains } = armyPointsAllowed(s);
  return (
    <>
      <p className={`town-sub ${cap ? "" : "warn-text"}`}>
        {cap
          ? `${cap.name}, ${titleOf(cap)}, leads here: the guards fight at +${Math.round((k - 1) * 100)}% damage and health.`
          : "No knight leads this camp. Hire one from the staff list — any knight from the army school."}
      </p>
      <p className="town-dim">
        {troops} troops and {captains} knight{captains === 1 ? "" : "s"} in town — enough for {allowed} army point{allowed === 1 ? "" : "s"} (one per {ARMY_PER_POINT} troops, each led by a knight).
      </p>
    </>
  );
}

/** The knights' silver: what the army school's knights cost a day, and how long the store lasts. */
function KnightPay({ s }: { s: GameState }) {
  const knights = s.villagers.filter((v) => v.role === "knight");
  const daily = knights.reduce((a, v) => a + knightPay(v.rank), 0);
  const unpaid = knights.filter((v) => v.unpaidSince != null);
  return (
    <>
      <p className="town-sub">
        Recruits a Noble Squire for {costText(KNIGHT_RECRUIT)} and drills knights up to Mounted Serjeant (level 10). Knight Bachelor, Paladin and
        Noble Knight are won only in battle; Emblem Knight is the road past 22.
      </p>
      <p className={`town-sub ${unpaid.length ? "warn-text" : ""}`}>
        {knights.length
          ? `${knights.length} knight${knights.length === 1 ? "" : "s"} cost ${daily.toFixed(1)} silver a day — ${Math.floor(s.res.silver)} in store, ${daily ? `about ${(s.res.silver / daily).toFixed(1)} days` : "no end"} of pay.`
          : "No knights yet."}
        {unpaid.length ? ` ${unpaid.length} unpaid: three days without silver and a knight leaves.` : ""}
      </p>
    </>
  );
}

// ── Guards ────────────────────────────────────────────────

/**
 * A watchtower's guard: the troops posted here wait inside and come out only
 * when a monster crosses its circle. Nobody else in town defends.
 */
function TowerGuards({ s, st, run }: { s: GameState; st: Structure; run: (fn: () => string | null) => void }) {
  const guards = guardsAt(s, st.id);
  const cap = guardSlots(st.level, st.type);
  const free = s.villagers.filter((v) => isMilitary(v) && v.guard == null);
  return (
    <>
      <p className="town-sub">
        Two circles. The inner one, {alertRadius(st)} tiles from its centre: guards come out for anything that crosses it. The outer one,
        {" "}{passiveRadius(st)} tiles: they come out only for something attacking a building or the wall out there. They fight, then go back in when it is clear.
      </p>
      <p className="town-kicker" style={{ marginTop: 8 }}>Guards {guards.length}/{cap}</p>
      <ul className="tg-people">
        {guards.map((v) => (
          <li key={v.id}><b>{v.name}</b> <span>{titleOf(v)}</span> <button className="town-btn ghost sm" onClick={() => run(() => assignGuard(s, v.id, null))}>stand down</button></li>
        ))}
        {!guards.length && <li className="warn-text">Nobody is posted here. A raid can walk past this tower.</li>}
      </ul>
      {guards.length < cap && (
        <select className="town-select" value="" onChange={(e) => e.target.value && run(() => assignGuard(s, Number(e.target.value), st.id))}>
          <option value="">{free.length ? `Post a troop… (${free.length} unposted)` : "No unposted troops — recruit at a barracks"}</option>
          {free.map((v) => <option key={v.id} value={v.id}>{v.name} — {titleOf(v)}</option>)}
        </select>
      )}
    </>
  );
}

/** A troop's post, from its barracks' list. */
function GuardPost({ s, v, run }: { s: GameState; v: Villager; run: (fn: () => string | null) => void }) {
  const towers = s.structures.filter((t) => isGuardPost(t) && !t.buildUntil);
  return (
    <div className="tg-troop-row">
      <select
        className="town-select"
        value={v.guard ?? ""}
        onChange={(e) => run(() => assignGuard(s, v.id, e.target.value ? Number(e.target.value) : null))}
      >
        <option value="">{towers.length ? "Not on guard — will not defend" : "No watchtower to guard"}</option>
        {towers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.type === "armypoint" ? "Army point" : "Guard tower"} at {t.x},{t.y} ({guardsAt(s, t.id).length}/{guardSlots(t.level, t.type)})
          </option>
        ))}
      </select>
      {v.guard == null && towers.length > 0 && <span className="warn-text">Unposted troops stay in barracks.</span>}
    </div>
  );
}

// ── Loose tiles ───────────────────────────────────────────

/**
 * A tree, rock or rubble tile. Harvesting marks it for the town's idle
 * hands; with nobody idle it still gets done, slowly, after the day's work.
 * Rubble has to go before anything can be built on the plot.
 */
function TilePanel({ s, tile, run }: { s: GameState; tile: number; run: (fn: () => string | null) => void }) {
  const y = harvestYield(s, tile)!;
  const job = s.clearing.find((j) => j.tile === tile);
  const idle = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20).length;
  return (
    <div className="tg-info">
      <p className="town-kicker">Tile {tile % MAP_W}, {Math.floor(tile / MAP_W)}</p>
      <h2 className="town-title">{y.label}</h2>
      <p className="town-sub">Gives {y.gives}.</p>
      {job ? (
        <>
          <Meter label="Work" value={(job.progress / y.effort) * 100} />
          <p className="town-dim">{idle ? `${idle} idle villager${idle === 1 ? "" : "s"} on it` : "Nobody is idle — the town gets to it after work, slowly."}</p>
          <button className="town-btn ghost sm" onClick={() => run(() => cancelClear(s, tile))}>Leave it</button>
        </>
      ) : (
        <button className="town-btn" onClick={() => run(() => clear(s, [tile]))}>{y.verb}</button>
      )}
      <p className="town-dim" style={{ marginTop: 8 }}>The Clear tool marks a whole box of trees, rocks and rubble at once.</p>
    </div>
  );
}

// ── The forge ─────────────────────────────────────────────

/**
 * The forge's store and anvil. The store is a grid of slots — one stack of
 * up to 20 per slot, four slots plus two a level — holding what monsters
 * leave and what the anvil makes. Below it, everything the forge can make,
 * with what each still needs.
 */
function ForgePanel({ s, st, ctx, run }: { s: GameState; st: Structure; ctx: SimContext; run: (fn: () => string | null) => void }) {
  const main = forgeOf(s);
  const slots = main ? armorySlots(main.level) : 0;
  const items = stash(s);
  const craft = st.craft;
  return (
    <>
      <p className="town-kicker" style={{ marginTop: 10 }}>Store {items.length}/{slots} slots · {STACK} to a stack</p>
      {main && main.id !== st.id && <p className="town-dim">The store lives in the highest forge (level {main.level}).</p>}
      <div className="tg-store">
        {Array.from({ length: slots }, (_, i) => {
          const it = items[i];
          const name = it ? GEAR[it.item]?.name ?? PARTS[it.item as keyof typeof PARTS]?.name ?? partLabel(it.item) ?? it.item : "";
          return (
            <div key={i} className={`tg-slot ${it ? "" : "empty"}`} title={it ? `${name} ×${it.qty}` : "Empty slot"}>
              {it && <IconCanvas id={it.item} />}
              {it && it.qty > 1 && <b>{it.qty}</b>}
            </div>
          );
        })}
      </div>
      <p className="town-kicker" style={{ marginTop: 12 }}>
        Anvil {craft ? `— ${GEAR[craft.item]?.name}, ${Math.max(0, Math.ceil((craft.until - s.time) / 60))}h${craft.until <= s.time ? " (waiting for a free slot)" : ""}` : "— idle"}
      </p>
      <ul className="tg-craft">
        {Object.values(GEAR).map((g) => {
          const why = craftCheck(s, g);
          const maker = g.crafter ? crafterFor(s, g) : undefined;
          return (
            <li key={g.id}>
              <IconCanvas id={g.id} />
              <div>
                <b>{g.name}</b> <span className="town-dim">tier {g.tier} {g.slot} · {g.roles.length > 1 ? "any special troop" : g.roles[0]} · {g.hours}h</span>
                <span className="tg-bblurb">
                  {Object.entries(g.parts).map(([p, n]) => `${n} ${PARTS[p as keyof typeof PARTS].name.toLowerCase()} (${stock(s, p)})`).join(" · ")}
                  {Object.keys(g.cost).length ? ` · ${costText(g.cost)}` : ""}
                </span>
                {g.crafter && <span className="tg-brule">• Made by a {g.crafter.role} of level {g.crafter.rank}+{maker ? ` — ${maker.name} can` : ""}</span>}
                {g.tier === 3 && <span className="tg-brule">• {g.blurb}</span>}
              </div>
              <button className="town-btn sm" disabled={!!why || !!main?.craft} title={why ?? ""} onClick={() => run(() => startCraft(s, ctx, g.id))}>Forge</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A special troop's weapon and armour, and what they could put on from the store. */
/** A knight's or wizard's six-slot pack: torches for the fog, and the order to go out into it. */
/** One tile of wall or gate: its level, how much it can take, and raising it. */
function WallPanel({ s, tile, run }: { s: GameState; tile: number; run: (fn: () => string | null) => void }) {
  const gate = s.map.overlay[tile] === Overlay.Gate;
  const meta = s.map.meta[tile];
  const lvl = wallLevel(meta);
  const max = wallMaxHp(lvl, gate);
  const next = lvl < WALL_MAX_LEVEL ? wallUpgradeCost(lvl) : null;
  return (
    <div className="tg-info">
      <p className="town-kicker">Tile {tile % MAP_W}, {Math.floor(tile / MAP_W)}</p>
      <h2 className="town-title">{gate ? "Gate" : "Wall"} · level {lvl}{grade(lvl) ? ` · ${GRADE_NAMES[grade(lvl)]}` : ""}</h2>
      <Meter label="Holds" value={(wallHp(meta) / max) * 100} hint={`${wallHp(meta)} of ${max}`} />
      <p className="town-sub">Takes {max} in blows before it breaks. Each level adds more; at levels 10, 20 and 30 it is rebuilt grander and much stronger.</p>
      {next ? (
        <>
          <p className="town-dim">Level {lvl + 1}: {costText(next)} — {wallMaxHp(lvl + 1, gate)} hit points.</p>
          <button className="town-btn sm" onClick={() => run(() => upgradeWalls(s, [tile]))}>Raise this tile</button>
          <p className="town-dim" style={{ marginTop: 6 }}>The Raise wall tool raises a whole stretch at once.</p>
        </>
      ) : (
        <p className="town-dim">At its highest level.</p>
      )}
    </div>
  );
}

/** Open ground: what could be built here, placed so it covers the tapped tile. */
/** What each kind of ground is good for, shown when it is tapped. */
const GROUND_NOTE: Record<number, string> = {
  [Terrain.Meadow]: "Meadow — rich ground: a farm standing mostly on meadow yields 30% more, and wild crops come up thickest here.",
  [Terrain.Hill]: "Hills — stony high ground: no farms, but a mine here digs 50% more, a watchtower sees 2 tiles further, and raiders climb it slowly.",
  [Terrain.Marsh]: "Marsh — nothing can stand on it. Mark it with Clear to cut peat (and now and then bog iron), or fill it in to firm grass. Raiders flounder in it.",
};

function BuildHere({ s, tile, preview, build }: {
  s: GameState; tile: number;
  preview: (p: { type: StructureType; x: number; y: number } | null) => void;
  build: (type: StructureType, x: number, y: number) => void;
}) {
  const tx = tile % MAP_W;
  const ty = Math.floor(tile / MAP_W);
  const occ = occupancy(s);
  const opts = BUILDABLE.map((t) => ({ t, fit: fitAt(s, t, tx, ty, occ) }));
  const fits = opts.filter((o) => "x" in o.fit) as { t: StructureType; fit: { x: number; y: number } }[];
  const not = opts.filter((o) => "reason" in o.fit) as { t: StructureType; fit: { reason: string } }[];
  return (
    <div className="tg-info">
      <p className="town-kicker">{TERRAIN_NAME[s.map.terrain[tile]] ?? "Ground"} · tile {tx}, {ty}</p>
      <h2 className="town-title">Build here</h2>
      {GROUND_NOTE[s.map.terrain[tile]] && <p className="tg-ground">{GROUND_NOTE[s.map.terrain[tile]]}</p>}
      {fits.length ? (
        <div className="tg-here">
          {fits.map(({ t, fit }) => {
            const def = CATALOG[t];
            const afford = Object.entries(def.cost).every(([k, v]) => s.res[k as keyof GameState["res"]] >= (v as number));
            return (
              <button
                key={t} className={`tg-here-item ${afford ? "" : "poor"}`} disabled={!afford}
                onPointerEnter={(e) => e.pointerType === "mouse" && preview({ type: t, ...fit })}
                onPointerLeave={() => preview(null)}
                onClick={() => build(t, fit.x, fit.y)}
                title={def.blurb}
              >
                <b>{def.name}</b>
                <span>{def.w}×{def.h} · {costText(def.cost) || "free"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="town-sub">Nothing can be built here.</p>
      )}
      {not.length > 0 && (
        <details className="tg-here-not">
          <summary>Won&apos;t fit here ({not.length})</summary>
          <ul>{not.map(({ t, fit }) => <li key={t}><b>{CATALOG[t].name}</b> — {fit.reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function HeroPack({ s, v, run, onScout }: { s: GameState; v: Villager; run: (fn: () => string | null) => void; onScout: (villagerId: number) => void }) {
  const pack = v.pack ?? Array(PACK_SLOTS).fill(null);
  const torches = pack.filter((p) => p?.startsWith("torch")).length;
  const rations = pack.filter((p) => p === "ration").length;
  const reach = adventureReach(v);
  const sc = v.scout;
  return (
    <div className="tg-pack">
      <div className="tg-pack-slots" aria-label="Pack">
        {pack.map((p, i) => {
          const lit = p?.startsWith("torch:");
          const left = lit ? Math.ceil(Number(p!.slice(6)) / 60 * 10) / 10 : 0;
          return (
            <button
              key={i} className={`tg-slot ${p ? "" : "empty"} ${lit ? "lit" : ""}`}
              title={p === "ration" ? "Ration — feeds them half a day. Tap to put it back." : p ? (lit ? `Torch, burning — ${left}h left` : "Torch — burns 2 hours once lit. Tap to put it back.") : "Empty slot"}
              onClick={() => p && run(() => unpackSlot(s, v.id, i))}
            >
              {p === "ration" ? <IconCanvas id="meals" /> : p ? <IconCanvas id="torches" /> : null}
              {lit && <span>{left}h</span>}
            </button>
          );
        })}
      </div>
      {sc ? (
        <span className={sc.lost !== undefined || (sc.fed ?? 1) <= 0 ? "warn-text" : "town-dim"}>
          {sc.lost !== undefined
            ? `Lost for ${Math.round(sc.lost)} minutes, wandering until a landmark — the town's light, the river, a lair — gives them their bearings. Light the ground near them to guide them home.`
            : `On an adventure, ${sc.phase === "out" ? "heading out" : "coming home"} — ${torches} torch${torches === 1 ? "" : "es"}, ${rations} ration${rations === 1 ? "" : "s"} left${(sc.fed ?? 1) <= 0 ? ", starving" : ""}.`}
          {Object.keys(sc.haul ?? {}).length > 0 && ` Found so far: ${Object.entries(sc.haul!).map(([k, n]) => `${n} ${k}`).join(", ")}.`}
        </span>
      ) : (
        <>
          <div className="town-row">
            <button className="town-btn ghost sm" onClick={() => run(() => packTorch(s, v.id))} disabled={s.res.torches < 1 || pack.every(Boolean)}>+ Torch ({Math.floor(s.res.torches)})</button>
            <button className="town-btn ghost sm" onClick={() => run(() => packRation(s, v.id))} disabled={pack.every(Boolean)}>+ Ration ({RATION_MEALS} meals)</button>
            <button className="town-btn sm" onClick={() => onScout(v.id)} disabled={!torches || !rations}>Adventure…</button>
          </div>
          <span className="town-dim">
            {torches && rations
              ? `Carrying ${Math.round(reach.load)} kg at ${reach.pace.toFixed(1)} m/s (${reach.watts} W): light for ${reach.lightHours}h, food for ${reach.foodHours}h — about ${reach.tiles} tiles out and back. They turn home while food and light last the way back; with no torch and no landmark they lose their bearings.`
              : "Pack at least one torch and one ration to set out."}
          </span>
          {torches > 0 && rations > 0 && <NodeList s={s} onSend={(x, y) => run(() => sendScout(s, v.id, x, y))} />}
        </>
      )}
    </div>
  );
}

function TroopGear({ s, v, run }: { s: GameState; v: Villager; run: (fn: () => string | null) => void }) {
  const cap = gearCap(v);
  const slot = (sl: GearSlot) => {
    const cur = gearOf(v, sl);
    const options = stash(s).filter((x) => GEAR[x.item]?.slot === sl && GEAR[x.item].roles.includes(v.role));
    return (
      <span className="tg-gear">
        {cur ? <IconCanvas id={cur.id} /> : <span className="tg-slot empty sm" />}
        <select
          className="town-select"
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (val === "-") run(() => unequip(s, v.id, sl));
            else if (val) run(() => equip(s, v.id, val));
          }}
          title={cur ? cur.name : `No ${sl}`}
        >
          <option value="">{cur ? cur.name : `No ${sl}`}</option>
          {options.map((o) => <option key={o.item} value={o.item}>Equip {GEAR[o.item].name}</option>)}
          {cur && <option value="-">Take off</option>}
        </select>
      </span>
    );
  };
  return (
    <div className="tg-troop-row">
      {slot("weapon")}
      {slot("armour")}
      {v.rank >= cap && cap < 99 && <span className="warn-text">{gearOf(v, "weapon") ? "Needs a better weapon to train further." : "Needs a weapon to train past 8."}</span>}
    </div>
  );
}

/** Past 12, a wizard's every step is an attempt that can end them. */
function Ascension({ s, v, ctx, run }: { s: GameState; v: Villager; ctx: SimContext; run: (fn: () => string | null) => void }) {
  const [formula, setFormula] = useState(false);
  const need = xpToNext(v.rank);
  const ready = v.xp >= need;
  const odds = ascensionOdds(v, ctx, formula && s.res.formula >= 1);
  const capped = v.rank >= ascensionCap(v);
  const unarmed = v.rank + 1 > gearCap(v);
  return (
    <div className="tg-troop-row">
      <span className="town-dim">Study {Math.floor(v.xp)}/{need}{v.xp > need ? ` (+${Math.floor(v.xp - need)} banked)` : ""}</span>
      <label className="town-dim"><input type="checkbox" checked={formula} disabled={s.res.formula < 1} onChange={(e) => setFormula(e.target.checked)} /> use a formula ({Math.floor(s.res.formula)})</label>
      <button
        className="town-btn sm danger"
        disabled={!ready || capped || unarmed}
        onClick={() => {
          if (!window.confirm(`Attempt the ascension? ${Math.round(odds * 100)}% to rise to ${v.rank + 1} — otherwise ${v.name} is consumed.`)) return;
          run(() => attemptAscension(s, ctx, v.id, formula));
        }}
        title="Banked study, an arcane formula and your own Domain levels all raise the odds"
      >
        Ascend · {Math.round(odds * 100)}%
      </button>
      {capped && <span className="warn-text">{v.rank >= MAX_WIZARD ? "At the peak of the art." : v.rank >= 15 ? "Bind a deeper emblem to climb further." : "At the peak."}</span>}
      {unarmed && !capped && <span className="warn-text">Needs a better staff to hold the power.</span>}
    </div>
  );
}

/** The emblem knight's road: sorties for a battalion and jewels, and the advance. */
function EmblemKnight({ s, v, run }: { s: GameState; v: Villager; run: (fn: () => string | null) => void }) {
  const req = advanceRequirement(v);
  const jewels = stock(s, "jewel");
  return (
    <div className="tg-troop-row">
      <span className="town-dim">Battalion {v.battalion ?? 0}</span>
      <button className="town-btn sm ghost" disabled={!canDeploy(v) || isAway(s, v)} onClick={() => run(() => deploy(s, v.id))} title={canDeploy(v) ? `${SORTIE_HOURS}h away: returns with sworn soldiers, and maybe a jewel` : "Bind an emblem to ride out"}>
        {isAway(s, v) ? "Away" : `Ride out (${SORTIE_HOURS}h)`}
      </button>
      <button className="town-btn sm" disabled={isAway(s, v) || v.rank >= MAX_KNIGHT} onClick={() => run(() => advanceKnight(s, v.id))}>{v.rank >= MAX_KNIGHT ? "At the height of knighthood" : `Advance to ${v.rank + 1}`}</button>
      <ul className="town-checks tight">
        <li data-ok={(v.battalion ?? 0) >= req.battalion ? "1" : undefined}>Battalion {v.battalion ?? 0}/{req.battalion}</li>
        <li data-ok={jewels >= req.jewels ? "1" : undefined}>Monster jewels {jewels}/{req.jewels}</li>
        <li data-ok={(v.emblem?.depth ?? 0) >= req.depth ? "1" : undefined}>Emblem depth {v.emblem?.depth ?? 0}/{req.depth} — a real skill of yours</li>
      </ul>
    </div>
  );
}

/**
 * What the game is: a building survival. The land is fog; monsters come at
 * the town on a clock that speeds up as it grows, and lairs deep in the fog
 * breed worse. The run lasts as long as the hall stands.
 */
function Goal({ s, scenario }: { s: GameState; scenario: string }) {
  const day = s.fallen?.day ?? clock(s.time).day;
  const best = Math.max(bestDay(scenario), day);
  const hall = s.structures.find((x) => x.type === "townhall");
  const found = (s.lairs ?? []).filter((l) => l.discovered).length;
  const milestones: [boolean, string][] = [
    [day >= 2, "Survive the first night"],
    [day >= 19, "Reach the first winter"],
    [day >= 29, "See the spring after it — a full year"],
    [s.villagers.length >= 10, "A town of 10"],
    [s.villagers.length >= 25, "A town of 25"],
    [(hall?.level ?? 1) >= 3, "Raise the hall to level 3"],
    [found >= 1, "Find a lair in the fog"],
    [day >= 60, "Last 60 days"],
    [day >= 100, "Last 100 days"],
  ];
  return (
    <div className="tg-goal">
      <p className="town-kicker">The goal</p>
      <h2 className="town-title">Survive</h2>
      <p className="town-sub">
        Your town is a parasite in a land that wants it gone. Everything it does — felling, burning, mining, bleeding — draws the land&apos;s answer:
        siege beasts, burrowers, blizzard stalkers, spores. Cold kills through the body; food rots; tools break; roofs come down under snow;
        minds break. Keep the hall standing and the people hoping: if the hall falls, or Hope lies dead for three days, the run is over.
      </p>
      <p className="town-sub">
        <b>Day {day}</b> {s.fallen ? "— fallen" : "survived"} · best: day {best} · difficulty: hard
      </p>
      <ul className="town-checks">
        {milestones.map(([ok, label]) => <li key={label} data-ok={ok ? "1" : undefined}>{ok ? "✓" : "·"} {label}</li>)}
      </ul>
    </div>
  );
}

/**
 * The three legendary callings: what each does, who stands nearest it, and
 * every requirement, met or not. The way in is long on purpose.
 */
function LegendsPanel({ s, run }: { s: GameState; run: (fn: () => string | null) => void }) {
  return (
    <div className="tg-legends">
      <p className="town-kicker">Legendary callings</p>
      <p className="town-sub">One of each in a town, raised from the very top of a trade — and only when the town itself is great.</p>
      {(Object.keys(LEGENDS) as Legend[]).map((l) => {
        const def = LEGENDS[l];
        const holder = legendOf(s, l);
        const v = holder ?? candidateFor(s, l);
        const checks = holder ? [] : legendChecks(s, l, v);
        const ready = !holder && checks.every((c) => c.ok);
        return (
          <section key={l} className={`tg-legend ${holder ? "held" : ready ? "ready" : ""}`}>
            <h3>{def.name}</h3>
            <p className="town-dim">{def.blurb}</p>
            <p>{def.effect}</p>
            {holder ? (
              <p className="tg-legend-held">✦ {holder.name} holds the calling.</p>
            ) : (
              <>
                <ul className="town-checks tight">
                  {checks.map((c) => <li key={c.label} data-ok={c.ok ? "1" : undefined}>{c.ok ? "✓" : "·"} {c.label}</li>)}
                </ul>
                {ready && v && <button className="town-btn sm" onClick={() => run(() => ascendLegend(s, l, v.id))}>Raise {v.name} to {def.name}</button>}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CensusPanel({ s, compact, run }: { s: GameState; compact?: boolean; run?: (fn: () => string | null) => void }) {
  const idle = s.villagers.filter((v) => v.role === "idle" && !v.work);
  const spentOut = s.villagers.filter((v) => spent(v) >= capacity(v)).length;
  const weak = s.villagers.filter((v) => weakness(v).cold || weakness(v).hungry).length;
  return (
    <div className="tg-census">
      {!compact && <h2 className="town-title">Census</h2>}
      <p className="town-sub">{s.villagers.length} villagers · {totalBeds(s)} beds · {countedTroops(s).length} troops posted as guards · {s.deaths} lost</p>
      <p className={`town-sub ${weak ? "warn-text" : ""}`}>
        Today: {spentOut} spent their strength{weak ? ` · ${weak} at half strength from a cold night or hunger` : ""}.
      </p>
      <p className="town-sub">
        {(() => {
          const lead = s.villagers.find((v) => v.nightShift);
          return lead ? `☾ ${lead.name} leads the night shift: building goes on through the dark.` : `No night shift: building stops at dusk. A worker of level ${NIGHT_SHIFT_LEVEL} can lead one.`;
        })()}
        {s.incoming !== undefined ? ` A newcomer is on the road, ${Math.max(0, Math.ceil((s.incoming - s.time) / 60))}h off.` : ""}
      </p>
      {run && (
        <label className="tg-overtime" title="Clearing, gathering and digging past their strength costs health each dawn, and sometimes a life">
          <input type="checkbox" checked={!!s.policy?.overtime} onChange={(e) => run(() => setClearOvertime(s, e.target.checked))} />
          {" "}Drive the idle hands on past their strength when clearing and digging
        </label>
      )}
      <ul className="tg-census-list">
        {census(s).map((c) => <li key={c.label}><span>{c.label}</span><b>{c.count}</b></li>)}
      </ul>
      <p className="town-kicker" style={{ marginTop: 10 }}>Available workers ({idle.length})</p>
      <ul className="tg-people">
        {idle.slice(0, 20).map((v) => <li key={v.id}><b>{v.name}</b> <span className="town-dim">♥{Math.round(v.health)} ☺{Math.round(v.happy)}</span> <Vitals s={s} v={v} /></li>)}
        {idle.length === 0 && <li className="town-dim">Everyone is working.</li>}
      </ul>
    </div>
  );
}

/**
 * The monster gates the town has found: each with its level, what it looses
 * now, and what it will loose when it climbs. Gates rise a level every three
 * days, and the ones deepest in the country stand highest.
 */
function GatesList({ s, run }: { s: GameState; run: (fn: () => string | null) => void }) {
  const found = (s.lairs ?? []).filter((l) => l.discovered).sort((a, b) => b.level - a.level);
  const hidden = (s.lairs ?? []).length - found.length;
  return (
    <div className="tg-gates">
      <p className="town-kicker">Monster gates</p>
      {found.length ? (
        <ul className="tg-gate-list">
          {found.map((l) => {
            const b = broodOf(l);
            return (
              <li key={l.id}>
                <b className="tg-gate-lv">L{l.level}</b>
                <div>
                  <b>{LAIR_NAMES[l.kind]}</b> <span className="town-dim">at {l.x},{l.y}</span>
                  <span>Looses {plural(MONSTERS[b.now].name)}{b.next ? ` · ${plural(MONSTERS[b.next.kind].name)} from L${b.next.at}` : ""}</span>
                  <span>
                    Guarded by {gateGuard(l).count} {plural(MONSTERS[b.now].name)} · your army of {armyFor(s).length} has a {Math.round(assaultOdds(s, l) * 100)}% chance{" "}
                    <button className="town-btn ghost sm" disabled={!armyFor(s).length} onClick={() => {
                      if (window.confirm(`Storm the ${LAIR_NAMES[l.kind]} with every troop, knight and wizard? ${Math.round(assaultOdds(s, l) * 100)}% to seal it; some will not come back either way.`)) run(() => {
                        assaultGate(s, l.id, rng(Math.floor(s.time) + l.id * 17));
                        return null;
                      });
                    }}>Storm it</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="town-sub">No gate found yet.</p>
      )}
      {hidden > 0 && <p className="town-dim">{hidden} more lie unfound in the fog. Send a knight or wizard out with torches to find them.</p>}
    </div>
  );
}

function RaidPanel({ s, ctx, run }: { s: GameState; ctx: SimContext; run: (fn: () => string | null) => void }) {
  const raid = s.raid;
  const lead = raid?.party[0];
  return (
    <div>
      {raid && lead ? (
        <>
          <p className="town-kicker">{raid.prowl ? "Night prowlers — wandered in for one building" : raid.haunt ? "A night haunt — one for each unlit building" : raid.phase === "incoming" ? `Arriving from the ${raid.side}${raid.flank ? ` and the ${raid.flank}` : ""} in ${Math.max(0, Math.ceil((raid.arrivesAt - s.time) / 60))}h` : "The fight is on"}</p>
          <h2 className="town-title">{partyName(raid.party)}</h2>
          <p className="town-sub">{MONSTERS[lead.kind].blurb}</p>
          {raid.phase === "incoming" && (() => {
            const req = repelRequirement(lead.kind, lead.level);
            const c = canRepel(s, ctx);
            return req.possible ? (
              <>
                <p className="town-kicker" style={{ marginTop: 10 }}>Turn them away without a fight</p>
                <ul className="town-checks">
                  <li data-ok={c.emblem ? "1" : undefined}>{c.emblem ? "✓" : "✗"} {req.attribute.replace("_", " ").toLowerCase()} emblem equipped</li>
                  <li data-ok={c.ideas ? "1" : undefined}>{c.ideas ? "✓" : "✗"} {req.ideas} new {req.school} idea(s) this week ({ctx.input.newIdeasThisWeek[req.school]} so far)</li>
                </ul>
                <button className="town-btn" disabled={!c.emblem || !c.ideas} onClick={() => run(() => (performRite(s, ctx) ? null : "The rite fails."))}>Perform the rite</button>
              </>
            ) : <p className="town-sub" style={{ color: "#e0705a" }}>Legendary — no rite turns this away. Grand wizards will take the field.</p>;
          })()}
          <p className="town-sub" style={{ marginTop: 10 }}>
            {`${countedTroops(s).length} guard${countedTroops(s).length === 1 ? "" : "s"} posted — each waits in its tower and comes out only when a monster crosses the tower's circle.` +
              (countedTroops(s).length < 3 ? " With so few, villagers take up pitchforks when anything comes near the hall." : "") +
              " Buildings outside every circle stand alone."}
          </p>
        </>
      ) : (
        <>
          <h2 className="town-title">All quiet</h2>
          <p className="town-sub">
            For now. Every tree felled, every hearth&apos;s smoke, every pick-strike in the mine, the blood of every fight and the heat leaking from every roof
            feeds the land&apos;s answer. It is sized against what defends the building it comes for — and it never forgets.
          </p>
        </>
      )}
      <ThreatPanel s={s} />
      <NemesisPanel s={s} />
      <RaidOdds s={s} />
      <details className="tg-test">
        <summary>Test a raid</summary>
        <select className="town-select" defaultValue="" onChange={(e) => {
          const kind = e.target.value as MonsterKind;
          if (!kind) return;
          const def = MONSTERS[kind];
          run(() => {
            if (!s.raid) scheduleRaid(s, rng(Date.now() % 1e6));
            s.raid!.party = [{ kind, level: def.min, count: def.pack ? def.pack[0] : 1 }];
            s.raid!.arrivesAt = s.time + 30;
            s.raid!.phase = "incoming";
            return null;
          });
          e.target.value = "";
        }}>
          <option value="">Summon…</option>
          {Object.values(MONSTERS).map((m) => <option key={m.kind} value={m.kind}>L{m.min}–{m.max} · {m.name}{m.legendary ? " ★" : ""}{m.night ? " ☾" : ""}</option>)}
        </select>
      </details>
    </div>
  );
}

/** The next raid's odds, in full: the chance, what could come, and where it would strike. */
function RaidOdds({ s }: { s: GameState }) {
  const f = raidForecast(s);
  return (
    <div className="tg-odds">
      <p className="town-kicker" style={{ marginTop: 12 }}>Next wave · the purse {Math.round(f.chance * 100)}% full · about {Math.ceil(f.nextCheckIn / 60)}h</p>
      <table className="tg-table">
        <thead><tr><th>Could come</th><th>Share</th><th>Level</th></tr></thead>
        <tbody>
          {f.monsters.slice(0, 8).map((m) => (
            <tr key={m.kind}><td>{m.name}{m.night ? " ☾" : ""}</td><td>{Math.round(m.pct * 100)}%</td><td>~{m.level}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="town-kicker" style={{ marginTop: 10 }}>Most exposed</p>
      <table className="tg-table">
        <thead><tr><th>Target</th><th>Draw</th><th>Extra levels</th></tr></thead>
        <tbody>
          {f.exposed.slice(0, 5).map((x) => (
            <tr key={x.st.id}><td>{CATALOG[x.st.type].name} at {x.st.x},{x.st.y}</td><td>{Math.round(x.share * 100)}%</td><td>{x.bonus ? `+${x.bonus}` : "—"}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="town-dim">A wave makes for one building — whatever is worth most to it for the time it takes to get there: sleepers, food, warmth, a roof about to give. Having brought it down, it goes. ☾ things of the night.</p>
    </div>
  );
}

/** A visiting caravan: goods for goods, and gear straight into the forge's store. */
function TradePanel({ s, run }: { s: GameState; run: (fn: () => string | null) => void }) {
  const c = s.caravan;
  if (!c) {
    return (
      <div>
        <h2 className="town-title">No caravan in town</h2>
        <p className="town-sub">
          Traders pass every few days — the next in about {Math.max(1, Math.round(((s.nextCaravanAt ?? s.time) - s.time) / 60))}h — and stay a day.
          They bring silver, tools and weapons, and take only goods in return: timber, stone, meals, refined wares, platinum.
        </p>
      </div>
    );
  }
  const label = (o: (typeof c.offers)[number]) => (o.get.item ? `${GEAR[o.get.item]?.name ?? o.get.item}` : `${o.get.qty} ${o.get.res}`);
  return (
    <div>
      <p className="town-kicker">In town for {Math.ceil((c.until - s.time) / 60)}h more</p>
      <h2 className="town-title">The {c.name}</h2>
      <ul className="tg-trade">
        {c.offers.map((o) => {
          const afford = Object.entries(o.give).every(([k, v]) => s.res[k as keyof GameState["res"]] >= (v as number));
          return (
            <li key={o.id} className={o.left <= 0 ? "gone" : ""}>
              <IconCanvas id={o.get.item ?? o.get.res!} />
              <b>{label(o)}</b>
              <span className="town-dim">for {costText(o.give)}</span>
              <button className="town-btn sm" disabled={o.left <= 0 || !afford} onClick={() => run(() => trade(s, o.id))}>
                {o.left <= 0 ? "Sold out" : `Trade (${o.left} left)`}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="town-dim">Weapons and armour go to the forge&apos;s store; you need a forge with room. Silver pays the knights.</p>
    </div>
  );
}

// ── Profiles ──────────────────────────────────────────────

type Scenario = "yours" | "merchant" | "alchemist" | "forge" | "citadel" | "endgame";

const SCENARIOS: Record<Exclude<Scenario, "yours">, { label: string; schools: TownInput["schools"]; blurb: string }> = {
  merchant: { label: "Trader", schools: { commerce: 46, science: 3, mind: 6 }, blurb: "All trade, no science: sells dear, grows little." },
  alchemist: { label: "Scholar", schools: { commerce: 2, science: 30, mind: 24 }, blurb: "Science and mind, no business: huge harvests sold at a loss." },
  forge: { label: "Engineer", schools: { commerce: 8, science: 40, mind: 6 }, blurb: "Makes everything itself." },
  citadel: { label: "Polymath", schools: { commerce: 28, science: 30, mind: 26 }, blurb: "Every school high." },
  endgame: { label: "End game", schools: { commerce: 40, science: 40, mind: 40 }, blurb: "A town at the summit: its hall at level 100, its towers set with monster parts, and two dragons coming for it. The end-game phase goes on — nothing ends here." },
};

export function TownWithScenarios({ input }: { input: TownInput }) {
  const [scenario, setScenario] = useState<Scenario>("yours");
  const effective = useMemo<TownInput>(() => (scenario === "yours" ? input : { ...input, schools: SCENARIOS[scenario].schools }), [scenario, input]);
  const bonus = effective.schools.commerce + effective.schools.science + effective.schools.mind;
  return (
    <>
      <div className="town-scenarios" role="tablist" aria-label="Knowledge profile">
        <button role="tab" aria-selected={scenario === "yours"} className={`town-tab ${scenario === "yours" ? "on" : ""}`} onClick={() => setScenario("yours")}>Your town</button>
        {(Object.keys(SCENARIOS) as Exclude<Scenario, "yours">[]).map((k) => (
          <button key={k} role="tab" aria-selected={scenario === k} className={`town-tab ${scenario === k ? "on" : ""}`} onClick={() => setScenario(k)}>{SCENARIOS[k].label}</button>
        ))}
        <a href="/town/assets" className="town-tab" style={{ marginLeft: "auto" }}>Asset sheet</a>
        <span className="town-dim" style={{ flexBasis: "100%" }}>
          {scenario === "yours" ? `${profileFor(input).title} — built from your real Field levels. Each profile keeps its own saved town.` : `Preview — ${SCENARIOS[scenario].blurb}`}
        </span>
      </div>
      <TownGame key={scenario} input={effective} scenario={scenario} bonus={bonus} />
    </>
  );
}
