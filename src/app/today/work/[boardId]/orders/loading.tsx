import "@/components/customers/customers.css";
import "@/components/orders/orders.css";
import { Skeleton } from "@/components/ui/Tabs";

/**
 * The order list's skeleton (work-orders.ts): the back link, the header
 * card (the count, Add order, the three filter segments) and a few lines
 * (the tick, the item, who, the date) where they will stand, so nothing
 * jumps when the list streams in. Nothing shimmers or fades.
 */
export default function OrdersLoading() {
  return (
    <div className="page narrow cq-main crm-page" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the order list
      </p>
      <div className="crm-back" aria-hidden="true">
        <Skeleton w={96} h={14} />
      </div>
      <div className="card ord-head" aria-hidden="true">
        <div className="ord-head-top">
          <div className="ord-sum">
            <Skeleton w={110} h={18} />
          </div>
          <Skeleton w={124} h={44} r={12} />
        </div>
        <Skeleton h={50} r={14} />
      </div>
      <div className="card ord-card" aria-hidden="true">
        <ul className="ord-list">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="ord-row">
              <span style={{ width: 44, height: 44, display: "grid", placeItems: "center", flex: "none" }}>
                <Skeleton w={24} h={24} r={12} />
              </span>
              <div className="ord-main">
                <Skeleton w="62%" h={15} />
                <Skeleton w="48%" h={13} />
                <Skeleton w={84} h={12} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
