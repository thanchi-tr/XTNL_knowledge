import { TASK_ICONS, type TaskIcon } from "@/lib/task-style";
import { CHANNEL_ICON, type Channel } from "@/lib/scheduled-tasks";
import { CUSTOMER_ACTION_GLYPH, CUSTOMER_ACTION_ICON, type CustomerAction } from "@/lib/customers";

/**
 * A glyph from the app's own task icons (task-style.ts TASK_ICONS), drawn in the kit's stroke (svg.i: currentColor,
 * round caps), so it follows the theme like every Icon. Decorative: its word is always beside it or in a label.
 */
export function WorkGlyph({ icon, className }: { icon: TaskIcon; className?: string }) {
  return (
    <svg className={className ? `i ${className}` : "i"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TASK_ICONS[icon]} />
    </svg>
  );
}

/** A scheduled task's channel (a call, a visit, an email, a message, other). */
export function ChannelGlyph({ channel, className }: { channel: Channel; className?: string }) {
  return <WorkGlyph icon={CHANNEL_ICON[channel]} className={className} />;
}

/** A customer-log action's mark: the contact actions' icon, else its one character. Beside its word, never alone. */
export function ActionMark({ action }: { action: CustomerAction }) {
  const icon = CUSTOMER_ACTION_ICON[action];
  return (
    <span className="crm-glyph" aria-hidden="true">
      {icon ? <WorkGlyph icon={icon} /> : CUSTOMER_ACTION_GLYPH[action]}
    </span>
  );
}
