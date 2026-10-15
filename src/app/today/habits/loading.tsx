import "@/components/habits/habits.css";
import { Skeleton } from "@/components/ui/Tabs";

/** Tasks › Habits' skeleton: the year switcher, the summary and three cards at their final geometry, static. */
export default function HabitsLoading() {
  return (
    <div className="page hh-page cq-main" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your habits
      </p>
      <div className="hh-top" aria-hidden="true">
        <div className="hh-years" style={{ minHeight: 44 }}>
          <Skeleton w={150} h={22} />
        </div>
        <Skeleton w={190} h={14} />
      </div>
      <div className="hh-list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card hh-card">
            <div className="hh-head">
              <Skeleton w={30} h={30} r={9} />
              <div style={{ display: "grid", gap: 6 }}>
                <Skeleton w="55%" h={15} />
                <Skeleton w="35%" h={12} />
              </div>
              <Skeleton w={44} h={20} />
            </div>
            <div className="hh-gridwrap">
              <Skeleton w="100%" h={74} r={6} />
            </div>
            <div className="hh-foot">
              <Skeleton w="60%" h={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
