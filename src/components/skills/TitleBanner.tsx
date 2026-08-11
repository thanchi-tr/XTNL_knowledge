import type { PlayerTitle } from "@/lib/titles";

interface Props {
  title: PlayerTitle;
  accountLevel: number;
  masteryBalance: number;
  activeSkillCount: number;
  ownedSkillCount: number;
  poolSize: number;
}

/**
 * The character sheet's headline.
 *
 * Leads with the *title*, not the level, and states the next title by name
 * with a bar toward it. A named next rung ("14 levels to Scholar") is a far
 * stronger pull than an unlabeled number ticking up, and unlike a fake
 * progress bar it is honest: account level is a real derived figure and the
 * band thresholds are fixed constants, so the distance shown is the
 * distance that exists.
 */
export function TitleBanner({
  title,
  accountLevel,
  masteryBalance,
  activeSkillCount,
  ownedSkillCount,
  poolSize,
}: Props) {
  const transcendent = title.ultimateCount > 0;

  return (
    <div
      className="card relative overflow-hidden"
      style={{
        padding: "18px 20px",
        borderColor: transcendent ? "rgba(255,94,176,0.4)" : "rgba(0,204,122,0.22)",
      }}
    >
      {transcendent && (
        <div
          aria-hidden
          className="aura-breathe pointer-events-none absolute -right-16 -top-16 h-56 w-56"
          style={{ background: "radial-gradient(circle, rgba(255,94,176,0.18), transparent 70%)" }}
        />
      )}

      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="section-eyebrow">{transcendent ? "Transcendent" : `Level ${accountLevel}`}</p>
          <h1
            className="rank-ascend mt-1.5 text-[24px] font-bold tracking-tight"
            style={{ color: transcendent ? "var(--rank-ultimate)" : "var(--ink-0)", lineHeight: 1.15 }}
          >
            {title.full}
          </h1>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {title.blurb}
          </p>
        </div>

        <div className="flex shrink-0 items-end gap-6">
          <div>
            <p className="label-xs">Mastery</p>
            <p className="mono" style={{ fontSize: 24, fontWeight: 800, color: "var(--amber)", lineHeight: 1.1 }}>
              {masteryBalance.toFixed(masteryBalance < 100 ? 1 : 0)}
            </p>
          </div>
          <div>
            <p className="label-xs">Skills</p>
            <p className="mono" style={{ fontSize: 24, fontWeight: 800, color: "var(--green)", lineHeight: 1.1 }}>
              {activeSkillCount}
            </p>
            <p className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
              {ownedSkillCount} of {poolSize}
            </p>
          </div>
        </div>
      </div>

      {title.nextRank && (
        <div className="relative mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
              Next: <span style={{ color: "var(--ink-1)", fontWeight: 600 }}>{title.nextRank}</span>
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              {title.levelsToNext} level{title.levelsToNext === 1 ? "" : "s"} to go
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden" style={{ borderRadius: 3, background: "var(--sub)" }}>
            <div
              className="h-full transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.max(2, title.progressToNext * 100)}%`,
                borderRadius: 3,
                background: "linear-gradient(90deg, var(--green) 0%, var(--green-hi) 100%)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
