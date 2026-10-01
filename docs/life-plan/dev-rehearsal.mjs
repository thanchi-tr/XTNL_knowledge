// Starts `next dev` on port 3100 against the local Docker rehearsal database only
// (container xtnl-rehearsal, see PROGRESS.md). Process env beats .env in both
// Next and Prisma, so Supabase is never reached. The Gemini key is blanked so
// the lexical fallback is what gets exercised. M5 (m5-refit.md F14): the
// rehearsal is launched as of XTNL_LIFE_LAUNCH_DAY (default 2026-09-21, a
// Monday, so a judgeable week exists) and may judge weeks on read
// (XTNL_LIFE_JUDGE=1); a production build ignores both. Page loads judge
// nothing until the launch has been applied to this database once:
//   DATABASE_URL=<LOCAL> DIRECT_URL=<LOCAL> XTNL_LIFE_LAUNCH_DAY=2026-09-21 //     npx tsx scripts/life-launch.ts            (dry run), then  --apply
// Set XTNL_LIFE_LAUNCH_DAY= (empty) in the shell to rehearse the not-launched state.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const child = spawn("npx", ["next", "dev", "-p", "3100"], {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: LOCAL,
    DIRECT_URL: LOCAL,
    GEMINI_API_KEY: "",
    XTNL_LIFE_JUDGE: "1",
    XTNL_LIFE_LAUNCH_DAY: process.env.XTNL_LIFE_LAUNCH_DAY ?? "2026-09-21",
  },
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
