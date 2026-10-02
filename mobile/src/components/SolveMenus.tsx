import * as Haptics from "expo-haptics";
import { useSetAtom } from "jotai";
import { Ban, Info, MessageSquare, Plus, Trash2, type LucideIcon } from "lucide-react-native";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtSolve } from "../../../src/client/lib/format";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { deletedSolveIdAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { Alg, Numeric, TouchAction, TouchBar } from "./layout";
import { Sheet, SheetInput } from "./Sheet";

/** Notes are capped like the server does; the field simply stops accepting text there. */
const COMMENT_MAX = 500;
/** What the actions need from a solve; history rows on the profile provide the same fields. */
export type SolveSummary = Pick<SolveDto, "id" | "time_ms" | "penalty" | "created_at" | "comment"> & { scramble?: string | null };

const MenuContext = createContext<{
  setPenalty: (solve: SolveSummary, penalty: Penalty) => Promise<void>;
  togglePenalty: (solve: SolveSummary, penalty: Penalty) => Promise<void>;
  deleteTime: (id: number) => Promise<void>;
  editComment: (solve: SolveSummary) => void;
  /** The solve sheet: the time, its date, scramble and comment, and its actions. */
  openSolve: (solve: SolveSummary) => void;
  busy: boolean;
  /** Mutations in flight, as the rows should already look: `null` for a deletion. Lists apply it on top of their data. */
  optimistic: ReadonlyMap<number, SolveSummary | null>;
}>({ setPenalty: async () => {}, togglePenalty: async () => {}, deleteTime: async () => {}, editComment: () => {}, openSolve: () => {}, busy: false, optimistic: new Map() });

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Shared solve actions: the touch bar under a fresh time, the time lists, the long-press menu and the solve sheet. */
export function SolveMenuProvider({ children }: { children: ReactNode }) {
  const notifyDeleted = useSetAtom(deletedSolveIdAtom);
  const notifyUpdated = useSetAtom(updatedSolveAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SolveSummary | null>(null);
  const [draft, setDraft] = useState("");
  const [detail, setDetail] = useState<SolveSummary | null>(null);
  // One mutation at a time: a double tap must not delete two solves or race two penalties.
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }, []);
  // The expected result shows at once; it is dropped in the same render as the refreshed data, or on failure.
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, SolveSummary | null>>(new Map());
  const expect = (id: number, value: SolveSummary | null) => setOptimistic(current => new Map(current).set(id, value));
  const settle = (id: number) => setOptimistic(current => { const next = new Map(current); next.delete(id); return next; });
  const deleteTime = useCallback((id: number) => run(async () => {
    expect(id, null);
    try { await api.deleteSolve(id); notifyDeleted(id); bumpStats(v => v + 1); setDetail(current => current?.id === id ? null : current); }
    finally { settle(id); }
  }), [run, notifyDeleted, bumpStats]);
  const setPenalty = useCallback((solve: SolveSummary, next: Penalty) => run(async () => {
    if (solve.penalty === next) return;
    expect(solve.id, { ...solve, penalty: next });
    try {
      const updated = await api.setPenalty(solve.id, next);
      notifyUpdated(updated); bumpStats(v => v + 1);
      setDetail(current => current?.id === solve.id ? { ...current, ...updated } : current);
    } finally { settle(solve.id); }
  }), [run, notifyUpdated, bumpStats]);
  const togglePenalty = useCallback((solve: SolveSummary, penalty: Penalty) => setPenalty(solve, solve.penalty === penalty ? "none" : penalty), [setPenalty]);
  const editComment = useCallback((solve: SolveSummary) => { setDetail(null); setError(""); setDraft(solve.comment ?? ""); setEditing(solve); }, []);
  const openSolve = useCallback((solve: SolveSummary) => { setError(""); setDetail(solve); }, []);
  const saveComment = (text: string | null) => run(async () => {
    if (!editing) return;
    const updated = await api.setComment(editing.id, text);
    notifyUpdated(updated); bumpStats(v => v + 1); setEditing(null);
  });
  const shown = detail && { ...detail, ...optimistic.get(detail.id) };
  return <MenuContext.Provider value={{ setPenalty, togglePenalty, deleteTime, editComment, openSolve, busy, optimistic }}>
    {children}
    <Sheet open={detail !== null} onClose={() => setDetail(null)} title="Solve" description={shown ? fmtDate(shown.created_at) : undefined}>
      {shown && <View className="gap-4">
        <Numeric className={cn("text-center text-5xl font-semibold tracking-tight", shown.penalty === "dnf" && "text-destructive", shown.penalty === "+2" && "text-warning")}>{fmtSolve(shown.time_ms, shown.penalty)}</Numeric>
        {shown.scramble ? <View className="items-center"><Alg text={shown.scramble} size={16} selectable className="justify-center" /></View> : null}
        {shown.comment ? <Text selectable className="text-center text-sm">{shown.comment}</Text> : null}
        <TouchBar className="rounded-xl bg-muted/40 p-1">
          <TouchAction icon={Plus} label="+2" pressed={shown.penalty === "+2"} tone="warning" disabled={busy} onPress={() => void togglePenalty(shown, "+2")} accessibilityLabel="+2 penalty" />
          <TouchAction icon={Ban} label="DNF" pressed={shown.penalty === "dnf"} tone="bad" disabled={busy} onPress={() => void togglePenalty(shown, "dnf")} accessibilityLabel="Did not finish" />
          <TouchAction icon={MessageSquare} label="Comment" pressed={!!shown.comment} tone="accent" disabled={busy} onPress={() => editComment(shown)} />
          <TouchAction icon={Trash2} label="Delete" disabled={busy} onPress={() => void deleteTime(shown.id)} accessibilityLabel="Delete solve" />
        </TouchBar>
        {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}
      </View>}
    </Sheet>
    <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Comment" description={editing ? `${fmtSolve(editing.time_ms, editing.penalty)} · ${fmtDate(editing.created_at)}` : undefined}>
      {editing && <View className="gap-3">
        <SheetInput accessibilityLabel="Solve comment" placeholder="What happened on this solve?" value={draft} onChangeText={setDraft} multiline autoFocus maxLength={COMMENT_MAX} editable={!busy}
          className="min-h-24 py-2.5" textAlignVertical="top" />
        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        <View className="flex-row items-center gap-2">
          {editing.comment ? <Button variant="ghost" disabled={busy} onPress={() => void saveComment(null)}><Text>Remove</Text></Button> : null}
          <View className="flex-1" />
          <Button variant="ghost" disabled={busy} onPress={() => setEditing(null)}><Text>Cancel</Text></Button>
          <Button disabled={busy} onPress={() => void saveComment(draft)}><Text>{busy ? "Saving…" : "Save"}</Text></Button>
        </View>
      </View>}
    </Sheet>
  </MenuContext.Provider>;
}

