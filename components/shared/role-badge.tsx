import { cn } from "@/lib/utils";
import type { AppUserRole } from "@/lib/types";

interface Props {
  role: AppUserRole;
  className?: string;
}

export function RoleBadge({ role, className }: Props) {
  const isAdmin = role === "admin";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isAdmin
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        className,
      )}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}
