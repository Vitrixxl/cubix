import * as Haptics from "expo-haptics";
import { useSetAtom } from "jotai";
import { Ban, Info, MessageSquare, Plus, Trash2 } from "lucide-react-native";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtSolve } from "../../../src/client/lib/format";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { toastAtom } from "./Toast";
import { deletedSolveIdAtom, routeAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { Confirmations, ask } from "./Confirm";
import { Numeric, TouchAction, TouchBar, type Tone } from "./layout";
import { useLayout } from "../hooks/useLayout";
import { TONE_TEXT } from "../../../src/client/lib/tone";
import { said, tr } from "../../../src/client/i18n";

/** What the actions need from a solve; history rows on the profile provide the same fields. */
export type SolveSummary = Pick<SolveDto, "id" | "time_ms" | "penalty" | "created_at" | "comment"> & { scramble?: string | null };

const MenuContext = createContext<{
  /** Sets a penalty, or takes it off when it is the one already set (as the web's menu). */
  togglePenalty: (solve: SolveSummary, penalty: Penalty) => Promise<unknown>;
  deleteTime: (id: number) => Promise<void>;
  editComment: (solve: SolveSummary) => void;
  /** The solve sheet: the time, its scramble and solution in 3D, its comment and its actions. */
  openSolve: (solve: SolveSummary) => void;
  busy: boolean;
  /** Mutations in flight, as the rows should already look: `null` for a deletion. Lists apply it on top of their data. */
  optimistic: ReadonlyMap<number, SolveSummary | null>;
}>({ togglePenalty: async () => {}, deleteTime: async () => {}, editComment: () => {}, openSolve: () => {}, busy: false, optimistic: new Map() });

/** Shared solve actions: the touch bar under a fresh time, the time lists, the long-press menu and the solve sheet. */
export function SolveMenuProvider({ children }: { children: ReactNode }) {
  const notifyDeleted = useSetAtom(deletedSolveIdAtom);
  const notifyUpdated = useSetAtom(updatedSolveAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useSetAtom(toastAtom);
  // One mutation at a time: a double tap must not delete two solves or race two penalties. True once done.
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    try { await action(); return true; }
    catch (e) { toast({ title: (e as Error).message }); return false; }
    finally { pending.current = false; setBusy(false); }
  }, []);
  // The expected result shows at once; it is dropped in the same render as the refreshed data, or on failure.
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, SolveSummary | null>>(new Map());
  const expect = (id: number, value: SolveSummary | null) => setOptimistic(current => new Map(current).set(id, value));
  const settle = (id: number) => setOptimistic(current => { const next = new Map(current); next.delete(id); return next; });
  const deleteTime = useCallback(async (id: number) => {
    if (!(await ask({ title: tr("Delete this solve?"), action: tr("Delete") }))) return;
    await run(async () => {
      expect(id, null);
      try { await api.deleteSolve(id); notifyDeleted(id); bumpStats(v => v + 1); }
      finally { settle(id); }
    });
  }, [run, notifyDeleted, bumpStats]);
  const setPenalty = useCallback((solve: SolveSummary, next: Penalty) => run(async () => {
    if (solve.penalty === next) return;
    expect(solve.id, { ...solve, penalty: next });
    try {
      const updated = await api.setPenalty(solve.id, next);
      notifyUpdated(updated); bumpStats(v => v + 1);
    } finally { settle(solve.id); }
  }), [run, notifyUpdated, bumpStats]);
  const togglePenalty = useCallback((solve: SolveSummary, penalty: Penalty) => setPenalty(solve, solve.penalty === penalty ? "none" : penalty), [setPenalty]);
  // A solve opens its own screen (SolvePage): its replay, its steps, its comment and its actions.
  const navigate = useSetAtom(routeAtom);
  const openSolve = useCallback((solve: SolveSummary, comment = false) => navigate({ page: "solve", id: solve.id, ...(comment ? { comment: true } : {}) }), [navigate]);
  const editComment = useCallback((solve: SolveSummary) => openSolve(solve, true), [openSolve]);
  return <MenuContext.Provider value={{ togglePenalty, deleteTime, editComment, openSolve, busy, optimistic }}>
    {children}
    <Confirmations />
  </MenuContext.Provider>;
}

/** The shared solve actions, for screens that draw their own buttons. */
export const useSolveMenu = () => useContext(MenuContext);

/**
 * A time that opens its sheet on a tap and, held, the menu of its actions at the finger: No penalty / +2 / DNF,
 * Comment, Details, Delete (the web's right-click menu).
 */
