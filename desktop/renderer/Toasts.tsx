import { memo } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { tr } from "../../src/client/i18n";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

/**
 * Notifications as the app's own cards, drawn like its popovers and dialogs: an icon on a square tinted by its kind
 * beside the title over its line of detail, the close button in the top-right corner, and any action on a row under
 * them. Drawn again only for a new theme.
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
        success: <CircleCheck className="size-4 bg-success/15! text-success" />,
        error: <CircleAlert className="size-4 bg-destructive/15! text-destructive" />,
        warning: <TriangleAlert className="size-4 bg-warning/15! text-warning" />,
        info: <Info className="size-4 text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: tr("Close"),
        classNames: {
          // A grid of icon, text, cancel, action: the text on the first row, the buttons on a second one when there are any.
          // The footer's tint and separator are painted under that row (44px: a small button and its margins).
          toast: cn(
            "group/toast font-sans relative grid w-[min(24rem,calc(100vw-1.5rem))] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-y-1 overflow-hidden rounded-[20px] bg-popover p-3.5 text-popover-foreground shadow-xl shadow-black/25",
          ),
          // The notice's face: a person's avatar, or its kind's icon on a tile (base.tsx IconTile), as large as the avatar (community/client.ts).
          icon: "col-start-1 row-start-1 mr-3 flex shrink-0 items-center justify-center [&>svg]:size-10 [&>svg]:rounded-[14px] [&>svg]:bg-muted [&>svg]:p-2.5",
          // Clear of the close button.
          content: "col-start-2 col-end-[-1] row-start-1 flex min-w-0 flex-col gap-0.5 pr-7",
          // Through cn: classes, not words to translate (scripts/i18n-extract.ts reads `title` and `description`).
          title: cn("line-clamp-2 text-sm font-bold"),
          description: cn("line-clamp-2 text-xs text-muted-foreground"),
          actionButton: buttonVariants({ size: "sm", className: "col-start-4 row-start-2 mt-2 cursor-pointer" }),
          cancelButton: buttonVariants({ variant: "ghost", size: "sm", className: "col-start-3 row-start-2 mt-2 mr-2 cursor-pointer text-muted-foreground" }),
          closeButton:
            // Important: sonner's own sheet paints the dark theme's close button even unstyled.
            "absolute top-2.5 right-2.5 flex size-7 cursor-pointer items-center justify-center rounded-[10px] border-0! bg-transparent! text-muted-foreground! transition-colors hover:bg-muted! hover:text-foreground! [&>svg]:size-3.5",
        },
      }}
    />
  );
});
