/**
 * Prints a fresh VAPID key pair and a random REMINDER_DISPATCH_SECRET for the push reminders (docs/life-plan/reminders.md
 * step 1). It only prints: it writes no file (nothing lands in a tracked file or in .env*), reads no env and touches no
 * database. Make the pair ONCE and keep it: a new pair orphans every device that turned reminders on.
 *
 *   npx tsx scripts/vapid-keys.ts            (npm run vapid:keys)
 *
 * Paste the lines into Vercel › Project Settings › Environment Variables (Production, and Preview if you test push
 * there), with VAPID_SUBJECT set to a mailto: address of yours, then redeploy (the public key is baked into the
 * browser bundle at build time).
 */
import { randomBytes } from "node:crypto";
import { generateVAPIDKeys } from "web-push";

const { publicKey, privateKey } = generateVAPIDKeys();
// 32 random bytes as hex: 64 characters, far over the dispatcher's 16-character floor.
const secret = randomBytes(32).toString("hex");

const lines = [
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  "VAPID_SUBJECT=mailto:<you@example.com>",
  `REMINDER_DISPATCH_SECRET=${secret}`,
];

console.log("# Push reminders: paste into the deployment's environment (never into a tracked file).");
console.log("# VAPID_PRIVATE_KEY and REMINDER_DISPATCH_SECRET are secrets: keep them out of chat, commits and screenshots.");
for (const l of lines) console.log(l);