export function SolveMenu({ solve, children, className, rootClassName, onPress, ...props }: { solve: SolveSummary; children: ReactNode; className?: string; /** Layout of the wrapper around the time (in a row of equal cells). */ rootClassName?: string } & Omit<PressableProps, "children">) {
  const { togglePenalty, deleteTime, editComment, openSolve, optimistic } = useContext(MenuContext);
  const insets = useSafeAreaInsets();
  const current = { ...solve, ...optimistic.get(solve.id) };
  return <ContextMenu relativeTo="longPress" className={rootClassName} onOpenChange={open => { if (open) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}>
    <ContextMenuTrigger delayLongPress={350} onPress={onPress ?? (() => openSolve(current))} className={className} {...props}>{children}</ContextMenuTrigger>
    <ContextMenuContent className="min-w-60" insets={{ top: insets.top + 8, bottom: insets.bottom + 8, left: 12, right: 12 }}>
      <ContextMenuLabel><Numeric className={cn("text-base font-semibold", current.penalty === "dnf" && "text-destructive")}>{fmtSolve(current.time_ms, current.penalty)}</Numeric></ContextMenuLabel>
      <ContextMenuRadioGroup value={current.penalty} onValueChange={value => void togglePenalty(current, value as Penalty)}>
        <ContextMenuRadioItem value="none" className="min-h-11"><Text>{tr("No penalty")}</Text></ContextMenuRadioItem>
        <ContextMenuRadioItem value="+2" className="min-h-11"><Text>+2</Text></ContextMenuRadioItem>
        <ContextMenuRadioItem value="dnf" className="min-h-11"><Text>{tr("DNF")}</Text></ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuItem className="min-h-11 gap-3" onPress={() => editComment(current)}><Icon as={MessageSquare} className="text-muted-foreground" /><Text>{tr("Comment…")}</Text></ContextMenuItem>
      <ContextMenuItem className="min-h-11 gap-3" onPress={() => openSolve(current)}><Icon as={Info} className="text-muted-foreground" /><Text>{tr("Details")}</Text></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="min-h-11 gap-3" variant="destructive" onPress={() => void deleteTime(current.id)}><Icon as={Trash2} className="text-destructive" /><Text className="text-destructive">{tr("Delete")}</Text></ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

/**
 * The last solve's actions under the time as the web phone's touch bar: +2, DNF, Comment and Delete, there before the
 * first solve too (disabled) so the timer never moves; `extra` (the next scramble or case) closes the row.
 */
export function LastSolveBar({ solve, extra, look = "touch" }: { solve: SolveSummary | null; extra?: ReactNode; /** `pills`: one row of small filled buttons (the timer). */ look?: "touch" | "pills" }) {
  const { togglePenalty, editComment, deleteTime, busy, optimistic } = useContext(MenuContext);
  const pending = solve ? optimistic.get(solve.id) : undefined;
  const last = solve && pending !== null ? { ...solve, ...pending } : null;
  const off = !last || busy;
  if (look === "pills") return <View accessibilityLabel={tr("Last solve")} className="flex-row gap-1.5">
    <PillAction label="+2" accessibilityLabel={tr("+2 penalty")} pressed={last?.penalty === "+2"} tone="warning" disabled={off} onPress={() => last && void togglePenalty(last, "+2")} />
    <PillAction label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={last?.penalty === "dnf"} tone="bad" disabled={off} onPress={() => last && void togglePenalty(last, "dnf")} />
    <PillAction icon={MessageSquare} label={tr("Note")} accessibilityLabel={last?.comment ? tr("Edit comment") : tr("Add comment")} pressed={!!last?.comment} tone="accent" disabled={off} onPress={() => last && editComment(last)} />
    <PillAction icon={Trash2} label={tr("Delete")} accessibilityLabel={tr("Delete solve")} disabled={off} onPress={() => last && void deleteTime(last.id)} />
    {extra}
  </View>;
  return <TouchBar accessibilityLabel={tr("Last solve")}>
    <TouchAction icon={Plus} label="+2" accessibilityLabel={tr("+2 penalty")} pressed={last?.penalty === "+2"} tone="warning" disabled={off} onPress={() => last && void togglePenalty(last, "+2")} />
    <TouchAction icon={Ban} label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={last?.penalty === "dnf"} tone="bad" disabled={off} onPress={() => last && void togglePenalty(last, "dnf")} />
    <TouchAction icon={MessageSquare} label={tr("Comment")} pressed={!!last?.comment} tone="accent" disabled={off} onPress={() => last && editComment(last)} />
    <TouchAction icon={Trash2} label={tr("Delete")} accessibilityLabel={tr("Delete solve")} disabled={off} onPress={() => last && void deleteTime(last.id)} />
    {extra}
  </TouchBar>;
}

/**
 * A small filled button of the timer's row of last-solve actions; `pressed` tints its word with `tone`, `primary`
 * fills it with the accent (the next scramble). Larger on a tablet, under the thumb.
 */
export function PillAction({ icon, label, pressed, tone = "", primary, disabled, onPress, accessibilityLabel }: { icon?: typeof Plus; label: string; pressed?: boolean; tone?: Tone; primary?: boolean; disabled?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const { tablet } = useLayout();
  const text = primary ? "text-primary-foreground" : pressed ? TONE_TEXT[tone] || "text-foreground" : "text-foreground";
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: pressed, disabled }} disabled={disabled} onPress={onPress}
    className={cn("h-10 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2", tablet && "h-12 gap-2 rounded-2xl",
      primary ? "bg-primary active:bg-primary/85" : pressed ? "bg-accent" : "bg-muted active:bg-muted/70", disabled && "opacity-40")}>
    {icon && <Icon as={icon} size={tablet ? 18 : 15} className={text} />}
    <Text numberOfLines={1} className={cn("text-[13px] font-bold", tablet && "text-[15px]", text)}>{said(label)}</Text>
  </Pressable>;
}

/** The `extra` target of `LastSolveBar` (the next scramble or case): one more target of its touch bar. */
export const SolveAction = TouchAction;
