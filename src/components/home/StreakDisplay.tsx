import type { DailyStreak } from "@/lib/streak";

const DAY_LABELS = ["6d", "5d", "4d", "3d", "2d", "Yest", "Today"];
const FULL_LABELS = ["6 days ago", "5 days ago", "4 days ago", "3 days ago", "2 days ago", "Yesterday", "Today"];

/**
 * Seven-day activity strip (redesign "Sigil & Slate").
 *
 * The streak numeral is ink in the display face; each day is a block:
 * kept (active) on the kept wash, held (a freeze or a repair kept the
 * streak through it without adding a day) hatched in the held hue with the
 * word in its title, and an empty day plain. Colour never works alone: the
 * hatch and the words carry held, the fill carries kept. A streak that
 * reaches the edge of what the ledger query reads is a floor, "70+", never
 * a number the app did not count.
 */
export function StreakDisplay({ streak }: { streak: DailyStreak }) {
  return (
    <section className="card pad-l" aria-labelledby="streak-h" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 id="streak-h" className="t-eyebrow">
            Activity
          </h2>
          <p className="t-meta" style={{ marginTop: 2 }}>
            Consecutive days with a review, an idea or a task
          </p>
        </div>
        <p style={{ display: "flex", alignItems: "baseline", gap: 6, margin: 0 }}>
          <span className="t-numeral num">
            {streak.current}
            {streak.capped ? "+" : ""}
          </span>
          <span className="t-meta">{streak.current === 1 ? "day" : "days"}</span>
        </p>
      </div>

      <ol aria-label="The last seven days" style={{ marginTop: "auto", paddingTop: 20, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, listStyle: "none", paddingLeft: 0 }}>
        {streak.last7Days.map((active, i) => {
          const held = !active && streak.held7Days[i] === true;
          const state = active ? "kept" : held ? "held" : "none";
          return (
            <li key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} title={`${FULL_LABELS[i]} · ${active ? "kept" : held ? "held" : "no activity"}`}>
              <span
                aria-label={`${FULL_LABELS[i]}: ${active ? "kept" : held ? "held" : "no activity"}`}
                role="img"
                style={{
                  display: "block",
                  width: "100%",
                  height: 36,
                  borderRadius: 6,
                  background:
                    state === "kept"
                      ? "color-mix(in srgb, var(--kept) 16%, transparent)"
                      : state === "held"
                        ? "var(--hatch)"
                        : "var(--sunken)",
                  border: `1px solid ${state === "kept" ? "color-mix(in srgb, var(--kept) 45%, transparent)" : state === "held" ? "color-mix(in srgb, var(--held) 45%, transparent)" : "var(--line-2)"}`,
                }}
              />
              <span className="t-meta num">
                {DAY_LABELS[i]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
