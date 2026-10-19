import { getCurrentUserId } from "@/lib/user";
import { loadWorkBoard } from "@/lib/work-boards-server";
import { loadWorkIndex } from "@/lib/scheduled-tasks-server";
import { customerDueCountCore } from "@/lib/customers-server";
import { orderCountCore } from "@/lib/work-orders-server";
import { dueChipText } from "@/lib/customers";
import { ordersChipText } from "@/lib/work-orders";
import { WorkHeader } from "./WorkHeader";

/**
 * The work frame's header, streamed (the work layout awaits nothing): the tab (its name and its two list switches),
 * the workspace's search index (customers and scheduled tasks; cached under 'work') and the sub-navigation's two quiet
 * counts (the customers' scheduled tasks due today, "2 due today"; the orders still to order, "3 to order"; each only
 * while its list is on), in one wave. An unknown or archived tab draws no header (the page says so, or is a 404). A
 * failed index read is no index: the search then asks the server. A failed count is no count.
 */
export async function WorkHeaderSlot({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const userId = getCurrentUserId();
  const [board, index, due, toOrder] = await Promise.all([
    loadWorkBoard(userId, boardId).catch(() => null),
    loadWorkIndex(userId, boardId).catch((err) => {
      console.error("[work] index read failed", err);
      return null;
    }),
    customerDueCountCore(userId, boardId).catch(() => null),
    orderCountCore(userId, boardId).catch(() => null),
  ]);
  if (!board || board.archived) return null;
  const counts = {
    customers: due?.ok ? dueChipText(due.value) : null,
    orders: toOrder?.ok ? ordersChipText(toOrder.value.todo) : null,
  };
  return <WorkHeader board={{ id: board.id, name: board.name, crmOn: board.crmOn, ordersOn: board.ordersOn }} index={index} counts={counts} nowIso={new Date().toISOString()} />;
}
