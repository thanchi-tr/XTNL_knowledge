import "@/components/today/today.css";
import { Skeleton } from "@/components/ui/Tabs";

/**
 * The Today board's skeleton (the Tasks section): static cards at the board's final geometry,
 * in the same one-DOM, three-order layout (so nothing jumps when the board
 * streams in), and nothing shimmers or fades.
 */
export default function TodayLoading() {
  return (
    <div className="page today-board cq-main" aria-busy="true">
      <p className="sr-only" role="status">
        Loading today&apos;s board
      </p>
      <div className="board" aria-hidden="true">
        <div className="c1">
          {/* Due elsewhere: one slim row (the board draws none when nothing is due in Ideas or Body). */}
          <div className="card today-away o2">
            <div className="away-row">
              <Skeleton w="60%" h={14} />
            </div>
          </div>
          {/* The plan card: capacity, life XP today, Record yesterday. */}
          <div className="card today-plan o2">
            <div className="plan-cells">
              {[0, 1].map((i) => (
                <div key={i} className="plan-cell" style={{ display: "grid", gap: 6 }}>
                  <Skeleton w="60%" h={20} />
                  <Skeleton w="50%" h={12} />
                </div>
              ))}
            </div>
            <div style={{ minHeight: 44, display: "grid", alignItems: "center", marginTop: 10 }}>
              <Skeleton w={150} h={14} />
            </div>
          </div>
        </div>

        <div className="c2">
          {[3, 3].map((rows, lane) => (
            <div key={lane} className={`today-lane o${5 + lane}`}>
              <div className="lane-h">
                <Skeleton w={80} h={12} />
              </div>
              <div className="card lane-body">
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="t-row">
                    <div className="row">
                      <span style={{ display: "grid", placeItems: "center" }}>
                        <Skeleton w={24} h={24} r={12} />
                      </span>
                      <div style={{ display: "grid", gap: 6 }}>
                        <Skeleton w="65%" h={15} />
                        <Skeleton w="45%" h={12} />
                      </div>
                      <Skeleton w={64} h={30} r={15} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="c3">
          <div className="o9">
            <div className="sec-h">
              <Skeleton w={70} h={12} />
            </div>
            <div className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
              <Skeleton w="75%" h={15} />
              <Skeleton w="100%" h={8} />
              <Skeleton w="55%" h={12} />
            </div>
          </div>
          <div className="card o10" style={{ minHeight: 104 }} />
          <div className="card o11" style={{ minHeight: 70 }} />
        </div>
      </div>
    </div>
  );
}
