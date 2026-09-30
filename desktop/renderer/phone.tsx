/**
 * Phone building blocks, the reference for the Android app too: sheets that come up from the bottom and follow the
 * thumb (Base UI drawers, swipe down to dismiss), the session picker (puzzle, scramble, entry) as one of them, and the
 * rows of large touch targets that sit at the bottom of a stage, near the tab bar.
 */
import React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { EVENTS } from "../../src/shared/puzzles";
import { Icon, type Props } from "./ui";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button as UiButton } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  tall?: boolean;
  snapPoints?: (number | string)[];
  hideTitle?: boolean;
} & Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={snapPoints} showSwipeHandle>
      <DrawerContent className={cn("pb-[env(safe-area-inset-bottom)]", tall && "h-[calc(100dvh-5rem)]")}>
        <DrawerHeader className={cn("px-5 pt-2 pb-1 text-left!", hideTitle && "sr-only")}>
          <DrawerTitle className="text-base font-semibold">{title}</DrawerTitle>
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

/** One cell of a touch bar dispatching a store action; `pressed` marks an on/off one. */
export function TouchAction({
  action,
  icon: I,
  label,
  pressed,
  disabled,
  tone,
  primary = false,
}: {
  action: string;
  icon?: LucideIcon;
  label: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  tone?: string;
  primary?: boolean;
}) {
  return (
    <UiButton
      data-action={action}
      variant={primary ? "default" : "ghost"}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
      className={cn(
        "h-12 flex-col gap-0.5 px-1 text-[11px] font-medium",
        !primary && "text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        pressed && tone,
      )}
    >
      {I ? <I className="size-[18px]" /> : null}
      {label}
    </UiButton>
  );
}

/** The session picker's trigger in a phone header: the puzzle, and the scramble on the timer. */
export function SessionButton({ scramble = false }: { scramble?: boolean }) {
  const e = s.event();
  return (
    <UiButton
      variant="ghost"
      data-action="menu:session"
      className="h-9 max-w-44 gap-1.5 px-2"
      onClick={(event) => {
        event.currentTarget.blur();
        s.overlay = scramble ? "session:scramble" : "session";
        s.emit();
      }}
    >
      <Icon name={"Puzzle" + e.id} size={16} />
      <span className="truncate">
        {e.label}
        {scramble && s.scrambleType !== "normal" && <span className="text-muted-foreground"> · {s.label("scrambles", s.scrambleType)}</span>}
      </span>
      <ChevronDown className="text-muted-foreground" />
    </UiButton>
  );
}

/** Choices laid out as large cells in a sheet. */
function SheetChoice({ label, value, options, onChange, columns = 3 }: {
  label: string;
  value: string;
  options: { id: string; label: React.ReactNode }[];
  onChange: (id: string) => void;
  columns?: number;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <ToggleGroup
        aria-label={label}
        value={[value]}
        spacing={1}
        onValueChange={(next: string[]) => next[0] && next[0] !== value && onChange(next[0])}
        className="grid w-full gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.id} value={o.id} className="h-11 w-full bg-muted/40 px-2 text-muted-foreground aria-pressed:bg-primary/12 aria-pressed:text-foreground">
            {o.label}
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
    close = () => {
      s.overlay = "";
      s.emit();
    };
  const current = s.event().id;
  return (
    <PhoneSheet open={open} onOpenChange={(next) => !next && open && close()} title={scramble ? "Puzzle and scramble" : "Puzzle"} tall={scramble}>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Puzzle</h3>
        <div role="listbox" aria-label="Puzzle" className="grid grid-cols-4 gap-1">
          {EVENTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={v.id === current}
              data-action={"puzzle:" + v.id}
              onClick={() => {
                if (!scramble) close();
                void s.action("puzzle:" + v.id);
              }}
              className={cn(
                "flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-[11px] leading-tight text-muted-foreground outline-none active:bg-muted",
                v.id === current && "bg-primary/12 text-foreground",
              )}
            >
              <Icon name={"Puzzle" + v.id} size={24} />
              <span className="line-clamp-2 max-w-full text-center">{v.label}</span>
            </button>
          ))}
        </div>
      </section>
      {scramble && (
        <>
          <SheetChoice
            label="Scramble"
            value={s.scrambleType}
            columns={2}
            options={s.info().scrambles
              .filter((id: string) => !id.startsWith("cross1-"))
              .map((id: string) => ({ id, label: s.label("scrambles", id) }))}
            onChange={(id) => void s.action("scrambleType:" + id).then(() => {
              s.overlay = "session:scramble";
              s.emit();
            })}
          />
          <SheetChoice
            label="Entry"
            value={s.entry}
            options={[
              { id: "timer", label: "Timer" },
              { id: "typing", label: "Typing" },
              { id: "casual", label: "Casual" },
            ]}
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