/** The shared solve actions, for screens that draw their own buttons. */
export const useSolveMenu = () => useContext(MenuContext);

/**
 * A time that opens its sheet on a tap and, held, the menu of its actions at the finger: No penalty / +2 / DNF,
 * Comment, Details, Delete (the web's right-click menu).
 */
export function SolveMenu({ solve, children, className, rootClassName, onPress, ...props }: { solve: SolveSummary; children: ReactNode; className?: string; /** Layout of the wrapper around the time (in a row of equal cells). */ rootClassName?: string } & Omit<PressableProps, "children">) {
  const { setPenalty, deleteTime, editComment, openSolve, optimistic } = useContext(MenuContext);
  const insets = useSafeAreaInsets();
  const current = { ...solve, ...optimistic.get(solve.id) };
  return <ContextMenu relativeTo="longPress" className={rootClassName} onOpenChange={open => { if (open) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}>
    <ContextMenuTrigger delayLongPress={350} onPress={onPress ?? (() => openSolve(current))} className={className} {...props}>{children}</ContextMenuTrigger>
    <ContextMenuContent className="min-w-60" insets={{ top: insets.top + 8, bottom: insets.bottom + 8, left: 12, right: 12 }}>
      <ContextMenuLabel><Numeric className={cn("text-base font-semibold", current.penalty === "dnf" && "text-destructive")}>{fmtSolve(current.time_ms, current.penalty)}</Numeric></ContextMenuLabel>
      <ContextMenuRadioGroup value={current.penalty} onValueChange={value => void setPenalty(current, value as Penalty)}>
        <ContextMenuRadioItem value="none" className="min-h-11"><Text>No penalty</Text></ContextMenuRadioItem>
        <ContextMenuRadioItem value="+2" className="min-h-11"><Text>+2</Text></ContextMenuRadioItem>
        <ContextMenuRadioItem value="dnf" className="min-h-11"><Text>DNF</Text></ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuItem className="min-h-11 gap-3" onPress={() => editComment(current)}><Icon as={MessageSquare} className="text-muted-foreground" /><Text>{current.comment ? "Edit comment…" : "Comment…"}</Text></ContextMenuItem>
      <ContextMenuItem className="min-h-11 gap-3" onPress={() => openSolve(current)}><Icon as={Info} className="text-muted-foreground" /><Text>Details</Text></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="min-h-11 gap-3" variant="destructive" onPress={() => void deleteTime(current.id)}><Icon as={Trash2} className="text-destructive" /><Text className="text-destructive">Delete</Text></ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

/**
 * The last solve's actions under the time: +2, DNF, a note and delete, shown once there is a solve to act on; `extra`
 * (the next case) stays on the right at all times.
 */
export function LastSolveBar({ solve, extra }: { solve: SolveSummary | null; extra?: ReactNode }) {
  const { togglePenalty, editComment, deleteTime, busy, optimistic } = useContext(MenuContext);
  const pending = solve ? optimistic.get(solve.id) : undefined;
  const last = solve && pending !== null ? { ...solve, ...pending } : null;
  return <View className={cn("min-h-12 flex-row items-center gap-2", extra ? "justify-between" : "justify-center")}>
    <View className="flex-row items-center gap-1" style={last ? undefined : { opacity: 0 }} pointerEvents={last ? "auto" : "none"}
      accessibilityElementsHidden={!last} importantForAccessibility={last ? "auto" : "no-hide-descendants"}>
      <SolveAction icon={Plus} label="+2" accessibilityLabel="+2 penalty" on={last?.penalty === "+2"} tone="warning" disabled={busy} onPress={() => last && void togglePenalty(last, "+2")} />
      <SolveAction icon={Ban} label="DNF" accessibilityLabel="Did not finish" on={last?.penalty === "dnf"} tone="bad" disabled={busy} onPress={() => last && void togglePenalty(last, "dnf")} />
      <SolveAction icon={MessageSquare} label="Note" accessibilityLabel="Comment" on={!!last?.comment} tone="accent" disabled={busy} onPress={() => last && editComment(last)} />
      <SolveAction icon={Trash2} label="" accessibilityLabel="Delete solve" disabled={busy} onPress={() => last && void deleteTime(last.id)} />
    </View>
    {extra}
  </View>;
}

const ON: Record<"warning" | "bad" | "accent", string> = { warning: "bg-warning/15", bad: "bg-destructive/15", accent: "bg-primary/15" };
const ON_TEXT: Record<"warning" | "bad" | "accent", string> = { warning: "text-warning", bad: "text-destructive", accent: "text-primary" };
/** One compact action of a solve: its icon and a short word, tinted while it applies. */
export function SolveAction({ icon, label, onPress, on, tone = "accent", disabled, accessibilityLabel }: {
  icon: LucideIcon; label: string; onPress: () => void; on?: boolean; tone?: "warning" | "bad" | "accent"; disabled?: boolean; accessibilityLabel?: string;
}) {
  const text = on ? ON_TEXT[tone] : "text-muted-foreground";
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={onPress}
    className={cn("h-11 min-w-11 flex-row items-center justify-center gap-1.5 rounded-xl px-3 active:bg-muted", on && ON[tone], disabled && "opacity-40")}>
    <Icon as={icon} size={17} className={text} />
    {label ? <Text className={cn("text-[13px] font-medium", text)}>{label}</Text> : null}
  </Pressable>;
}
