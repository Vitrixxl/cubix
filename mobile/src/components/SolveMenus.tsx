import * as Haptics from "expo-haptics";
import { useAtomValue, useSetAtom } from "jotai";
import { Ban, Info, MessageSquare, Plus, Share2, Trash2 } from "lucide-react-native";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Share, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtSolve } from "../../../src/client/lib/format";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { API_ORIGIN, api, local } from "../api";
import { deletedSolveIdAtom, signedInAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { Confirmations, ask } from "./Confirm";
import { Numeric, TouchAction, TouchBar } from "./layout";
import { Sheet, SheetInput } from "./Sheet";
import { SolveDetail, type ViewedSolve } from "./SolveDetail";
import { tr } from "../../../src/client/i18n";

/** Notes are capped like the server does; the field simply stops accepting text there. */
const COMMENT_MAX = 500;
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
  const [error, setError] = useState("");
  // The solve sheet opens its comment as a field, focused, from a Comment action.
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [detail, setDetail] = useState<ViewedSolve | null>(null);
  const signedIn = useAtomValue(signedInAtom);
  // One mutation at a time: a double tap must not delete two solves or race two penalties. True once done.
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true); setError("");
    try { await action(); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { pending.current = false; setBusy(false); }
  }, []);
  // The expected result shows at once; it is dropped in the same render as the refreshed data, or on failure.
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, SolveSummary | null>>(new Map());
  const expect = (id: number, value: SolveSummary | null) => setOptimistic(current => new Map(current).set(id, value));
  const settle = (id: number) => setOptimistic(current => { const next = new Map(current); next.delete(id); return next; });
  const deleteTime = useCallback(async (id: number) => {
    if (!(await ask({ title: tr("Delete this solve?"), text: tr("It goes from your times and your statistics, on every device."), action: tr("Delete") }))) return;
    await run(async () => {
      expect(id, null);
      try { await api.deleteSolve(id); notifyDeleted(id); bumpStats(v => v + 1); setDetail(current => current?.id === id ? null : current); }
      finally { settle(id); }
    });
  }, [run, notifyDeleted, bumpStats]);
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
  // Lists hold a few fields of a solve; the sheet reads the rest (its scramble, solution and puzzle) from the device.
  const openSolve = useCallback((solve: SolveSummary, comment = false) => {
    setError(""); setCommenting(comment); setDraft(solve.comment ?? "");
    setDetail(current => current?.id === solve.id ? current : { ...solve, ...local.read.solve(solve.id) });
  }, []);
  const editComment = useCallback((solve: SolveSummary) => openSolve(solve, true), [openSolve]);
  // Leaving the field or its return key saves it; an empty one takes the comment off.
  const saveComment = () => {
    setCommenting(false);
    if (!detail || draft.trim() === (detail.comment ?? "")) return;
    void run(async () => {
      const updated = await api.setComment(detail.id, draft.trim() || null);
      notifyUpdated(updated); bumpStats(v => v + 1);
      setDetail(current => current?.id === updated.id ? { ...current, ...updated } : current);
    });
  };
  const saveSolution = (solution: string | null) => run(async () => {
    if (!detail) return;
    const updated = await api.setSolution(detail.id, solution);
    notifyUpdated(updated);
    setDetail(current => current?.id === updated.id ? { ...current, ...updated } : current);
  });
  const share = (solve: SolveSummary) => run(async () => {
    const url = API_ORIGIN + "/solve/" + await api.shareSolve(solve.id);
    await Share.share({ message: url, title: fmtSolve(solve.time_ms, solve.penalty) });
  });
  const shown = detail && { ...detail, ...optimistic.get(detail.id) };
  return <MenuContext.Provider value={{ togglePenalty, deleteTime, editComment, openSolve, busy, optimistic }}>
    {children}
    <Sheet open={detail !== null} onClose={() => { if (commenting) saveComment(); setDetail(null); }} title={tr("Solve")} hideTitle scroll contentPanning={false}>
      {shown && <SolveDetail key={shown.id} solve={shown} onSave={saveSolution} comment={commenting ? (
        <SheetInput accessibilityLabel={tr("Solve comment")} placeholder={tr("What happened on this solve?")} value={draft} onChangeText={setDraft} multiline autoFocus maxLength={COMMENT_MAX}
          submitBehavior="blurAndSubmit" onBlur={saveComment} className="min-h-24 py-2.5" textAlignVertical="top" />
      ) : undefined}>
        {/* The same actions as under the timer: the penalties, the comment, the link, then delete. */}
        <TouchBar className="rounded-xl bg-muted/40 p-1">
          <TouchAction icon={Plus} label="+2" pressed={shown.penalty === "+2"} tone="warning" disabled={busy} onPress={() => void togglePenalty(shown, "+2")} accessibilityLabel={tr("+2 penalty")} />
          <TouchAction icon={Ban} label={tr("DNF")} pressed={shown.penalty === "dnf"} tone="bad" disabled={busy} onPress={() => void togglePenalty(shown, "dnf")} accessibilityLabel={tr("Did not finish")} />
          <TouchAction icon={MessageSquare} label={tr("Comment")} pressed={!!shown.comment} tone="accent" disabled={busy} onPress={() => setCommenting(true)} />
          {signedIn && <TouchAction icon={Share2} label={tr("Share")} disabled={busy} onPress={() => void share(shown)} accessibilityLabel={tr("Share a link to this solve")} />}
          <TouchAction icon={Trash2} label={tr("Delete")} disabled={busy} onPress={() => void deleteTime(shown.id)} accessibilityLabel={tr("Delete solve")} />
        </TouchBar>
      </SolveDetail>}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </Sheet>
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
export function LastSolveBar({ solve, extra }: { solve: SolveSummary | null; extra?: ReactNode }) {
  const { togglePenalty, editComment, deleteTime, busy, optimistic } = useContext(MenuContext);
  const pending = solve ? optimistic.get(solve.id) : undefined;
  const last = solve && pending !== null ? { ...solve, ...pending } : null;
  const off = !last || busy;
  return <TouchBar accessibilityLabel={tr("Last solve")}>
    <TouchAction icon={Plus} label="+2" accessibilityLabel={tr("+2 penalty")} pressed={last?.penalty === "+2"} tone="warning" disabled={off} onPress={() => last && void togglePenalty(last, "+2")} />
    <TouchAction icon={Ban} label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={last?.penalty === "dnf"} tone="bad" disabled={off} onPress={() => last && void togglePenalty(last, "dnf")} />
    <TouchAction icon={MessageSquare} label={tr("Comment")} pressed={!!last?.comment} tone="accent" disabled={off} onPress={() => last && editComment(last)} />
    <TouchAction icon={Trash2} label={tr("Delete")} accessibilityLabel={tr("Delete solve")} disabled={off} onPress={() => last && void deleteTime(last.id)} />
    {extra}
  </TouchBar>;
}

/** The `extra` target of `LastSolveBar` (the next scramble or case): one more target of its touch bar. */
export const SolveAction = TouchAction;
