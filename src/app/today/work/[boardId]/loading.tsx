import { Skeleton } from "@/components/ui/Tabs";

/**
 * The Agenda's skeleton (scheduled-tasks.ts): its sections where they will stand (a heading, a few dense rows: the
 * time, the title, the tick), under the work frame's header (the layout's, which stays put). Nothing shimmers or fades.
 */
export default function AgendaLoading() {
  return (
    <div className="page cq-main wk-agenda" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the agenda
      </p>
      <div className="wk-agenda-grid" aria-hidden="true">
        <div className="wk-agenda-main">
          {[2, 3].map((rows, s) => (
            <section key={s} className="card wk-sec">
              <div className="wk-sec-h">
                <Skeleton w={90} h={12} />
              </div>
              <ol className="st-list">
                {Array.from({ length: rows }, (_, i) => (
                  <li key={i} className="st-row">
                    <div className="st-time">
                      <Skeleton w={36} h={13} />
                    </div>
                    <div className="st-body">
                      <Skeleton w="70%" h={15} />
                      <Skeleton w="45%" h={12} />
                    </div>
                    <span className="st-done-skel">
                      <Skeleton w={24} h={24} r={12} />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
