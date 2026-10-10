import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * The app's one button system. Every button, toggle and button-styled link takes its shape from here:
 *
 * - `default`: the standard size of every text button — 36px high, 14px semibold text, 14px side padding, 16px icons.
 * - `icon`: the square icon button of the same height.
 * - `sm` / `icon-sm`: the compact size, 32px, for dense lists only (a solve's row, a table's actions), never in a
 *   toolbar beside standard buttons.
 *
 * - `tab`: an item of the phone's bottom bar, its icon over its word.
 *
 * All share the 12px radius. The `link` variant is text in a sentence: no height or padding, whatever the size. On a phone (`max-md:`) the standard sizes grow to the 44px touch target on their own.
 * Variants change colours only, never the shape. Callers never pass shape classes (h-, size-, px-, py-, rounded-,
 * text sizes, gaps): desktop/tests/buttons.test.ts fails if they do. Another shape is a new size here, not a class.
 */
const buttonSizes = {
  default:
    "h-9 gap-1.5 px-3.5 text-sm max-md:h-11 max-md:px-4 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
  icon: "size-9 max-md:size-11",
  sm: "h-8 gap-1 px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
  "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
  /** An item of the phone's bottom bar: its icon over its word. */
  tab: "h-12 flex-col gap-0.5 px-1 text-xs font-medium [&_svg:not([class*='size-'])]:size-5",
}

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[12px] border border-transparent font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline:
          "border-edge bg-muted text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        secondary:
          "border-edge bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent),var(--foreground)_6%)] aria-expanded:bg-accent",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/12 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30",
        tint: "bg-primary/15 text-primary hover:bg-primary/25",
        success: "bg-success/15 text-success hover:bg-success/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: buttonSizes,
    },
    compoundVariants: [{ variant: "link", class: "h-auto p-0 max-md:h-auto max-md:px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonSizes, buttonVariants }
