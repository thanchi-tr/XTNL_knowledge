// Starts `next dev` on port 3100 against the local Docker rehearsal database only
// (container xtnl-rehearsal, see PROGRESS.md). Process env beats .env in both
// Next and Prisma, so Supabase is never reached. The Gemini key is blanked so
// the lexical fallback is what gets exercised.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const child = spawn("npx", ["next", "dev", "-p", "3100"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: LOCAL, DIRECT_URL: LOCAL, GEMINI_API_KEY: "" },
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
