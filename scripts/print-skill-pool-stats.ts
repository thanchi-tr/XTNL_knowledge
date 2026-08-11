/**
 * Verification tool, not a build step — this repo has no test suite, so
 * this is what stands in for one on the skill pool specifically. Prints
 * SKILL_POOL counts by rank, then asserts:
 *   - no duplicate `code`s
 *   - every `prerequisites[]` entry resolves to a real skill via getSkill()
 *   - masteryCost/requiredScore are non-decreasing along every
 *     prerequisite edge (a prerequisite must always be strictly easier
 *     than what it unlocks, or the hierarchy isn't actually a hierarchy)
 *   - the pool clears the 400-skill minimum
 *
 * Run with: npm run skills:stats
 */
import { SKILL_POOL, getSkill } from "../src/lib/skill-pool";
import { ATTRIBUTES } from "../src/lib/attributes";

const MIN_POOL_SIZE = 400;
/** Every attribute must offer exactly this many Ultimates — the "3 per attribute" contract. */
const ULTIMATES_PER_ATTRIBUTE = 3;

function main() {
  const byRank = new Map<string, number>();
  for (const s of SKILL_POOL) byRank.set(s.rank, (byRank.get(s.rank) ?? 0) + 1);

  console.log(`Total skills: ${SKILL_POOL.length}`);
  for (const [rank, count] of byRank) console.log(`  ${rank}: ${count}`);

  let failures = 0;

  const seen = new Set<string>();
  for (const s of SKILL_POOL) {
    if (seen.has(s.code)) {
      console.error(`DUPLICATE CODE: ${s.code}`);
      failures++;
    }
    seen.add(s.code);
  }

  for (const s of SKILL_POOL) {
    for (const prereqCode of s.prerequisites) {
      const prereq = getSkill(prereqCode);
      if (!prereq) {
        console.error(`MISSING PREREQUISITE: ${s.code} -> ${prereqCode}`);
        failures++;
        continue;
      }
      if (prereq.masteryCost > s.masteryCost) {
        console.error(`COST NOT MONOTONIC: ${s.code} (${s.masteryCost}) <- ${prereqCode} (${prereq.masteryCost})`);
        failures++;
      }
      if (prereq.requiredScore > s.requiredScore) {
        console.error(`SCORE NOT MONOTONIC: ${s.code} (${s.requiredScore}) <- ${prereqCode} (${prereq.requiredScore})`);
        failures++;
      }
    }
  }

  // Every attribute must offer exactly three Ultimates, each reachable only
  // by owning that attribute's Apex (which transitively demands the whole
  // path) and each carrying a breadth gate on two *other* attributes.
  for (const attribute of ATTRIBUTES) {
    const ultimates = SKILL_POOL.filter((s) => s.rank === "ULTIMATE" && s.attributes[0] === attribute);
    if (ultimates.length !== ULTIMATES_PER_ATTRIBUTE) {
      console.error(`WRONG ULTIMATE COUNT: ${attribute} has ${ultimates.length}, expected ${ULTIMATES_PER_ATTRIBUTE}`);
      failures++;
    }
    for (const u of ultimates) {
      const apex = SKILL_POOL.find((s) => s.rank === "APEX" && s.attributes[0] === attribute);
      if (!apex || !u.prerequisites.includes(apex.code)) {
        console.error(`ULTIMATE NOT GATED ON APEX: ${u.code}`);
        failures++;
      }
      const breadth = u.breadthRequirement ?? [];
      if (breadth.length !== 2) {
        console.error(`ULTIMATE MISSING BREADTH GATE: ${u.code} has ${breadth.length} breadth requirements`);
        failures++;
      }
      if (breadth.some((b) => b.attribute === attribute)) {
        console.error(`ULTIMATE BREADTH SELF-REFERENCE: ${u.code} demands its own attribute as breadth`);
        failures++;
      }
    }
  }

  if (SKILL_POOL.length < MIN_POOL_SIZE) {
    console.error(`\nPool has ${SKILL_POOL.length} skills — below the ${MIN_POOL_SIZE} minimum.`);
    failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main();
