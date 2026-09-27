/**
 * English plurals for the game's names: Dire Wolves, Harpies, Liches,
 * Cyclopes, fisheries. Names borrowed from Japanese and Chinese keep their
 * own form (two Oni, three Tengu).
 */
const SAME = /(Oni|Kappa|Tengu|Jiangshi|Yūrei|Gashadokuro|Jorōgumo|Nian)$/;

export function plural(name: string): string {
  if (SAME.test(name)) return name;
  if (/cyclops$/i.test(name)) return `${name.slice(0, -1)}es`;
  if (/wolf$/i.test(name)) return `${name.slice(0, -1)}ves`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}
