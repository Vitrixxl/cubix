import { memo } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

/**
 * Notifications as the app's own cards, drawn like its popovers and dialogs: an icon on a quiet square, the title over
 * its line of detail, and the action as a small button on the right, all on one row. Drawn again only for a new theme.
 */
export const Toasts = memo(function Toasts({ light }: { light: boolean }) {
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
            "group/toast font-sans relative flex w-[min(24rem,calc(100vw-1.5rem))] items-center gap-3 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
          // The notice's face: a person's avatar, or its kind's icon on a tile (base.tsx IconTile), as large as the avatar (community/client.ts).
          icon: "flex shrink-0 items-center justify-center [&>svg]:size-9 [&>svg]:rounded-lg [&>svg]:bg-muted [&>svg]:p-2",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          // Through cn: classes, not words to translate (scripts/i18n-extract.ts reads `title` and `description`).
          title: cn("line-clamp-2 text-sm font-medium"),
          description: cn("line-clamp-2 text-xs text-muted-foreground"),
          actionButton: buttonVariants({ size: "sm", className: "cursor-pointer" }),
          cancelButton: buttonVariants({ variant: "ghost", size: "sm", className: "cursor-pointer text-muted-foreground" }),
          closeButton:
            "absolute -top-2 -left-2 flex size-5 cursor-pointer items-center justify-center rounded-full bg-popover text-muted-foreground opacity-0 ring-1 ring-foreground/10 transition-opacity group-hover/toast:opacity-100 hover:text-foreground [&>svg]:size-3",
          error: "ring-destructive/30",
        },
      }}
    />
  );
});
