"use client";

import { useEffect, useRef } from "react";
import { makeCanvas } from "./art/core";
import { grass, cobbles, dirtPath, sandBank, masonry, halfTimber, boards, roofBlock, iceField } from "./art/textures";
import { frosted } from "./art/winter";
import { graded, gradedWall } from "./art/grades";
import { grade } from "@/lib/town/sim/catalog";
import { storehouse, armySchool, armyPoint, tomb, dragonPit, shadowGate, unitHome, rowHouse, duplexHome, apartmentBlock } from "./art/buildings3";
import { M } from "./art/materials";
import { oak, pine, bush, rockFace, crop, oreChunk, sprout, seedling, youngTree, snag, type CropArt } from "./art/nature";
import { keep, townhouse, forge, stall, barracks, tower, mine, windmillBody, fountain, ruins, ROOF, type RoofStyle } from "./art/buildings";
import { person, monster, monsterAt, PROPS, type TroopArt, type MonsterArt } from "./art/sprites";
import { heroEffect, hasAura, buildingAura, effectBadges, type AuraKind } from "./art/effects";
import { figure, type Look } from "./art/heroes";
import { icon } from "./art/icons";
import { GEAR, PARTS } from "@/lib/town/sim/loot";
import { STYLE } from "./map/render";
import { GRADES, then, mix, stampLight, applyEnvironmentLighting, type Grade } from "./map/lighting";
import {
  pitfire, lamppost, brazier, laboratory, fishery, school, watermill, kitchen, refinery, archery, armoury, wizardHut, nobleYard, iceFactory, lumberCamp,
  marketRow, wallTile, rockNode,
} from "./art/buildings2";
import { MONSTERS as BESTIARY } from "@/lib/town/sim/bestiary";

/**
 * Every asset in the town, rendered from the same functions the scene uses.
 *
 * Not a mock-up: each tile here is the exact canvas the game blits, shown at
 * integer zoom on a neutral backdrop so the pixel work can be judged on its
 * own — outlines, ramps, the light direction — without the scene around it
 * flattering or hiding anything.
 */

type Asset = { label: string; note?: string; render: () => HTMLCanvasElement; bg?: "grass" | "dark" | "cobble" };

function tile(draw: (c: CanvasRenderingContext2D) => void, w = 48, h = 32): () => HTMLCanvasElement {
  return () => {
    const { cv, c } = makeCanvas(w, h);
    draw(c);
    return cv;
  };
}

const ROOFS: RoofStyle[] = ["thatch", "red", "teal", "moss", "slate", "purple"];
const TROOPS: TroopArt[] = ["militia", "footman", "ranger", "heavy", "witch", "villager", "merchant", "fisher"];
const KNIGHT_LADDER: [Look, string][] = [
  ["squire", "Noble Squire · 1–5"], ["serjeant", "Mounted Serjeant · 6–10"], ["bachelor", "Knight Bachelor · 11–14"],
  ["champion", "Paladin · 15–18"], ["nobleknight", "Noble Knight · 19–22"], ["hero-knight-23", "Emblem Knight · 23"],
];
/** The soldier tree, title by title. */
const SOLDIER_LADDER: [Look, string][] = [
  ["militia", "Peasant Levy · 1–2"], ["footman", "Spearman Militia · 3–4"], ["ranger", "Bowman Militia · 5–6"], ["sergeant", "Sergeant-at-Arms · 7–9"],
  ["crossbowman", "Crossbowman · 10–12"], ["halberdier", "Veteran Halberdier · 13–16"], ["arbalestier", "Arbalestier · 17–20"],
];
const WIZARD_LADDER: [Look, string][] = [["apprentice", "Apprentice · 1–4"], ["wizard", "Wizard · 5–9"], ["archmage", "Archmage · 10–14"], ["hero-wizard-15", "Grand Wizard · 15"]];
const KNIGHT_DECADES = [23, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
const WIZARD_DECADES = [15, 50, 99, 100, 150, 199, 200, 250, 300, 350, 400, 450, 500];
const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);

