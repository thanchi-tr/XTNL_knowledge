export { kitchen, school, laboratory, fishery } from "./civic";
export { forge, refinery, lumberCamp } from "./industry";
export { armoury, armySchool, barracks, wizardHut, armyPoint } from "./military";
export { townHall, hallAge, HALL_AGES } from "./hall";
export { museum } from "./museum";
export { alchemy, observatory, mythicLab } from "./labs";
export { anchorsOf, stage, MAX_ART_LEVEL, type Anchors } from "./common";

/** Buildings whose art draws all forty levels itself, eras included. */
export const SPECIAL_TYPES = new Set([
  "townhall",
  "forge", "school", "kitchen", "refinery", "laboratory", "fishery", "lumbercamp", "armoury", "armyschool", "barracks", "wizardhut", "armypoint",
  "alchemy", "observatory", "mythiclab",
]);
