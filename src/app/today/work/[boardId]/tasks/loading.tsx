import "@/components/today/today.css";
import "@/components/shell/work-tabs.css";
import { Skeleton } from "@/components/ui/Tabs";

/**
 * A work tab's Tasks skeleton (work-boards.ts; /today/work/<id>/tasks): the board's one-DOM layout in the workspace's
 * skin, the lanes, and Inbox and Anytime — no plan card, no goals, no Close the day (a work tab draws none of them;
 * its name and menu are the work frame's header), so nothing jumps when the board streams in. Nothing shimmers or fades.
 */
export default function WorkTasksLoading() {
  return (
    <div className="page today-board cq-main" data-skin="work" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the work tab&apos;s tasks
      </p>
      <div className="board" aria-hidden="true">
        <div className="c1" />

        <div className="c2">
          {[3, 2].map((rows, lane) => (
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="c3">
          <div className="card o10" style={{ minHeight: 104 }} />
        </div>
      </div>
    </div>
  );
}
