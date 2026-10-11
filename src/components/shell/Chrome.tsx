"use client";

/**
 * The three chromes, chosen by viewport media query (components.css; chrome.css adds the
 * three-section tab bar and the profile buttons):
 *   <TabBar/>   < 600       Ideas · Tasks · [+ 52 px ink tile] · Body. 64 + safe area. The
 *                           profile button is the top bar's crest (TopBar.tsx).
 *   <Rail/>     600–1279    + Capture at the top, Ideas, Tasks, Body, then the crest (You,
 *                           the profile button) at the bottom; items 72×62.
 *   <Sidebar/>  ≥ 1280      the character card (the profile button), Capture (kbd C; every
 *                           Capture answers c and Alt+N), the three sections with the open
 *                           one's sub-pages, an ink count per section and an owed pill for debt.
 * Counts are ink badges that render nothing at 0; only debt is owed-coloured. Every Capture
 * opens the sheet in the section's mode (nav.ts captureModeOf): an idea on Ideas, a weigh-in
 * on Body, a task elsewhere. On a profile page no tab is current; the profile button is.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Crest } from "@/components/ui/Crest";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { CAPTURE_ARIA_KEYS } from "@/lib/shortcuts";
import { openCaptureSheet } from "./capture-bridge";
import { CAPTURE_LABEL, SECTIONS, activeSub, captureModeOf, sectionOf, type Section, type SectionId } from "./nav";
import { useProfileButton } from "./ProfileMenu";
import { useShell } from "./shell-store";
import { crestLabel, levelCaption, type ShellData } from "./shell-types";
import "./chrome.css";

function countFor(id: SectionId, data: ShellData | null): number {
  if (!data) return 0;
  if (id === "ideas") return data.badges.study;
  if (id === "tasks") return data.badges.today;
  return data.badges.train;
}

function badgeLabel(id: SectionId, n: number): string {
  if (id === "tasks") return `${n} left on today's board`;
  if (id === "ideas") return `${n} due for review`;
  return `${n} waiting`;
}

/** The current section's Capture: its mode and its accessible name. */
function useCapture() {
  const mode = captureModeOf(usePathname());
  return { label: CAPTURE_LABEL[mode], open: () => openCaptureSheet(mode) };
}

export function TabBar() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const capture = useCapture();
  const current = sectionOf(pathname);
  const [ideas, tasks, body] = SECTIONS;
  const tab = (s: Section) => {
    const n = countFor(s.id, data);
    return (
      <Link className="tab" href={s.href} aria-current={current === s.id ? "page" : undefined}>
        <Icon name={s.icon} />
        {s.label}
        <Badge count={n} label={n ? badgeLabel(s.id, n) : undefined} />
      </Link>
    );
  };
  return (
    <nav className="tabbar" aria-label="Sections" data-chrome="">
      {tab(ideas)}
      {tab(tasks)}
      <button type="button" className="tab tab-plus" aria-label={capture.label} aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={capture.open}>
        <span>
          <Icon name="plus" />
        </span>
      </button>
      {tab(body)}
    </nav>
  );
}

export function Rail() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const capture = useCapture();
  const profile = useProfileButton();
  const current = sectionOf(pathname);
  return (
    <nav className="rail" aria-label="Sections" data-chrome="">
      <button type="button" className="r-plus" aria-label={capture.label} aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={capture.open}>
        <span>
          <Icon name="plus" />
        </span>
        Capture
      </button>
      {SECTIONS.map((s) => {
        const n = countFor(s.id, data);
        return (
          <Link key={s.id} href={s.href} aria-current={current === s.id ? "page" : undefined}>
            <Icon name={s.icon} />
            {s.label}
            <Badge count={n} label={n ? badgeLabel(s.id, n) : undefined} />
          </Link>
        );
      })}
      <span className="rail-grow" aria-hidden="true" />
      <button type="button" className="r-you" aria-label={crestLabel(data?.character)} {...profile}>
        <Crest level={data?.character.level ?? null} material={data?.character.material} size={34} />
        You
      </button>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const capture = useCapture();
  const profile = useProfileButton();
  const current = sectionOf(pathname);
  const sub = activeSub(pathname);
  const c = data?.character ?? null;
  const caption = c ? levelCaption(c) : null;
  return (
    <nav className="sidebar" aria-label="Sections" data-chrome="">
      {/* The card is the profile button: the button's ::after covers it, and the meter stays a meter outside the button. */}
      <div className="sb-char">
        <Crest level={c?.level ?? null} material={c?.material} tracks={c?.tracks} size={48} />
        <div className="who">
          <button type="button" className="sb-me" aria-label={crestLabel(c)} {...profile}>
            <b>{c?.title ?? "You"}</b>
          </button>
          {c?.epithet && <span>{c.epithet}</span>}
          {c?.progress != null && (
            <div style={{ marginTop: 6 }}>
              <Meter thin value={c.progress} label={caption ?? "Level progress"} />
            </div>
          )}
          {caption && <span>{caption}</span>}
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-block sb-capture" aria-label={capture.label} aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={capture.open}>
        <Icon name="plus" />
        Capture
        <span className="kbd" aria-hidden="true">
          C
        </span>
      </button>
      {SECTIONS.map((s) => {
        const n = countFor(s.id, data);
        const owed = s.id === "tasks" ? data?.owed.count ?? 0 : 0;
        const open = s.id === current;
        return (
          <div className="sb-sec" key={s.id}>
            <Link href={s.href} data-open={open ? "true" : undefined}>
              <Icon name={s.icon} />
              {s.label}
              {n > 0 && (
                <span className="n num">
                  <span aria-hidden="true">{n}</span>
                  <span className="sr-only">{`, ${badgeLabel(s.id, n)}`}</span>
                </span>
              )}
              {owed > 0 && (
                <span className="n owed num" title="Debt open">
                  {owed} owed
                </span>
              )}
            </Link>
            {open && (
              <div className="sb-sub">
                {s.subs.map((p) => (
                  <Link key={p.href} href={p.href} aria-current={sub === p.href ? "page" : undefined}>
                    {p.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
