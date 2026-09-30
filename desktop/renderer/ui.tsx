/** Visual primitives and page building blocks shared by every screen, composed from the shadcn components. */
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, MessageSquare, Trash2, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { Cube } from "./Cube";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
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

export type Props = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export const MOBILE = 700;

/** Everything but the running digits fades out while a solve runs (the root carries `data-running`). */
export const FADE = "transition-opacity duration-200 group-data-running/app:pointer-events-none group-data-running/app:opacity-0";

/** Times and figures: mono with tabular digits. */
export const MONO = "font-mono tabular-nums";

/** The small uppercase-free caption over a figure or a block. */
export const LABEL = "text-xs font-medium text-muted-foreground";

/** An SVG of desktop/assets/icons drawn in the current colour: the WCA puzzle icons. */
export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current mask-contain mask-center mask-no-repeat", className)}
      style={{ width: size, height: size, maskImage: `url(../assets/icons/${name}.svg)` }}
    />
  );
}

const run = (action: string) => (e: React.MouseEvent<HTMLElement>) => {
  // Space starts the timer: it must not click the button pressed last.
  e.currentTarget.blur();
  void s.action(action, e.currentTarget);
};

type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

/** A shadcn button dispatching a store action, with a tooltip when it has one (icon buttons always do). */
export function Button({
  action,
  icon: I,
  tip,
  variant = "ghost",
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

/** A tooltip over any element. */
export function Tip({ content, children, side = "bottom" }: { content: React.ReactNode; side?: "top" | "bottom" | "left" | "right" } & { children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
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
}: { action: string; pressed: boolean; icon?: LucideIcon; tip?: React.ReactNode; disabled?: boolean; size?: "default" | "sm" | "lg" } & Props) {
  const toggle = (
    <Toggle
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
  return (
    <ToggleGroup
      aria-label={label}
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

/** A header menu: the current value on a ghost button, the choices as radio items. */
export function SelectMenu({
  action,
  value,
  options,
  caption,
  icon,
  align = "end",
  variant = "ghost",
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
  return (
    <PuzzlePicker
      profile={profile}
      align="end"
      trigger={
        <UiButton variant="ghost" className="gap-2">
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
  if (!solve) return children;
  const id = solve.id,
    penalty = solve.penalty === "+2" || solve.penalty === "dnf" ? solve.penalty : "none",
    ms = solve.time_ms ?? solve.timeMs;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="min-w-48">
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

export function Empty({ children, className }: Props) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
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

/** The face a cube move turns (R, Rw, 3Rw2, r…), for its sticker colour: null for any other notation. */
const faceOf = (move: string) =>
  /^\d*([URFDLB])w?[2']*$/.exec(move)?.[1] ?? /^([urfdlb])[2']*$/.exec(move)?.[1].toUpperCase() ?? null;

const FACE: Record<string, string> = {
  U: "after:bg-neutral-300 dark:after:bg-neutral-200",
  R: "after:bg-red-500",
  F: "after:bg-green-500",
  D: "after:bg-yellow-400",
  L: "after:bg-orange-500",
  B: "after:bg-blue-500",
};

/** Moves in notation. With `faces`, each cube move is underlined with the colour of the face it turns. */
export function Alg({ text, size = 18, faces = false, className }: { text: string; size?: number; faces?: boolean; className?: string }) {
  return (
    <div
      className={cn("alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-mono leading-snug font-medium tracking-tight", className)}
      style={{ fontSize: size }}
    >
      {text?.split(/\s+/).map((word, i) => {
        const face = faces ? faceOf(word) : null;
        return (
          <span
            key={i}
            className={cn(
              /[()\[\]]/.test(word) && "text-muted-foreground",
              face &&
                "relative pb-[0.28em] after:absolute after:inset-x-[0.06em] after:bottom-0 after:h-[2px] after:rounded-full after:opacity-80",
              face && FACE[face],
            )}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Every page starts with the same header on the page itself: the title and one short line under it on the left, the
 * page's controls on the right. Phones put the puzzle beside the title.
 */
export function PageHead({
  title,
  sub,
  lead,
  puzzle = false,
  children,
}: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; puzzle?: boolean } & Props) {
  const mobile = useViewport().w <= MOBILE;
  return (
    <header className={cn("flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3", FADE)}>
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {sub && <p className="truncate text-sm text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {(React.Children.toArray(children).some(Boolean) || (mobile && puzzle)) && (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          {mobile && puzzle && <PuzzleButton />}
          {children}
        </div>
      )}
    </header>
  );
}

/** The padding every page has, and its column. */
export const PAGE = "flex h-full min-h-0 flex-col gap-6 px-4 pt-4 pb-3 md:px-8 md:pt-6 md:pb-6";

/** A whole page on its way: its header, the main area and the side list, shaped like the timer. */
export function PageSkeleton({ side = true }: { side?: boolean }) {
  return (
    <div className={PAGE} aria-busy="true" aria-label="Loading">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-6 w-3/5" />
          <div className="flex flex-1 flex-col items-center justify-center gap-5">
            <Skeleton className="h-24 w-80" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-7 w-18" />
              ))}
            </div>
          </div>
          <div className="flex gap-10">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
        {side && (
          <div className="flex w-64 flex-col gap-3">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The app's mark: four stickers, one of them turned to the accent. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      {[0, 1].flatMap((row) =>
        [0, 1].map((col) => (
          <rect
            key={row * 2 + col}
            x={col * 9.75}
            y={row * 9.75}
            width={8.25}
            height={8.25}
            rx={2.2}
            className={row === 0 && col === 1 ? "fill-primary" : "fill-foreground/85"}
          />
        )),
      )}
    </svg>
  );
}

export function Avatar({ user, size = 32, className }: { user: any; size?: number; className?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size / 2.8 }}
      aria-hidden="true"
    >
      {user?.username?.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A figure: its label small and muted, the value in mono underneath. */
export function Figure({
  label,
  value,
  tone,
  size = "base",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "" | "good" | "bad" | "accent";
  size?: "sm" | "base" | "lg" | "xl";
  className?: string;
}) {
  const empty = typeof value === "string" && /^[-–—]$/.test(value.trim());
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className={cn(LABEL, "truncate")}>{label}</span>
      <span
        className={cn(
          MONO,
          "truncate leading-none font-medium tracking-tight",
          { sm: "text-sm", base: "text-lg", lg: "text-2xl", xl: "text-4xl" }[size],
          empty
            ? "text-muted-foreground/60"
            : tone === "good"
              ? "text-success"
              : tone === "bad"
                ? "text-destructive"
                : tone === "accent"
                  ? "text-primary"
                  : "",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function useViewport() {
  const [v, set] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const resize = () => set({ w: innerWidth, h: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return v;
}

export const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/** A thin bar: the accent once reached (`done`), muted while on its way. */
export function Bar({ ratio, done = true, className }: { ratio: number; done?: boolean; className?: string }) {
  const value = Math.max(0, Math.min(1, ratio));
  return (
    <div
      className={cn("h-1 min-w-10 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className={cn("h-full rounded-full", done ? "bg-primary" : "bg-muted-foreground/60")} style={{ width: value * 100 + "%" }} />
    </div>
  );
}

/** A section title on the page: a small heading, an optional count and the section's own controls. */
export function SectionHead({ title, meta, children, className }: { title: React.ReactNode; meta?: React.ReactNode } & Props) {
  return (
    <div className={cn("flex min-h-8 shrink-0 items-center gap-2", className)}>
      <h2 className="text-sm font-medium">{title}</h2>
      {meta != null && <span className={cn(MONO, "text-sm text-muted-foreground")}>{meta}</span>}
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </div>
  );
}