/** A figure on a little patch of room, with a still of any live particle effect. */
function heroTile(kind: Look, frame: 0 | 1, t: number): () => HTMLCanvasElement {
  return () => {
    const img = figure(kind, frame);
    const { cv, c } = makeCanvas(img.width + 16, img.height + 10);
    c.drawImage(img, 8, 4);
    if (hasAura(kind)) heroEffect(c, kind, 8 + Math.round(img.width / 2), 4, 4 + img.height, t, 3);
    return cv;
  };
}
/** Every class at the bottom and the top of its range — level variants are part of the art. */
const MONSTERS: { kind: MonsterArt; label: string; lv: number }[] = Object.values(BESTIARY).flatMap((m) => {
  const lows = [{ kind: m.kind as MonsterArt, label: m.name, lv: m.min }];
  const variantAt = m.kind === "goblin" ? 7 : m.kind === "skeleton" ? 7 : m.kind === "golem" ? 15 : m.max >= 30 ? Math.max(30, m.min) : 0;
  return variantAt && variantAt !== m.min ? [...lows, { kind: m.kind as MonsterArt, label: m.kind === "goblin" ? "Goblin King" : m.kind === "golem" ? "Rune Golem" : `${m.name} (elite)`, lv: variantAt }] : lows;
});
const CROPS: CropArt[] = ["potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic"];

/**
 * One small scene — a house, a fire, a footman, a goblin, a wraith on grass
 * and road — graded the way the game grades a frame. At night the fire and
 * the house stamp their rings of light; the eyes, flames and windows are
 * emissive and pass through every grade untouched.
 */
function lightScene(grades: { base: Grade; lit?: Grade }): () => HTMLCanvasElement {
  return () => {
    const W = 104;
    const H = 64;
    const { cv, c } = makeCanvas(W, H);
    grass(c, 0, 0, W, H, 4);
    cobbles(c, 0, 50, W, 14, 2);
    const house = townhouse(0, "thatch", true);
    c.drawImage(house, 2, 52 - house.height);
    c.drawImage(pitfire(), 50, 38);
    c.drawImage(person("footman", 0), 64, 36);
    const gob = monster("goblin");
    c.drawImage(gob, 82, 52 - gob.height);
    const wr = monster("wraith");
    c.drawImage(wr, 44, 4);
    if (!grades.lit) {
      applyEnvironmentLighting(c, W, H, [grades.base]);
      return cv;
    }
    const light = new Uint8Array(W * H);
    stampLight(light, W, H, 60, 44, 24);
    stampLight(light, W, H, 20, 36, 12);
    applyEnvironmentLighting(c, W, H, [grades.base, mix(grades.base, grades.lit, 0.5), grades.lit], light);
    return cv;
  };
}

const NIGHT = mix(GRADES.DAY, GRADES.NIGHT, 1);

const AURAS: [AuraKind, string][] = [
  ["slowed", "Training slowed"], ["inspired", "Training boosted"], ["fertilised", "Fertilised"], ["cold", "Cold"],
  ["decay", "Deteriorating"], ["cutoff", "Harvest lost"], ["feast", "Serving a dish"], ["forging", "At the anvil"],
];

/** A building with one effect's radiance and badge, as a still from the scene. */
function auraTile(kind: AuraKind): () => HTMLCanvasElement {
  return () => {
    const art = school(1, "red");
    const { cv, c } = makeCanvas(art.width + 28, art.height + 26);
    const x = 14;
    const y = 18;
    buildingAura(c, kind, x, y, art.width, art.height, y + art.height - 2, 0.7, 3, art);
    c.drawImage(art, x, y);
    effectBadges(c, [kind], x + art.width / 2, y - 9);
    return cv;
  };
}

