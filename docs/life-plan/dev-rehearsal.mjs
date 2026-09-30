// Starts `next dev` on port 3100 against the local Docker rehearsal database only.
// Process env beats .env in both Next and Prisma, so Supabase is never reached.
import { spawn } from "node:child_process";

const LOCAL = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const child = spawn("npx", ["next", "dev", "-p", "3100"], {
  cwd: "C:/Users/Thanc/OneDrive/Desktop/XTNL-idea",
  env: { ...process.env, DATABASE_URL: LOCAL, DIRECT_URL: LOCAL, GEMINI_API_KEY: "" },
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
