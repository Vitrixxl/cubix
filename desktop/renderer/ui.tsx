/** Visual primitives and page building blocks shared by every screen, composed from the shadcn components. */
import React, { useMemo, useRef } from "react";
import { Check, ChevronDown, Circle, Info, MessageSquare, Share2, Trash2, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { Cube } from "./Cube";
import { PhoneSheet, SessionButton } from "./phone";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Back as BaseBack, Icon, InHead, NUMERIC, PageHead as BasePageHead, Segmented, Tip, useQuiet, usePhone, type Props, type Variant } from "./base";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
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
import { cubeScene } from "../../src/shared/cubeScene";
import { maskForStage } from "../../src/client/lib/caseState";
import { fmtSolve } from "../../src/client/lib/format";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { tn } from "../../src/client/i18n";

export * from "./base";
/** A count and its noun in the current language: plural(3, "solve") is "3 solves", or "3 résolutions". */
export const plural = (count: number, noun: string) => tn(count, `{n} ${noun}`);
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
      aria-label={said(label ?? (iconOnly && typeof tip === "string" ? tip : undefined))}
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
      aria-label={!children && typeof tip === "string" ? said(tip) : undefined}
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
export function Choice({ prefix, ...rest }: { prefix: string } & Omit<React.ComponentProps<typeof Segmented>, "onChange" | "action">) {
  return <Segmented {...rest} action={prefix} onChange={(id) => void s.action(prefix + id)} />;
}

