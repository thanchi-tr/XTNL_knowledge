import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftWeave } from "@/components/fx/DraftWeave";
import { HorizonField, type HorizonFieldProps } from "@/components/fx/HorizonField";
import { WeavePause } from "@/components/fx/WeavePause";
import { devStyleEnabled } from "../gate";
import { FxStatus } from "./FxStatus";
import "../style-guide.css";
import "./fx-page.css";

export const metadata: Metadata = { title: "Shader fixtures" };

// Request-time (the gate and the query are read per request).
export const dynamic = "force-dynamic";

/**
 * /dev/style/fx (ui-motion.md §9.1, lane M0b): the shader slots from FIXTURES
 * (made-up roadmaps; it never reads the user's), in every state the audits
 * need. Gated like every /dev/style page.
 *
 *   ?shd=loop (default) · off (data-fx="none": the runtime is never fetched) ·
 *        hold (a live slot reads as offscreen: held, released after 10 s) ·
 *        lost (the first live context is lost once, uncounted; Restore brings it back)
 *   ?contrast=more   the high-contrast backstop and gate (no canvas; hairline, path and dot stay)
 *   ?program=weave   a draft is "running": the WAIT loop has the page, so the
 *        horizon stays SVG (one loop per page). Default: the weave cards are stale.
 *
 * /dev/style/fx is in AMBIENT_ROUTES, so the horizon air runs here in full
 * (≤ 5 s of visible time per session; "Reset 5 s budget" gives it back).
 */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MODES = ["loop", "off", "hold", "lost"] as const;
type Mode = (typeof MODES)[number];

const reading = (percent: number, cls: "MEASURED" | "SELF_REPORTED" = "MEASURED") => ({ percent, class: cls, live: false, change: null });

const HORIZONS: { key: string; label: string; props: HorizonFieldProps }[] = [
  { key: "card-active", label: "Aim card · ACTIVE · 41% · AMBIENT", props: { proficiency: reading(41), roadmapId: "fx-a", basisKey: "1:fixture", depth: 12, status: "ACTIVE" } },
  { key: "page-self", label: "Header · ACTIVE · 23% · from your ticks · AMBIENT (waits: one loop per page)", props: { proficiency: reading(23, "SELF_REPORTED"), roadmapId: "fx-b", basisKey: "1:fixture", depth: 10, status: "ACTIVE", variant: "page" } },
  { key: "done", label: "DONE · 100% · SVG only", props: { proficiency: reading(100), roadmapId: "fx-c", basisKey: "1:fixture", depth: 12, status: "DONE" } },
  { key: "archived", label: "ARCHIVED · 64% · dim, SVG only", props: { proficiency: reading(64), roadmapId: "fx-d", basisKey: "1:fixture", depth: 8, status: "ARCHIVED" } },
  { key: "unmeasured", label: "ACTIVE · unmeasured · unlit marks, no dawn", props: { proficiency: { percent: null }, roadmapId: "fx-e", basisKey: "1:fixture", depth: 12, status: "ACTIVE" } },
  { key: "zero", label: "ACTIVE · 0% · AMBIENT", props: { proficiency: reading(0), roadmapId: "fx-f", basisKey: "1:fixture", depth: null, status: "ACTIVE" } },
];

function href(q: { shd: Mode; contrast: boolean; program: "horizon" | "weave" }) {
  const p = new URLSearchParams();
  if (q.shd !== "loop") p.set("shd", q.shd);
  if (q.contrast) p.set("contrast", "more");
  if (q.program === "weave") p.set("program", "weave");
  const s = p.toString();
  return s ? `/dev/style/fx?${s}` : "/dev/style/fx";
}

export default async function FxFixturesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const q = await searchParams;
  const raw = one(q.shd);
  const shd: Mode = (MODES as readonly string[]).includes(raw ?? "") ? (raw as Mode) : "loop";
  const contrast = one(q.contrast) === "more";
  const program = one(q.program) === "weave" ? "weave" : "horizon";
  const now = { shd, contrast, program } as const;
  const sim = [contrast && "contrast", shd === "hold" && "hold"].filter(Boolean).join(" ");
  return (
    <div className="page cq-main">
      <div className="fxp" data-fx={shd === "off" ? "none" : undefined} data-fx-sim={sim || undefined}>
        <p className="fxp-lead">Shader slots from fixtures. The measured marks are SVG; the canvas only ever replaces the soft layer, and only while a slot loops.</p>
        <nav className="fxp-modes" aria-label="Shader mode">
          {MODES.map((m) => (
            <Link key={m} href={href({ ...now, shd: m })} aria-current={shd === m ? "true" : undefined}>
              {`shd=${m}`}
            </Link>
          ))}
          <Link href={href({ ...now, contrast: !contrast })} aria-current={contrast ? "true" : undefined}>
            contrast=more
          </Link>
          <Link href={href({ ...now, program: program === "weave" ? "horizon" : "weave" })} aria-current={program === "weave" ? "true" : undefined}>
            program=weave
          </Link>
        </nav>
        <FxStatus autoLose={shd === "lost"} />
        <div className="fxp-grid">
          {HORIZONS.map((h) => (
            <div key={h.key} className="card fxp-card">
              <HorizonField {...h.props} />
              <div className="fxp-cap">{h.label}</div>
            </div>
          ))}
          <div className="card fxp-card" data-wait="">
            <div className="fxp-head">
              <span>
                <b>Drafting</b> · started 09:12:04 · usually about 18 s
              </span>
              <WeavePause />
            </div>
            <DraftWeave stale={program !== "weave"} />
            <div className="fxp-cap">WAIT · {program === "weave" ? "running (≤ 90 s, pausable)" : "stale · SVG only"}</div>
          </div>
          <div className="card fxp-card" data-wait="">
            <div className="fxp-head">
              <span>
                <b>Drafting</b> · stale
              </span>
              <WeavePause />
            </div>
            <DraftWeave stale />
            <div className="fxp-cap">WAIT · stale · SVG only</div>
          </div>
        </div>
      </div>
    </div>
  );
}
