import "./rules.css";
import { SkeletonCard } from "@/components/ui/Tabs";

/** How a day is judged: static cards at the page's final geometry (two columns from a main width of 640). */
export default function RulesLoading() {
  return (
    <div className="page today-rules cq-main" aria-busy="true">
      <p className="sr-only" role="status">
        Loading how a day is judged
      </p>
      <div className="rules-grid">
        <div className="rules-card wide" style={{ padding: 0 }}>
          <SkeletonCard lines={5} height={220} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} lines={4} height={200} />
        ))}
      </div>
    </div>
  );
}