const SECTIONS: { title: string; blurb: string; zoom: number; assets: Asset[] }[] = [
  {
    title: "Town hall",
    blurb: "The keep grows with its level: a timbered hall at first, then flanking towers, then taller ones, then a central spire. Roof and banner follow the town's archetype.",
    zoom: 2,
    assets: [
      { label: "Hall · L1–2", note: "Hamlet", render: () => keep(1, "thatch", M.WOOL) },
      { label: "Keep · L3–5", note: "Merchant Port", render: () => keep(4, "teal", M.CLOTHBLU) },
      { label: "Keep · L6–9", note: "Forge-Hold", render: () => keep(7, "slate", M.CLOTHRED) },
      { label: "Citadel · L10+", note: "Arcane Citadel", render: () => keep(12, "red", M.ARCANE) },
    ],
  },
  {
    title: "Production",
    blurb: "Forge tiers add tools by the door; the mine cuts a second adit at depth and its veins take the colour of its deepest ore.",
    zoom: 2,
    assets: [
      { label: "Forge · T1", render: () => forge(1, "red") },
      { label: "Forge · T3", render: () => forge(9, "slate") },
      { label: "Mine · coal", render: () => mine(1) },
      { label: "Mine · silver", render: () => mine(3) },
      { label: "Mine · mithril", render: () => mine(5) },
      { label: "Windmill", render: () => windmillBody("thatch") },
    ],
  },
  {
    title: "Colony buildings",
    blurb: "The second wave: fire, learning, water, refining, food, and the specialist barracks. Every one has a shaded side face.",
    zoom: 2,
    assets: [
      { label: "Pit fire", render: () => pitfire() },
      { label: "School", render: () => school(1, "red") },
      { label: "Watermill", render: () => watermill(1, "thatch") },
      { label: "Kitchen", render: () => kitchen(1, "red") },
      { label: "Refinery", render: () => refinery(1, "slate") },
      { label: "Laboratory · L1", render: () => laboratory(1) },
      { label: "Laboratory · L4+", note: "observatory", render: () => laboratory(4) },
      { label: "Fishing hut · L1", render: () => fishery(1) },
      { label: "Fishing hut · L4", render: () => fishery(4) },
      { label: "Fishing hut · L7+", note: "boat", render: () => fishery(7) },
      { label: "Ice factory", render: () => iceFactory(1) },
      { label: "Lumber camp", render: () => lumberCamp() },
      { label: "Market row", render: () => marketRow(9), bg: "cobble" },
      { label: "Archery range", render: () => archery(1, "red") },
      { label: "Heavy armoury", render: () => armoury(1, "slate") },
      { label: "Wizard hut", render: () => wizardHut(1) },
      { label: "Noble yard", render: () => nobleYard(1, M.ARCANE) },
      { label: "Wall", render: () => wallTile(false, false, false) },
      { label: "Gate", render: () => wallTile(false, false, true) },
      ...[0, 1, 2, 3].map((k) => ({ label: ["Stone", "Coal", "Iron", "Silver"][k] + " rock", render: () => rockNode(k, 0) })),
    ],
  },
  {
    title: "Military",
    blurb: "Barracks gain spears on the rack; towers gain storeys. A tower with a Witch stationed becomes a mage spire.",
    zoom: 2,
    assets: [
      { label: "Barracks · T1", render: () => barracks(1, "red", M.CLOTHRED) },
      { label: "Barracks · T3", render: () => barracks(9, "slate", M.CLOTHBLU) },
      { label: "Watchtower · L1", render: () => tower(1, false) },
      { label: "Watchtower · L9", render: () => tower(9, false) },
      { label: "Mage spire", note: "needs a Witch", render: () => tower(6, true) },
      { label: "Army school · L1", render: () => armySchool(1, "slate", M.CLOTHBLU) },
      { label: "Army school · L4", render: () => armySchool(4, "red", M.CLOTHRED) },
      { label: "Army point · L1", note: "50 troops + a captain", render: () => armyPoint(1, M.CLOTHRED) },
      { label: "Army point · L3", render: () => armyPoint(3, M.CLOTHBLU) },
      { label: "Army point · L5", render: () => armyPoint(5, M.CLOTHGRN) },
      { label: "Army point · L8", render: () => armyPoint(8, M.ARCANE) },
      { label: "Storehouse · L1", render: () => storehouse(1, "thatch") },
      { label: "Storehouse · L4", render: () => storehouse(4, "red") },
      { label: "Storehouse · L7", render: () => storehouse(7, "slate") },
    ],
  },
  {
    title: "Townhouses",
    blurb: "Three forms — eaves to the street, gable to the street, dormered — in every roof material. The town adds houses as the hall levels.",
    zoom: 2,
    assets: ROOFS.flatMap((roof, i) => [
      { label: `${roof} · eaves`, render: () => townhouse(i * 3, roof, true) },
      { label: `${roof} · gable`, render: () => townhouse(i * 3 + 1, roof, true) },
    ]),
  },
  {
    title: "Market & civic",
    blurb: "Stalls multiply with market level. Ruins are what a raid leaves behind — the plot stays, so you can see what was lost.",
    zoom: 2,
    assets: [
      ...[0, 1, 2, 3, 4].map((v) => ({ label: `Stall ${v + 1}`, render: () => stall(v), bg: "cobble" as const })),
      { label: "Fountain", render: () => fountain(), bg: "cobble" },
      { label: "Ruins", render: () => ruins(80, 46, 11) },
    ],
  },
  {
    title: "Homes",
    blurb: "A home grows through its names: a one-room unit, a house, a two-storey townhouse, a double-fronted duplex — and two duplexes side by side join into an apartment block. Each tenth level also rebuilds it bigger and in finer stuff: a storey taller in dressed stone and slate at 10, taller and wider in marble under copper at 20, gilt at 30 — and from 25 it is set with monster jewels.",
    zoom: 2,
    assets: [
      { label: "Unit · L1", render: () => unitHome(1, "thatch") },
      { label: "House · L5", render: () => townhouse(2, "thatch", true) },
      { label: "Townhouse · L10", render: () => graded(rowHouse(1, "thatch"), 1, M.CLOTHRED, 10) },
      { label: "Duplex · L20", render: () => graded(duplexHome(1, "thatch"), 2, M.CLOTHRED, 20) },
      { label: "Duplex · L27", render: () => graded(duplexHome(1, "thatch"), 2, M.CLOTHRED, 27) },
      { label: "Duplex · L30", render: () => graded(duplexHome(1, "thatch"), 3, M.CLOTHRED, 30) },
      { label: "Apartment · L20", render: () => graded(apartmentBlock(20, "slate", true), 2, M.CLOTHBLU, 20) },
      { label: "Apartment · L30", render: () => graded(apartmentBlock(30, "slate", true), 3, M.CLOTHBLU, 30) },
    ],
  },
  {
    title: "The tenth-level steps",
    blurb: "Buildings rise to level 30, and every tenth level is a major step. Fortified at 10: a dressed-stone plinth, gilt along the roofline, the town's pennants. Grand at 20: gilt finials on every peak and lanterns at the corners. Legendary at 30: runes in the walls and a golden standard. Each step also adds half the hit points again and a quarter more output. Walls step up too: merlons, then iron bands, then a rune.",
    zoom: 2,
    assets: [
      ...[1, 10, 20, 30].map((lv) => ({ label: `House · L${lv}`, render: () => graded(townhouse(2, "slate", true), grade(lv), M.CLOTHRED, lv) })),
      ...[1, 10, 20, 30].map((lv) => ({ label: `Watchtower · L${lv}`, render: () => graded(tower(lv, false), grade(lv), M.CLOTHBLU, lv) })),
      ...[1, 10, 20, 30].map((lv) => ({ label: `Wall · L${lv}`, render: () => gradedWall(wallTile(false, false, false), grade(lv)) })),
    ],
  },
  {
    title: "Lairs in the fog",
    blurb: "Deep in the land, far from where a town is founded: tombs nearest, shadow realm gates further, a dragon pit furthest. Each looses a band every few days that roams the map — skeletons, wraiths and liches from a tomb; werewolves, banshees and demons from a gate; salamanders, wyverns and dragons from the pit — and a band that comes near the town attacks it. They grow stronger with the days. Scouts with torches find them.",
    zoom: 3,
    assets: [
      { label: "Tomb", render: () => tomb() },
      { label: "Shadow realm gate", render: () => shadowGate() },
      { label: "Dragon pit", render: () => dragonPit() },
    ],
  },
  {
    title: "The soldier tree",
    blurb: "Barracks recruit Peasant Levies and drill them to Spearman Militia; archery ranges recruit Bowman Militia. Every title after is earned in battle: each fight survived has a chance to promote whoever took part. Melee and ranged take turns up the tree, each harder than the last.",
    zoom: 5,
    assets: SOLDIER_LADDER.flatMap(([k, label]) => [0, 1].map((f) => ({ label: `${label} ${f ? "B" : "A"}`, render: heroTile(k, f as 0 | 1, 0.35), bg: "cobble" as const }))),
  },
  {
    title: "Knights & wizards",
    blurb: "Each ladder changes look as it climbs. Knights come only from the army school, which drills them to Mounted Serjeant; from there they ride, and Knight Bachelor, Paladin and Noble Knight are won in battle. Past the special threshold — grand wizard at 15, emblem knight at 23 — the hero carries a live particle effect: motes circling a grand wizard's head, embers and a turning rune circle under an emblem knight. Every particle is emissive, so it burns through the night.",
    zoom: 5,
    assets: [
      ...KNIGHT_LADDER.flatMap(([k, label]) => [0, 1].map((f) => ({ label: `${label} ${f ? "B" : "A"}`, render: heroTile(k, f as 0 | 1, 0.35 + f * 0.4), bg: "cobble" as const }))),
      ...WIZARD_LADDER.flatMap(([k, label]) => [0, 1].map((f) => ({ label: `${label} ${f ? "B" : "A"}`, render: heroTile(k, f as 0 | 1, 0.35 + f * 0.4), bg: "cobble" as const }))),
    ],
  },
  {
    title: "Emblem knights · 23–150",
    blurb: "A look for every level. Each decade changes the armour and tabard; each era the helm — plume to 49, wings to 79, horns and a greatsword to 109, a jewelled crown and a burning blade to 139, a halo to 150 — and a cape from 40. Within a decade every level turns a detail: the tabard's glyph, the studs, the visor, the plume or the wings. The last row is 50 to 59, level by level.",
    zoom: 5,
    assets: [
      ...KNIGHT_DECADES.map((lv) => ({ label: `Knight ${lv}`, render: heroTile(`hero-knight-${lv}`, 0, 0.4), bg: "cobble" as const })),
      ...range(50, 10).map((lv) => ({ label: `K${lv}`, render: heroTile(`hero-knight-${lv}`, 0, 0.4), bg: "cobble" as const })),
    ],
  },
  {
    title: "Grand wizards · 15–500",
    blurb: "A look for every level to 500. Each decade changes the robe, the hat's band and the fire in the staff; each century the silhouette — a pointed hat, a crown of stars, horns, a halo, a robe full of stars. Within a decade the stars on the hat, the beard and the hem's trim change level by level; more motes circle the head every hundred. The last row is 100 to 109.",
    zoom: 5,
    assets: [
      ...WIZARD_DECADES.map((lv) => ({ label: `Wizard ${lv}`, render: heroTile(`hero-wizard-${lv}`, 0, 0.4), bg: "cobble" as const })),
      ...range(100, 10).map((lv) => ({ label: `W${lv}`, render: heroTile(`hero-wizard-${lv}`, 0, 0.4), bg: "cobble" as const })),
    ],
  },
  {
    title: "Fire & light",
    blurb: "The pit fire at each of its five levels — ring, ring and woodpile, raised hearth, hearth between standing stones, rune-ringed pyre — each lighting further into the night. The lamppost needs no fuel; the brazier burns coal. Anything no light reaches is haunted after dark.",
    zoom: 4,
    assets: [
      ...[1, 2, 3, 4, 5].map((l) => ({ label: `Pit fire · L${l}`, render: () => pitfire(l) })),
      { label: "Lamppost", render: () => lamppost() },
      { label: "Brazier", render: () => brazier() },
    ],
  },
  {
    title: "Spoils & gear",
    blurb: "What monsters leave, kept only in a forge's store, and what the forge makes from it. Tier 3 pieces need a paladin or an archmage in town to make them.",
    zoom: 5,
    assets: [
      ...Object.entries(PARTS).map(([id, p]) => ({ label: p.name, render: () => icon(id), bg: "dark" as const })),
      ...Object.values(GEAR).map((g) => ({ label: `${g.name} · T${g.tier}`, render: () => icon(g.id), bg: "dark" as const })),
    ],
  },
  {
    title: "Garrison & townsfolk",
    blurb: "Two walk frames: feet split on the contact step; on the passing step the legs cross and head and torso drop exactly one pixel. Four-shade ramps lit from the top-left, outlines in each material's own crevice shade on the lit side.",
    zoom: 5,
    assets: TROOPS.flatMap((k) => [
      { label: `${k} · A`, render: () => person(k, 0), bg: "cobble" as const },
      { label: `${k} · B`, render: () => person(k, 1), bg: "cobble" as const },
    ]),
  },
  {
    title: "Bestiary",
    blurb: "Silhouette first, and never mirrored: each class reads from its outline alone. Eyes, runes and fire are emissive — a white core in a saturated halo, under 4% of the sprite — so they burn through a raid's red cast.",
    zoom: 4,
    assets: MONSTERS.map((m) => ({ label: `${m.label} · L${m.lv}`, render: () => monsterAt(m.kind, m.lv) })),
  },
  {
    title: "Nature",
    blurb: "Canopies are overlapping hemispheres of leaves, each lit on its own from the top-left, with notches bitten from the rim; pines are tiers lit on their left flank with ragged hems. No speckle anywhere.",
    zoom: 4,
    assets: [
      ...[0, 1, 2, 3].map((v) => ({ label: `Oak ${v + 1}`, render: () => oak(v) })),
      ...[0, 1, 2].map((v) => ({ label: `Pine ${v + 1}`, render: () => pine(v) })),
      { label: "Bush", render: () => bush(0) },
      { label: "Flowering bush", render: () => bush(1) },
      { label: "Rock outcrop", render: () => rockFace(60, 34, 7) },
    ],
  },
  {
    title: "A loose tree's life",
    blurb: "Loose trees seed themselves on open grass and grow sprout → seedling → young tree → mature. Winter's first day settles them all: sprouts and seedlings die and are gone, a young tree dies standing as a snag seven times in ten, a mature one once in twenty. Snags give a little wood. The second row is the same trees under winter ice.",
    zoom: 4,
    assets: [
      ...[false, true].flatMap((ice) => {
        const dress = (cv: HTMLCanvasElement) => (ice ? frosted(cv, "tree") : cv);
        const tag = ice ? " · winter" : "";
        return [
          { label: `Sprout${tag}`, render: () => dress(sprout(1)) },
          { label: `Seedling${tag}`, render: () => dress(seedling(0)) },
          { label: `Seedling, pine${tag}`, render: () => dress(seedling(1)) },
          { label: `Young oak${tag}`, render: () => dress(youngTree(0)) },
          { label: `Young pine${tag}`, render: () => dress(youngTree(1)) },
          { label: `Mature oak${tag}`, render: () => dress(oak(0)) },
          { label: `Mature pine${tag}`, render: () => dress(pine(1)) },
          { label: `Snag${tag}`, render: () => dress(snag(0)) },
          { label: `Snag, split${tag}`, render: () => dress(snag(1)) },
        ];
      }),
    ],
  },
  {
    title: "Crops & ore",
    blurb: "Every crop in three growth stages; ore in the five mine tiers.",
    zoom: 6,
    assets: [
      ...CROPS.flatMap((k) => [0, 1, 2].map((s) => ({ label: `${k} ${s + 1}`, render: () => crop(k, s as 0 | 1 | 2), bg: "dark" as const }))),
      ...["coal", "iron", "silver", "gold", "mithril"].map((o) => ({ label: o, render: () => oreChunk(o), bg: "dark" as const })),
      ...["rice", "taro", "lotus", "reed", "watercress", "chestnut", "fish", "tonic", "fertiliser", "formula"].map((o) => ({ label: o, render: () => icon(o), bg: "dark" as const })),
    ],
  },
  {
    title: "Props",
    blurb: "",
    zoom: 6,
    assets: [
      { label: "Barrel", render: () => PROPS.barrel(), bg: "cobble" },
      { label: "Crate", render: () => PROPS.crate(), bg: "cobble" },
      { label: "Sack", render: () => PROPS.sack(), bg: "cobble" },
      { label: "Street lamp", render: () => PROPS.lamp(), bg: "cobble" },
      { label: "Well", render: () => PROPS.well(), bg: "cobble" },
    ],
  },
  {
    title: "Effects on buildings",
    blurb: "Whatever is acting on a building shows on it: a radiance in the effect's colour and a badge over the roof. Training buildings run slow — violet, turning — until the day's due reviews are done, then glow gold as new ideas speed them up. Every effect is emissive, so it reads at night too; the building's panel names each one and why.",
    zoom: 2,
    assets: AURAS.map(([k, label]) => ({ label, render: auraTile(k) })),
  },
  {
    title: "Light & weather",
    blurb: "The frame is graded per pixel, not covered: night, fog, the seasons and a raid's alarm remap every colour, while fire, glowing eyes and lit windows pass through untouched. Lights stamp hard-edged rings — lit core, half-lit ring — instead of soft holes in a dark layer.",
    zoom: 3,
    assets: [
      { label: "Day", render: lightScene({ base: GRADES.DAY }) },
      { label: "Dusk", render: lightScene({ base: mix(GRADES.DAY, GRADES.NIGHT, 0.5), lit: GRADES.FIRELIGHT }) },
      { label: "Night", render: lightScene({ base: NIGHT, lit: GRADES.FIRELIGHT }) },
      { label: "Raid", render: lightScene({ base: GRADES.RAID }) },
      { label: "Raid at night", render: lightScene({ base: then(NIGHT, GRADES.RAID), lit: then(GRADES.FIRELIGHT, GRADES.RAID) }) },
      { label: "Rain", render: lightScene({ base: mix(GRADES.DAY, GRADES.FOG, 0.6) }) },
      { label: "Winter", render: lightScene({ base: GRADES.WINTER }) },
    ],
  },
  {
    title: "Winter",
    blurb: "Winter runs ten days, the longest season. All ground ices over except inside a lit pit fire's warmth; lamps and braziers give light but thaw nothing. Snow lies on every roof, warm or not: roof ramps re-index into snow shade for shade, silhouettes take a lit cap, and icicles hang from the eaves.",
    zoom: 2,
    assets: [
      { label: "Hall", render: () => frosted(keep(2, "slate", M.CLOTHRED)) },
      ...ROOFS.map((roof, i) => ({ label: `House · ${roof}`, render: () => frosted(townhouse(i * 3, roof, true)) })),
      { label: "Barracks", render: () => frosted(barracks(2, "red", M.CLOTHRED)) },
      { label: "Watchtower", render: () => frosted(tower(2, false)) },
      { label: "Kitchen", render: () => frosted(kitchen(1, "thatch")) },
      { label: "Pit fire", render: () => frosted(pitfire(2)) },
      { label: "Oak", render: () => frosted(oak(1), "tree") },
      { label: "Pine", render: () => frosted(pine(0), "tree") },
      { label: "Field ice", render: tile((c) => iceField(c, 0, 0, 96, 64, 8), 96, 64) },
      { label: "Trodden road", render: tile((c) => cobbles(c, 0, 0, 96, 64, 3, M.SLUSH), 96, 64) },
    ],
  },
  {
    title: "Terrain & materials",
    blurb: "Ground is patches and clusters — tufts, pebbles, flowers at least two pixels across, lone pixels folded away. Building materials are planes: one midtone fill, sparse detail, four hue-shifted shades per material — warm in the sun, cool in the shade.",
    zoom: 4,
    assets: [
      { label: "Grass", render: tile((c) => grass(c, 0, 0, 48, 32, 2)) },
      { label: "Cobbles", render: tile((c) => cobbles(c, 0, 0, 48, 32, 3)) },
      { label: "Warm cobbles", render: tile((c) => cobbles(c, 0, 0, 48, 32, 4, M.STONEWM)) },
      { label: "Dirt road", render: tile((c) => dirtPath(c, 0, 0, 48, 32)) },
      { label: "River bank", render: tile((c) => sandBank(c, 0, 0, 48, 32)) },
      { label: "Fieldstone", render: tile((c) => masonry(c, 0, 0, 48, 32, M.STONE, 5, { damp: true })) },
      { label: "Dressed stone", render: tile((c) => masonry(c, 0, 0, 48, 32, M.STONEWM, 6, { bh: 3, damp: true })) },
      { label: "Half-timber", render: tile((c) => halfTimber(c, 0, 0, 48, 32, 6)) },
      { label: "Boards", render: tile((c) => boards(c, 0, 0, 48, 32, M.PINE)) },
      ...ROOFS.map((r) => ({ label: `Roof · ${r}`, render: tile((c) => roofBlock(c, 0, 0, 48, 32, ROOF[r], 3)) })),
    ],
  },
];

