/** Visual primitives and page building blocks shared by every screen, composed from the shadcn components. */
import React, { useRef, useState } from "react";
import { Check, ChevronDown, Circle, Ellipsis, Info, MessageSquare, Trash2, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { Cube } from "./Cube";
import { SessionButton } from "./phone";
import { FADE, Icon, InHead, MONO, Tip, useQuiet, usePhone, type Props, type Variant } from "./base";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { EVENTS } from "../../src/shared/puzzles";
import { fmtSolve } from "../../src/client/lib/format";

export * from "./base";
export { plural } from "../../src/client/lib/format";
export { run } from "./store";

type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

/** A shadcn button dispatching a store action, with a tooltip when it has one (icon buttons always do). */
export function Button({
  action,
  icon: I,
  tip,
  variant: chosen,
  size,
  className,
  disabled = false,
  children,
  label,
}: {
  action: string;
  icon?: LucideIcon;
  tip?: React.ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Accessible name when the button shows only an icon. */
  label?: string;
} & Props) {
  const iconOnly = !!I && (children == null || children === false);
  const variant = useQuiet(chosen);
  const button = (
    <UiButton
      data-action={action}
      variant={variant}
      size={size ?? (iconOnly ? "icon" : "default")}
      aria-label={label ?? (iconOnly && typeof tip === "string" ? tip : undefined)}
      className={className}
      disabled={disabled}
      onClick={run(action)}
    >
      {I && <I />}
      {children}
    </UiButton>
  );
  return tip ? <Tip content={tip}>{button}</Tip> : button;
}

/** An on/off button dispatching its action on each press. */
export function ActionToggle({
  action,
  pressed,
  icon: I,
  tip,
  children,
  className,
  disabled,
  size = "default",
  variant,
}: { action: string; pressed: boolean; icon?: LucideIcon; tip?: React.ReactNode; disabled?: boolean; size?: "default" | "sm" | "lg"; variant?: "default" | "outline" } & Props) {
  const head = React.useContext(InHead);
  const toggle = (
    <Toggle
      variant={variant ?? (head ? "outline" : "default")}
      data-action={action}
      pressed={pressed}
      size={size}
      disabled={disabled}
      aria-label={!children && typeof tip === "string" ? tip : undefined}
      className={cn("aria-pressed:text-foreground", className)}
      onClick={run(action)}
    >
      {I && <I />}
      {children}
    </Toggle>
  );
  return tip ? <Tip content={tip}>{toggle}</Tip> : toggle;
}

/** One choice among a few, each option dispatching `prefix + id`. */
export function Choice({
  prefix,
  value,
  options,
  label,
  size = "sm",
  className,
}: {
  prefix: string;
  value: string;
  options: { id: string; label: React.ReactNode; count?: number; tip?: string }[];
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const head = React.useContext(InHead);
  return (
    <ToggleGroup
      aria-label={label}
      variant={head ? "outline" : "default"}
      size={size}
      spacing={1}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0] && next[0] !== value) void s.action(prefix + next[0]);
      }}
      className={className}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.id}
          value={o.id}
          data-action={prefix + o.id}
          title={o.tip}
          className="px-2.5 text-muted-foreground aria-pressed:text-foreground"
        >
          {o.label}
          {o.count != null && <span className={cn(MONO, "text-xs text-muted-foreground")}>{o.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A header menu: the current value on a button (bordered in a header), the choices as radio items. */
export function SelectMenu({
  action,
  value,
  options,
  caption,
  icon,
  align = "end",
  variant: chosen,
  className,
}: {
  action: string;
  value: string;
  options: { id: string; label: string; icon?: React.ReactNode }[];
  /** Muted word before the value, e.g. "Scramble". */
  caption?: string;
  icon?: React.ReactNode;
  align?: "start" | "end" | "center";
  variant?: Variant;
  className?: string;
}) {
  const current = options.find((o) => o.id === value);
  const variant = useQuiet(chosen);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<UiButton variant={variant} data-action={"menu:" + action} className={cn("gap-1.5", className)} />}
      >
        {icon}
        {caption && <span className="text-muted-foreground">{caption}</span>}
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => void s.action(action + ":" + v)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
              {o.icon}
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PUZZLE_COLUMNS = 4;

/**
 * The WCA events as a grid of icons in a popover. `profile` picks the profile's event instead of the app's.
 * Arrows move by cell and row.
 */
export function PuzzlePicker({ profile = false, trigger, align = "start", side = "bottom" }: {
  profile?: boolean;
  trigger: React.ReactElement;
  align?: "start" | "end" | "center";
  side?: "bottom" | "right";
}) {
  const [open, setOpen] = useState(false),
    current = profile ? s.event(s.profilePuzzle, s.profileSolveMode).id : s.event().id,
    chosen = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} data-action={"menu:" + (profile ? "profilePuzzles" : "puzzles")} />
      <PopoverContent align={align} side={side} className="w-auto p-1.5" initialFocus={chosen}>
        <div
          role="listbox"
          aria-label="Puzzle"
          className="grid grid-cols-4 gap-0.5"
          onKeyDown={(e) => {
            const step = { ArrowDown: PUZZLE_COLUMNS, ArrowUp: -PUZZLE_COLUMNS, ArrowRight: 1, ArrowLeft: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const cells = [...e.currentTarget.querySelectorAll("button")],
              at = cells.indexOf(document.activeElement as HTMLButtonElement);
            cells[Math.max(0, Math.min(cells.length - 1, at + step))]?.focus();
          }}
        >
          {EVENTS.map((v) => (
            <button
              key={v.id}
              ref={v.id === current ? chosen : undefined}
              type="button"
              role="option"
              aria-selected={v.id === current}
              className={cn(
                "flex w-21 flex-col items-center gap-2 rounded-md px-1 pt-3 pb-2.5 text-xs text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground",
                v.id === current && "bg-foreground/8 text-foreground",
              )}
              onClick={() => {
                setOpen(false);
                void s.action((profile ? "profilePuzzle:" : "puzzle:") + v.id);
              }}
            >
              <Icon name={"Puzzle" + v.id} size={26} />
              <span className="max-w-full truncate">{v.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The puzzle as a header button, on phones where there is no sidebar and in the profile's filters. */
export function PuzzleButton({ profile = false }: { profile?: boolean }) {
  const e = profile ? s.event(s.profilePuzzle, s.profileSolveMode) : s.event();
  const variant = useQuiet();
  return (
    <PuzzlePicker
      profile={profile}
      align="end"
      trigger={
        <UiButton variant={variant} className="gap-2">
          <Icon name={"Puzzle" + e.id} size={16} />
          {e.label}
          <ChevronDown className="text-muted-foreground" />
        </UiButton>
      }
    />
  );
}

/**
 * Right-click on any solve: its penalty as a radio choice, the comment and the details, and delete. The child is the
 * element clicked; a plain click keeps its own behaviour.
 */
export function SolveMenu({ solve, children }: { solve: { id: number; time_ms?: number; timeMs?: number; time?: number | null; penalty?: string } | undefined; children: React.ReactElement }) {
  // A long press opens the menu on touch screens: the release that ends it is not a tap.
  const pressedAt = useRef(0);
  if (!solve) return children;
  const id = solve.id,
    penalty = solve.penalty === "+2" || solve.penalty === "dnf" ? solve.penalty : "none",
    ms = solve.time_ms ?? solve.timeMs;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={children}
        onPointerDown={(e: React.PointerEvent) => (pressedAt.current = e.pointerType === "touch" ? Date.now() : 0)}
        onClickCapture={(e: React.MouseEvent) => {
          if (!pressedAt.current || Date.now() - pressedAt.current < 450) return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <ContextMenuContent className="min-w-48 max-md:min-w-56 max-md:[&_[role^=menuitem]]:min-h-10">
        {ms != null && (
          <ContextMenuGroup>
            <ContextMenuLabel className={MONO}>{fmtSolve(ms, penalty as any)}</ContextMenuLabel>
          </ContextMenuGroup>
        )}
        <ContextMenuRadioGroup value={penalty} onValueChange={(v: string) => void s.action(`penalty:${id}:${v}`)}>
          <ContextMenuRadioItem value="none" closeOnClick>
            No penalty
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="+2" closeOnClick>
            +2
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="dnf" closeOnClick>
            DNF
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void s.action("comment:" + id)}>
          <MessageSquare />
          Comment…
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void s.action("solve:" + id)}>
          <Info />
          Details
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => void s.action("delete:" + id)}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The actions of a solve row, shown while the row is hovered or focused (the row is a `group/row`): +2, DNF, the
 * comment when asked, and delete.
 */
export function SolveActions({ solve, comment = false, className }: { solve: { id: number; penalty?: string; comment?: string | null }; comment?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100", className)}>
      <ActionToggle action={`penalty:${solve.id}:+2`} pressed={solve.penalty === "+2"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground">
        +2
      </ActionToggle>
      <ActionToggle action={`penalty:${solve.id}:dnf`} pressed={solve.penalty === "dnf"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground">
        DNF
      </ActionToggle>
      {comment && (
        <Button action={"comment:" + solve.id} icon={MessageSquare} size="icon-xs" label={solve.comment ? "Edit comment" : "Add comment"} className={cn("text-muted-foreground", solve.comment && "text-primary")} />
      )}
      <Button action={"delete:" + solve.id} icon={Trash2} size="icon-xs" label="Delete solve" className="text-muted-foreground hover:text-destructive" />
    </span>
  );
}

/**
 * Whether a case is learned, as a status mark after its time (like an issue's status): a green disc with a check once
 * learned, a quiet dashed circle otherwise, clearer while the row (`group/row`) is hovered or focused. A click toggles
 * it without opening the row.
 */
export function LearnedMark({ id, learned, touch = false, action = "learn:" + id }: { id: string; learned: boolean; touch?: boolean; action?: string }) {
  const label = learned ? "Learned" : "Mark learned";
  return (
    <Tip content={label}>
      <button
        type="button"
        data-action={action}
        aria-pressed={learned}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          run(action)(e);
        }}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          touch ? "size-11" : "size-7",
          learned ? "text-success" : "text-muted-foreground/40 group-hover/row:text-muted-foreground/80 group-focus-within/row:text-muted-foreground/80 hover:text-foreground",
        )}
      >
        {learned ? (
          <span className="flex size-3.5 items-center justify-center rounded-full bg-current">
            <Check className="size-2.5 text-background" strokeWidth={3.5} />
          </span>
        ) : (
          <Circle className="size-4" strokeDasharray="3.5 3" />
        )}
      </button>
    </Tip>
  );
}

export function Diagram({ c, size = 96, className }: { c: any; size?: number; className?: string }) {
  if (!c) return null;
  return c.cube ? (
    <Cube scene={c.cube} size={size} animated={false} />
  ) : (
    <img className={cn("block shrink-0", className)} src={"../assets/" + c.asset} width={size} height={size} alt={c.id} />
  );
}

/**
 * Every page starts with the same header on the page background: the way back if any, the title and one short line
 * beside it on the same line on the left, the page's controls on the right. Phones keep one row: the puzzle, the
 * few controls a thumb needs, and the rest in the "…" menu (`more`).
 */
export function PageHead({
  title,
  sub,
  lead,
  puzzle = false,
  more,
  children,
}: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; puzzle?: boolean | "scramble"; more?: React.ReactNode } & Props) {
  const phone = usePhone();
  return (
    <InHead.Provider value={true}>
    <header className={cn("flex min-h-10 shrink-0 items-center justify-between gap-x-2 md:justify-start md:gap-x-6", FADE)}>
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {lead}
        {/* One line: the title, then its subtitle on the same baseline, cut short where the row runs out. */}
        <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
          <h1 className="max-w-full min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {sub && <p className="min-w-0 truncate text-xs text-muted-foreground md:text-sm">{sub}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 md:justify-start">
        {phone && puzzle && <SessionButton scramble={puzzle === "scramble"} />}
        {children}
        {more && <MoreMenu>{more}</MoreMenu>}
      </div>
    </header>
    </InHead.Provider>
  );
}

/** The "…" of a phone header: the page's other controls as menu items. */
export function MoreMenu({ children }: Props) {
  const variant = useQuiet();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant={variant} size="icon" aria-label="More" data-action="menu:more" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A menu item dispatching a store action. */
export function MenuAction({ action, icon: I, children, disabled }: { action: string; icon?: LucideIcon; disabled?: boolean } & Props) {
  return (
    <DropdownMenuItem data-action={action} disabled={disabled} onClick={() => void s.action(action)}>
      {I && <I />}
      {children}
    </DropdownMenuItem>
  );
}

/** One choice among a few inside a menu: a label over the radio items, each dispatching `action:id`. */
export function MenuChoice({ label, action, value, options }: { label: string; action: string; value: string; options: { id: string; label: string }[] }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => void s.action(action + ":" + v)}>
        {options.map((o) => (
          <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
            {o.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
