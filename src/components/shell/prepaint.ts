/**
 * The pre-paint script (root layout <head>): sets html[data-theme] and
 * html[data-motion] from the localStorage prefs mirror before the first
 * paint, so a reduced-motion device never sees a frame of motion and a
 * Vellum user never sees a Night flash. Motion defaults to
 * prefers-reduced-motion (reduce → still) until the user picks one.
 *
 * Kept as a plain ES5 string with the storage key inlined, and mirrored by
 * parsePrefs()/resolveMotion() in celebration-types.ts (shell-check asserts
 * the two agree).
 */
import { PREFS_STORAGE_KEY } from "@/lib/celebration-types";

export const PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFS_STORAGE_KEY
)})||"{}")||{}}catch(e){}var t=p.theme==="vellum"?"vellum":"night";var m=p.motion;if(m!=="full"&&m!=="calm"&&m!=="still"){m=(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)?"still":"full"}d.setAttribute("data-theme",t);d.setAttribute("data-motion",m)}catch(e){}})();`;
