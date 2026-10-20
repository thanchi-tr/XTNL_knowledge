import "@/components/customers/customers.css";
import "@/components/deals/deals.css";
import { Skeleton } from "@/components/ui/Tabs";

/**
 * The deals pipeline's skeleton (deals.ts): the head (the open value, Add deal, the stage switch) and the columns' cards
 * where they will stand (one column on a phone, four from 900 px), so nothing jumps when the pipeline streams in under
 * the work frame's header. Nothing shimmers or fades.
 */
export default function DealsLoading() {
  return (
    <div className="page cq-main dl-page" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the deals
      </p>
      <div className="card dl-head" aria-hidden="true">
        <div className="dl-head-top">
          <div className="dl-sum">
            <Skeleton w={150} h={18} />
          </div>
          <Skeleton w={116} h={44} r={12} />
        </div>
        <Skeleton h={50} r={14} />
      </div>
      <div className="dl-board" aria-hidden="true">
        {[3, 2, 1, 1].map((cards, col) => (
          <div key={col} className="card dl-col" data-active={col === 0 ? "" : undefined}>
            <div className="dl-col-h">
              <Skeleton w={70} h={12} />
            </div>
            <ol className="dl-list">
              {Array.from({ length: cards }, (_, i) => (
                <li key={i} className="dl-card">
                  <Skeleton w="70%" h={15} />
                  <Skeleton w="45%" h={12} />
                  <Skeleton w={96} h={36} r={10} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
