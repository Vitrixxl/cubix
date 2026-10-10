/**
 * Phone building blocks, the reference for the Android app too: sheets that come up from the bottom and follow the
 * thumb (Base UI drawers, swipe down to dismiss), the session picker (puzzle, scramble, entry) as one of them, and the
 * rows of large touch targets that sit at the bottom of a stage, near the tab bar.
 */
import React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { EVENTS } from "../../src/shared/puzzles";
import { TIME_ENTRIES } from "../../src/client/lib/format";
import { Icon, type Props, type Tone } from "./base";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button as UiButton } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** Touch targets: at least 44px each way. */
export const TOUCH = "min-h-11 min-w-11";

/**
 * A sheet from the bottom: a handle to swipe it away, its title, then its content. `tall` takes the screen's height
 * (a dialog's worth of content); `snapPoints` let it rest half open and be pulled up.
 */
export function PhoneSheet({
  open,
  onOpenChange,
  title,
  description,
  tall = false,
  snapPoints,
  hideTitle = false,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** `full`: the whole screen. */
  tall?: boolean | "full";
  snapPoints?: (number | string)[];
  hideTitle?: boolean;
} & Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={snapPoints} showSwipeHandle>
      <DrawerContent className={cn("pb-[env(safe-area-inset-bottom)]", tall === "full" ? "h-dvh max-h-dvh data-[swipe-direction=down]:rounded-t-none" : tall && "h-[calc(100dvh-5rem)]")}>
        <DrawerHeader className={cn("px-5 pt-2 pb-1 text-left!", hideTitle && "sr-only")}>
          <DrawerTitle className="text-xl font-extrabold tracking-[-0.025em]">{title}</DrawerTitle>
          <DrawerDescription className={description ? "text-xs" : "sr-only"}>{description ?? title}</DrawerDescription>
        </DrawerHeader>
        <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-2 pb-5", className)}>{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

/** A bottom row of large touch targets: icon over a short word, equal widths. */
export function TouchBar({ children, className }: Props) {
  return (
    <div className={cn("grid auto-cols-fr grid-flow-col gap-1", className)} data-no-timer>
      {children}
    </div>
  );
}

/** The colour of a pressed touch target by tone (over the pressed muted ground); `good` also tints the ground. */
const PRESSED_TONE: Record<Tone, string> = {
  "": "",
  good: "text-success! bg-success/15!",
  bad: "text-destructive!",
  accent: "text-primary!",
  warning: "text-warning!",
};

/** One cell of a touch bar dispatching a store action; `pressed` marks an on/off one, `tone` colours it while on. */
export function TouchAction({
  action,
  icon: I,
  label,
  pressed,
  disabled,
  tone = "",
  primary = false,
}: {
  action: string;
  icon?: LucideIcon;
  label: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  tone?: Tone;
  primary?: boolean;
}) {
  return (
    <UiButton
      data-action={action}
      variant={primary ? "default" : "ghost"}
      size="tab"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={run(action)}
      className={cn(
        !primary && "text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        pressed && PRESSED_TONE[tone],
      )}
    >
      {I ? <I /> : null}
      {label}
    </UiButton>
  );
}

/** The session picker's trigger in a phone header: the puzzle, and the scramble on the timer. */
export function SessionButton({ scramble = false }: { scramble?: boolean }) {
  const e = s.event();
  return (
    <UiButton
      variant="outline"
      data-action="menu:session"
      className="max-w-44"
      onClick={(event) => {
        event.currentTarget.blur();
        s.overlay = scramble ? "session:scramble" : "session";
        s.emit();
      }}
    >
      <Icon name={"Puzzle" + e.id} size={16} />
      <span className="truncate">
        {said(e.label)}
        {scramble && (s.dailyEvent() || s.scrambleChoice() !== "normal") && <span className="text-muted-foreground"> · {s.dailyEvent() ? tr("Daily") : s.label("scrambles", s.scrambleType)}</span>}
      </span>
      <ChevronDown className="text-muted-foreground" />
    </UiButton>
  );
}

/** A cell of a sheet's choice: quiet, tinted with the accent once chosen. */
const CELL = "w-full bg-muted text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground";

/**
 * Choices laid out as large cells in a sheet. Each cell's `onClick` acts when it is tapped, even chosen already;
 * otherwise `onChange` follows the choice.
 */
function SheetChoice({ label, value, options, onChange, columns = 3, className }: {
  label: string;
  value: string;
  options: { id: string; label: React.ReactNode; action?: string; onClick?: () => void }[];
  onChange?: (id: string) => void;
  columns?: number;
  className?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">{said(label)}</h3>
      <ToggleGroup
        aria-label={said(label)}
        value={[value]}
        spacing={1}
        onValueChange={(next: string[]) => next[0] && next[0] !== value && onChange?.(next[0])}
        className="grid w-full gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.id} value={o.id} data-action={o.action} onClick={o.onClick} className={cn(CELL, className)}>
            {said(o.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}

/** The puzzle, and on the timer its scramble type and entry, picked from one sheet instead of three small menus. */
export function SessionSheet() {
  const open = s.overlay.startsWith("session"),
    scramble = s.overlay === "session:scramble",
    close = s.closeOverlay;
  const current = s.event().id;
  return (
    <PhoneSheet open={open} onOpenChange={(next) => !next && open && close()} title={scramble ? tr("Puzzle and scramble") : tr("Puzzle")} tall={scramble}>
      <SheetChoice
        label={tr("Puzzle")}
        value={current}
        columns={4}
        className="h-20 flex-col gap-1.5 px-1 text-xs leading-tight whitespace-normal"
        options={EVENTS.map((v) => ({
          id: v.id,
          action: "puzzle:" + v.id,
          // A tap closes the sheet of the puzzle alone, even on the puzzle already chosen.
          onClick: () => {
            if (!scramble) close();
            void s.action("puzzle:" + v.id);
          },
          label: (
            <>
              <Icon name={"Puzzle" + v.id} size={24} />
              <span className="line-clamp-2 max-w-full text-center">{said(v.label)}</span>
            </>
          ),
        }))}
      />
      {scramble && (
        <>
          <SheetChoice
            label={tr("Scramble")}
            value={s.scrambleChoice()}
            columns={2}
            options={s.scrambleOptions()}
            onChange={(id) => void s.action("scrambleType:" + id).then(() => {
              s.overlay = "session:scramble";
              s.emit();
            })}
          />
          <SheetChoice
            label={tr("Entry")}
            value={s.entry}
            options={TIME_ENTRIES}
            onChange={(id) => {
              void s.action("entry:" + id);
              s.overlay = "session:scramble";
              s.emit();
            }}
          />
        </>
      )}
    </PhoneSheet>
  );
}
