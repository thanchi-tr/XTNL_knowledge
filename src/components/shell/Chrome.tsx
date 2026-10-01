"use client";

/**
 * The three chromes, chosen by viewport media query (components.css):
 *   <TabBar/>   < 600       Today · Study · [+ 52 px ink tile] · Train · You (the crest). 64 + safe area.
 *   <Rail/>     600–1279    + Capture at the top, Today, Study, Train, then the crest You at the bottom; items 72×62.
 *   <Sidebar/>  ≥ 1280      character card, Capture (kbd C; every Capture answers c and Alt+N), sections with their sub-pages open,
 *                           an ink count per section and an owed pill for debt.
 * Counts are ink badges that render nothing at 0; only debt is owed-coloured.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Crest } from "@/components/ui/Crest";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { CAPTURE_ARIA_KEYS } from "@/lib/shortcuts";
import { openCaptureSheet } from "./capture-bridge";
import { SECTIONS, activeSub, sectionOf, type SectionId } from "./nav";
import { useShell } from "./shell-store";
import { crestLabel, levelCaption, type ShellData } from "./shell-types";

function countFor(id: SectionId, data: ShellData | null): number {
  if (!data) return 0;
  if (id === "today") return data.badges.today;
  if (id === "study") return data.badges.study;
  if (id === "train") return data.badges.train;
  return 0;
}

function badgeLabel(id: SectionId, n: number): string {
  if (id === "today") return `${n} left on today's board`;
  if (id === "study") return `${n} due for review`;
  return `${n} waiting`;
}

export function TabBar() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const current = sectionOf(pathname);
  const [today, study, train, you] = SECTIONS;
  const tab = (id: SectionId, href: string, label: string, icon: "today" | "study" | "train") => {
    const n = countFor(id, data);
    return (
      <Link className="tab" href={href} aria-current={current === id ? "page" : undefined}>
        <Icon name={icon} />
        {label}
        <Badge count={n} label={n ? badgeLabel(id, n) : undefined} />
      </Link>
    );
  };
  return (
    <nav className="tabbar" aria-label="Sections" data-chrome="">
      {tab("today", today.href, today.label, "today")}
      {tab("study", study.href, study.label, "study")}
      <button type="button" className="tab tab-plus" aria-label="Capture" aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={openCaptureSheet}>
        <span>
          <Icon name="plus" />
        </span>
      </button>
      {tab("train", train.href, train.label, "train")}
      <Link className="tab" href={you.href} aria-current={current === "you" ? "page" : undefined} aria-label={crestLabel(data?.character)}>
        <Crest level={data?.character.level ?? null} material={data?.character.material} size={24} />
        You
      </Link>
    </nav>
  );
}

export function Rail() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const current = sectionOf(pathname);
  const [today, study, train, you] = SECTIONS;
  const item = (id: SectionId, href: string, label: string, icon: "today" | "study" | "train") => {
    const n = countFor(id, data);
    return (
      <Link href={href} aria-current={current === id ? "page" : undefined}>
        <Icon name={icon} />
        {label}
        <Badge count={n} label={n ? badgeLabel(id, n) : undefined} />
      </Link>
    );
  };
  return (
    <nav className="rail" aria-label="Sections" data-chrome="">
      <button type="button" className="r-plus" aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={openCaptureSheet}>
        <span>
          <Icon name="plus" />
        </span>
        Capture
      </button>
      {item("today", today.href, today.label, "today")}
      {item("study", study.href, study.label, "study")}
      {item("train", train.href, train.label, "train")}
      <span className="rail-grow" aria-hidden="true" />
      <Link href={you.href} aria-current={current === "you" ? "page" : undefined} aria-label={crestLabel(data?.character)}>
        <Crest level={data?.character.level ?? null} material={data?.character.material} size={34} />
        You
      </Link>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const data = useShell((s) => s.data);
  const current = sectionOf(pathname);
  const sub = activeSub(pathname);
  const c = data?.character ?? null;
  const caption = c ? levelCaption(c) : null;
  return (
    <nav className="sidebar" aria-label="Sections" data-chrome="">
      <Link className="sb-char" href="/you" aria-label={crestLabel(c)}>
        <Crest level={c?.level ?? null} material={c?.material} tracks={c?.tracks} size={48} />
        <div className="who">
          <b>{c?.title ?? "You"}</b>
          {c?.epithet && <span>{c.epithet}</span>}
          {c?.progress != null && (
            <div style={{ marginTop: 6 }}>
              <Meter thin value={c.progress} label={caption ?? "Level progress"} />
            </div>
          )}
          {caption && <span>{caption}</span>}
        </div>
      </Link>
      <button type="button" className="btn btn-primary btn-block sb-capture" aria-keyshortcuts={CAPTURE_ARIA_KEYS} aria-describedby="capture-unsent" onClick={openCaptureSheet}>
        <Icon name="plus" />
        Capture
        <span className="kbd" aria-hidden="true">
          C
        </span>
      </button>
      {SECTIONS.map((s) => {
        const n = countFor(s.id, data);
        const owed = s.id === "today" ? data?.owed.count ?? 0 : 0;
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
