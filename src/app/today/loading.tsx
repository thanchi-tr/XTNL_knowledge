import "@/components/today/today.css";
import { Skeleton } from "@/components/ui/Tabs";

/**
 * The Today board's skeleton: static cards at the board's final geometry,
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
          <div className="card today-day o2">
            <div className="d-top">
              <Skeleton w={52} h={52} r={26} />
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <Skeleton w={150} h={28} />
                <Skeleton w="80%" h={14} />
              </div>
            </div>
            <div className="d-full">
              <Skeleton w={120} h={14} />
              <div className="rings" style={{ marginTop: 12 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rg">
                    <Skeleton w={40} h={40} r={20} />
                    <div style={{ display: "grid", gap: 6, flex: 1 }}>
                      <Skeleton w="70%" h={12} />
                      <Skeleton w="50%" h={12} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Skeleton w="90%" h={12} />
              </div>
            </div>
            <div className="cells">
              {[0, 1, 2].map((i) => (
                <div key={i} className="cell" style={{ display: "grid", gap: 6 }}>
                  <Skeleton w="60%" h={20} />
                  <Skeleton w="50%" h={12} />
                </div>
              ))}
            </div>
          </div>

          <div className="card today-hero o3" style={{ gap: 10 }}>
            <Skeleton w={120} h={12} />
            <Skeleton w="70%" h={24} />
            <Skeleton w="85%" h={14} />
            <Skeleton w="100%" h={6} />
            <Skeleton w="100%" h={48} r={12} />
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
