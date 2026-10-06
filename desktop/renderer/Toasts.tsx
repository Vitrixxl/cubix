import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

/**
 * Notifications as the app's own cards: an icon, the title over its line of detail, and the action as a small button
 * on the right, all on one row.
 */
export function Toasts({ light }: { light: boolean }) {
  return (
    <Toaster
      position="top-right"
      theme={light ? "light" : "dark"}
      offset={16}
      mobileOffset={12}
      gap={10}
      // Each notice in full, one under the other, never folded into a pile.
      expand
      visibleToasts={4}
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        error: <CircleAlert className="size-4 text-destructive" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        info: <Info className="size-4 text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast font-sans relative flex w-[min(24rem,calc(100vw-1.5rem))] items-center gap-3.5 rounded-2xl border bg-popover py-3.5 pr-3.5 pl-3.5 text-popover-foreground shadow-[0_18px_40px_-16px_rgb(0_0_0/0.75)]",
          // The notice's face: a person's avatar, or its kind's icon on a tile (see community/client.ts).
          icon: "flex shrink-0 items-center justify-center [&>svg]:size-9 [&>svg]:rounded-xl [&>svg]:bg-muted [&>svg]:p-2.5",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          // Through cn: classes, not words to translate (scripts/i18n-extract.ts reads `title` and `description`).
          title: cn("line-clamp-2 text-sm font-medium"),
          description: cn("line-clamp-2 text-xs text-muted-foreground"),
          actionButton: "h-8 shrink-0 cursor-pointer rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          cancelButton: "h-8 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted",
          closeButton:
            "absolute -top-2 -left-2 flex size-5 cursor-pointer items-center justify-center rounded-full border bg-popover text-muted-foreground opacity-0 transition-opacity group-hover/toast:opacity-100 hover:text-foreground [&>svg]:size-3",
          error: "border-destructive/30",
        },
      }}
    />
  );
}
