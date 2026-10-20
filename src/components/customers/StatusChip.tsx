/**
 * A customer's status as a small chip (Phase 2, crm.ts): Lead · Prospect · Customer · Inactive, its word always shown
 * (the tint only repeats it). Tokens only: the work accent for the two open stages, the plain ink for a customer, the
 * quiet ink for an inactive one; never a game signal (kept, owed, held).
 */
import { STATUS_LABEL, type CustomerStatus } from "@/lib/crm";

export function StatusChip({ status }: { status: CustomerStatus }) {
  return (
    <span className="crm-status" data-status={status}>
      <span className="sr-only">Status: </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