/** A header menu: the current value on a button (bordered in a header), the choices as radio items. */
export function SelectMenu({
  action,
  onChange,
  value,
  options,
  caption,
  label,
  icon,
  align = "end",
  variant: chosen,
  className,
}: {
  /** The store action each choice dispatches, as `action:id`; or `onChange` for a choice kept by the page. */
  action: string;
  onChange?: (id: string) => void;
  value: string;
  options: { id: string; label: string; icon?: React.ReactNode }[];
  /** Muted word before the value, e.g. "Scramble". */
  caption?: string;
  /** The menu's name for screen readers, when no caption says it. */
  label?: string;
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
        render={<UiButton variant={variant} data-action={"menu:" + action} aria-label={said(label)} className={cn("gap-1.5", className)} />}
      >
        {icon}
        {caption && <span className="text-muted-foreground">{said(caption)}</span>}
        <span className="truncate">{said(current?.label ?? value)}</span>
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => (onChange ? onChange(v) : void s.action(action + ":" + v))}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
              {o.icon}
              {said(o.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The WCA events as a select: each with its icon, the chosen one checked. `profile` picks the profile's event instead of the app's. */
export function PuzzlePicker({ profile = false, trigger, align = "start" }: { profile?: boolean; trigger: React.ReactElement; align?: "start" | "end" | "center" }) {
  const current = profile ? s.event(s.profilePuzzle, s.profileSolveMode).id : s.event().id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} data-action={"menu:" + (profile ? "profilePuzzles" : "puzzles")} />
      <DropdownMenuContent align={align} className="max-h-[min(32rem,var(--available-height))] w-auto min-w-52">
        <DropdownMenuRadioGroup value={current} onValueChange={(v: string) => void s.action((profile ? "profilePuzzle:" : "puzzle:") + v)}>
          {EVENTS.map((v) => (
            <DropdownMenuRadioItem key={v.id} value={v.id} closeOnClick>
              <Icon name={"Puzzle" + v.id} size={16} />
              {said(v.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The puzzle as a select in a page's header: the profile's. */
export function PuzzleButton({ profile = false }: { profile?: boolean }) {
  const e = profile ? s.event(s.profilePuzzle, s.profileSolveMode) : s.event();
  const variant = useQuiet();
  return (
    <PuzzlePicker
      profile={profile}
      trigger={
        <UiButton variant={variant} className="gap-2">
          <Icon name={"Puzzle" + e.id} size={16} />
          {said(e.label)}
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
            <ContextMenuLabel className={NUMERIC}>{fmtSolve(ms, penalty as any)}</ContextMenuLabel>
          </ContextMenuGroup>
        )}
        <ContextMenuRadioGroup value={penalty} onValueChange={(v: string) => void s.action(`penalty:${id}:${v}`)}>
          <ContextMenuRadioItem value="none" closeOnClick>
            {tr("No penalty")}</ContextMenuRadioItem>
          <ContextMenuRadioItem value="+2" closeOnClick>
            +2
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="dnf" closeOnClick>
            {tr("DNF")}</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void s.action("comment:" + id)}>
          <MessageSquare />
          {tr("Comment…")}</ContextMenuItem>
        <ContextMenuItem onClick={() => void s.action("solve:" + id)}>
          <Info />
          {tr("Details")}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => void s.action("delete:" + id)}>
          <Trash2 />
          {tr("Delete")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The actions of a solve row, shown while the row is hovered or focused (the row is a `group/row`): +2, DNF, the
 * comment, the link and the details when `full`, and delete.
 */
export function SolveActions({ solve, full = false, className }: { solve: { id: number; penalty?: string; comment?: string | null }; full?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100", className)}>
      <ActionToggle action={`penalty:${solve.id}:+2`} pressed={solve.penalty === "+2"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground aria-pressed:text-warning">
        +2
      </ActionToggle>
      <ActionToggle action={`penalty:${solve.id}:dnf`} pressed={solve.penalty === "dnf"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground aria-pressed:text-destructive">
        {tr("DNF")}</ActionToggle>
      {full && (
        <>
          <Button action={"comment:" + solve.id} icon={MessageSquare} size="icon-xs" label={solve.comment ? tr("Edit comment") : tr("Add comment")} className={cn("text-muted-foreground", solve.comment && "text-primary")} />
          {!s.user.isGuest && <Button action={"share:" + solve.id} icon={Share2} size="icon-xs" label={tr("Share")} className="text-muted-foreground" />}
          <Button action={"solve:" + solve.id} icon={Info} size="icon-xs" label={tr("Details")} className="text-muted-foreground" />
        </>
      )}
      <Button action={"delete:" + solve.id} icon={Trash2} size="icon-xs" label={tr("Delete solve")} className="text-muted-foreground hover:text-destructive" />
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
        aria-label={said(label)}
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
        <StatusMark state={learned ? "done" : "todo"} />
      </button>
    </Tip>
  );
}

/**
 * Where a thing stands, as a glyph in the current colour: a disc with a check once done, a ring around a dot for the
 * current one, a small dot for one with nothing to do, a dashed circle otherwise. The caller colours it (success when
 * done, the accent when current, muted otherwise).
 */
export function StatusMark({ state }: { state: "done" | "current" | "neutral" | "todo" }) {
  if (state === "done")
    return (
      <span className="flex size-3.5 items-center justify-center rounded-full bg-current">
        <Check className="size-2.5 text-background" strokeWidth={3.5} />
      </span>
    );
  if (state === "current")
    return (
      <span className="flex size-3.5 items-center justify-center rounded-full border-[1.5px] border-current">
        <span className="size-1.5 rounded-full bg-current" />
      </span>
    );
  if (state === "neutral") return <span className="size-1.5 rounded-full bg-current" />;
  return <Circle className="size-4" strokeDasharray="3.5 3" />;
}

/** How far a step or set is learned: a check once all its algorithms are, a small dot without algorithms, else a ring filled as far as they are. */
export function ProgressRing({ done, share, current, neutral }: { done: boolean; share: number; current?: boolean; neutral?: boolean }) {
  if (done || neutral)
    return (
      <span className={cn("flex size-4 shrink-0 items-center justify-center", done ? "text-success" : current ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true">
        <StatusMark state={done ? "done" : "neutral"} />
      </span>
    );
  const r = 6.5,
    length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 -rotate-90", current || share > 0 ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2.5" />
      {share > 0 && <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${share * length} ${length}`} />}
    </svg>
  );
}

/** Whether an algorithm or a case is learned, as a labelled toggle: "Mark learned", then "Learned" in green; an intuitive step says mastered. */
export function LearnToggle({ action, learned, touch = false, mastery = false, className }: { action: string; learned: boolean; touch?: boolean; mastery?: boolean; className?: string }) {
  return (
    <ActionToggle
      action={action}
      pressed={learned}
      icon={Check}
      variant="outline"
      className={cn("text-muted-foreground aria-pressed:border-success/40 aria-pressed:bg-success/15 aria-pressed:text-success", touch && "h-11 px-3", className)}
    >
      {mastery ? (learned ? tr("Mastered") : tr("Mark as mastered")) : learned ? tr("Learned") : tr("Mark learned")}
    </ActionToggle>
  );
}

/**
 * +2 and DNF on a solve, as two toggles: +2 in the warning colour once on, DNF in red. Each dispatches `prefix + "+2"`
 * or `prefix + "dnf"`, or calls `onToggle` when the page keeps the solve itself.
 */
export function PenaltyToggles({
  penalty,
  prefix,
  onToggle,
  disabled = false,
  variant = "outline",
}: {
  penalty: string | undefined;
  prefix?: string;
  onToggle?: (penalty: "+2" | "dnf") => void;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <>
      {(["+2", "dnf"] as const).map((p) => {
        const toggle = (
          <Toggle
            key={p}
            variant={variant}
            size="sm"
            pressed={penalty === p}
            disabled={disabled}
            data-action={prefix != null ? prefix + p : undefined}
            onClick={() => (onToggle ? onToggle(p) : void s.action(prefix + p))}
            className={cn("text-muted-foreground", p === "+2" ? "aria-pressed:text-warning" : "aria-pressed:text-destructive")}
          >
            {p === "+2" ? "+2" : tr("DNF")}
          </Toggle>
        );
        return toggle;
      })}
    </>
  );
}

export function Diagram({ c, size = 96, className }: { c: any; size?: number; className?: string }) {
  // Cases without a drawn diagram nor a view from above show on the 3D cube (desktop/scripts/export-assets.tsx).
  const scene = useMemo(() => (c && !c.diagram && !c.flat ? cubeScene(c.setup, c.cube_size ?? 3, maskForStage(c.stage), false) : undefined), [c?.setup, c?.cube_size, c?.stage, c?.diagram, c?.flat]);
  if (!c) return null;
  return scene ? (
    <Cube scene={scene} size={size} animated={false} />
  ) : (
    <img className={cn("block shrink-0", className)} src={"/assets/" + c.asset} width={size} height={size} alt={c.id} />
  );
}

/** The page header (base.tsx), with the puzzle and its session on phones when the page has one (`puzzle`). */
export function PageHead({ puzzle = false, children, ...rest }: { puzzle?: boolean | "scramble" } & React.ComponentProps<typeof BasePageHead>) {
  const phone = usePhone();
  return (
    <BasePageHead {...rest}>
      {phone && puzzle && <SessionButton scramble={puzzle === "scramble"} />}
      {children}
    </BasePageHead>
  );
}

/** The way back (base.tsx), dispatching a store action. */
export function Back({ action, label }: { action: string; label?: string }) {
  return <BaseBack action={action} label={label} onClick={() => void s.action(action)} />;
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
      <DropdownMenuLabel>{said(label)}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => void s.action(action + ":" + v)}>
        {options.map((o) => (
          <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
            {said(o.label)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** A `DialogFooter` reaches the dialog's edges, whatever its padding: the dialog's 6, the phone sheet's 5. */
const DIALOG_FOOTER = "*:data-[slot=dialog-footer]:-mx-6 *:data-[slot=dialog-footer]:-mb-6 *:data-[slot=dialog-footer]:px-6",
  SHEET_FOOTER = "*:data-[slot=dialog-footer]:-mx-5 *:data-[slot=dialog-footer]:-mb-5 *:data-[slot=dialog-footer]:rounded-none *:data-[slot=dialog-footer]:px-5";

/**
 * A dialog: centred on a desktop, a sheet from the bottom on phones (full height when `tall`). It is open while the app
 * overlay is `id`, or as `open` says when the page keeps it. `className` styles the dialog, `sheetClassName` the sheet's
 * body.
 */
export function Modal({
  id,
  open: shown,
  onOpenChange: changed,
  children,
  className,
  sheetClassName,
  title,
  description,
  hideHeader = false,
  tall = false,
}: {
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  hideHeader?: boolean;
  tall?: boolean;
  className?: string;
  sheetClassName?: string;
  children: React.ReactNode;
}) {
  const phone = usePhone(),
    open = id != null ? s.overlay === id : !!shown,
    onOpenChange = (next: boolean) => {
      if (id != null) return void (!next && s.overlay === id && s.closeOverlay());
      changed?.(next);
    };
  if (phone)
    return (
      <PhoneSheet open={open} onOpenChange={onOpenChange} title={said(title)} description={said(description)} tall={tall} hideTitle={hideHeader} className={cn(SHEET_FOOTER, sheetClassName)}>
        {children}
      </PhoneSheet>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-5 p-6", DIALOG_FOOTER, className)}>
        <DialogHeader className={hideHeader ? "sr-only" : undefined}>
          <DialogTitle className="text-lg font-semibold tracking-tight">{said(title)}</DialogTitle>
          {description && <DialogDescription>{said(description)}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
