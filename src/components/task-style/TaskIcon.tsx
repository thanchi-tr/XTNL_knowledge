/**
 * A task's or habit's icon in its colour (TaskStyle; src/lib/task-style.ts). Decorative by default (the task's name is
 * always beside it or in its label); pass `title` where the icon stands alone (the profile's month).
 */
import { shownStyleOf, type TaskStyle } from "@/lib/task-style";

export function TaskIcon({ style, size = 16, title, className }: { style: TaskStyle | null | undefined; size?: number; title?: string; className?: string }) {
  const s = shownStyleOf(style);
  return (
    <svg
      className={className ? `tsk-ico ${className}` : "tsk-ico"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={s.hex}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon={s.icon}
      data-color={s.color}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={s.path} />
    </svg>
  );
}