function AssetTile({ asset, zoom }: { asset: Asset; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const art = asset.render();
    const pad = 4;
    cv.width = art.width + pad * 2;
    cv.height = art.height + pad * 2;
    const c = cv.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    if (asset.bg === "grass" || !asset.bg) grass(c, 0, 0, cv.width, cv.height, 9);
    else if (asset.bg === "cobble") cobbles(c, 0, 0, cv.width, cv.height, 8);
    else {
      c.fillStyle = "#1a1420";
      c.fillRect(0, 0, cv.width, cv.height);
    }
    c.drawImage(art, pad, pad);
    // Integer zoom, set on the element directly: the art's size is only known
    // once it has been drawn, and a fractional scale would smear the pixels.
    cv.style.width = `${cv.width * zoom}px`;
    cv.style.height = `${cv.height * zoom}px`;
  }, [asset, zoom]);

  return (
    <figure className="asset-tile">
      <canvas ref={ref} className="asset-canvas" />
      <figcaption>
        {asset.label}
        {asset.note && <span>{asset.note}</span>}
      </figcaption>
    </figure>
  );
}

export function TownAssets() {
  return (
    <div className="asset-sheet">
      {SECTIONS.map((s) => (
        <section key={s.title} className="asset-section">
          <header>
            <h2>{s.title}</h2>
            {s.blurb && <p>{s.blurb}</p>}
          </header>
          <div className="asset-grid">
            {s.assets.map((a) => (
              <AssetTile key={a.label} asset={a} zoom={s.zoom} />
            ))}
          </div>
        </section>
      ))}
      <p className="asset-foot">Styles by archetype: {Object.entries(STYLE).map(([k, v]) => `${k} → ${v.roof}`).join(" · ")}</p>
    </div>
  );
}
