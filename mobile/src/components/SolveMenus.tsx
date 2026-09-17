import { useSetAtom } from "jotai";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { contextLabel } from "../../../src/shared/puzzles";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { deletedSolveIdAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { useTheme } from "../theme";
import { AlgText } from "./AlgText";
import { IconClose, IconComment, IconFlag, IconInfo } from "./icons";
import { Popover, useAnchor, type Anchor } from "./Popover";
import { Sheet } from "./Sheet";
import { Btn, FormError, Input, MiniBtn, mono } from "./ui";

/** Notes are capped like the server does; the field simply stops accepting text there. */
export const COMMENT_MAX = 500;
/** What the actions need from a solve; history rows on the profile provide the same fields. */
export type SolveSummary = Pick<SolveDto, "id" | "time_ms" | "penalty" | "created_at" | "comment">;

interface Menu { solve: SolveSummary; anchor: Anchor }
const MenuContext = createContext<{
  open: (solve: SolveSummary, anchor: Anchor) => void;
  deleteTime: (id: number) => Promise<void>;
  togglePenalty: (solve: SolveSummary, penalty: Penalty) => Promise<void>;
  editComment: (solve: SolveSummary) => void;
  busy: boolean;
}>({ open: () => {}, deleteTime: async () => {}, togglePenalty: async () => {}, editComment: () => {}, busy: false });

/** Shared solve actions: the buttons under a fresh time, the list rows and the long-press menu. */
export function SolveMenuProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const notifyDeleted = useSetAtom(deletedSolveIdAtom);
  const notifyUpdated = useSetAtom(updatedSolveAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SolveSummary | null>(null);
  const [draft, setDraft] = useState("");
  const open = useCallback((solve: SolveSummary, anchor: Anchor) => { setError(""); setMenu({ solve, anchor }); }, []);
  // One mutation at a time: a double tap must not delete two solves or race two penalties.
  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }, []);
  const deleteTime = useCallback((id: number) => run(async () => {
    await api.deleteSolve(id); notifyDeleted(id); bumpStats(v => v + 1); setMenu(null);
  }), [run, notifyDeleted, bumpStats]);
  const togglePenalty = useCallback((solve: SolveSummary, penalty: Penalty) => run(async () => {
    const updated = await api.setPenalty(solve.id, solve.penalty === penalty ? "none" : penalty);
    notifyUpdated(updated); bumpStats(v => v + 1);
    setMenu(current => current && current.solve.id === solve.id ? { ...current, solve: updated } : current);
  }), [run, notifyUpdated, bumpStats]);
  const editComment = useCallback((solve: SolveSummary) => { setMenu(null); setError(""); setDraft(solve.comment ?? ""); setEditing(solve); }, []);
  const saveComment = (text: string | null) => run(async () => {
    if (!editing) return;
    const updated = await api.setComment(editing.id, text);
    notifyUpdated(updated); bumpStats(v => v + 1); setEditing(null);
  });
  const menuSolve = menu?.solve;
  return <MenuContext.Provider value={{ open, deleteTime, togglePenalty, editComment, busy }}>
    {children}
    <Popover anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} width={230}>
      {menuSolve && <View style={styles.menuHead}>
        <Text style={[mono(t, 16, "600"), menuSolve.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(menuSolve.time_ms, menuSolve.penalty)}</Text>
        <Text style={{ color: t.readableMuted, fontSize: 12 }}>{fmtDate(menuSolve.created_at)}</Text>
        {menuSolve.comment ? <Text style={{ color: t.text, fontSize: 13, marginTop: 4 }}>{menuSolve.comment}</Text> : null}
      </View>}
      {menuSolve && <>
        <MenuItem icon={<IconFlag size={15} color={menuSolve.penalty === "+2" ? t.warning : t.readableMuted} />} label={menuSolve.penalty === "+2" ? "Remove +2" : "+2"} disabled={busy} onPress={() => void togglePenalty(menuSolve, "+2")} />
        <MenuItem icon={<Text style={[styles.dnf, { color: menuSolve.penalty === "dnf" ? t.warning : t.readableMuted }]}>DNF</Text>} label={menuSolve.penalty === "dnf" ? "Remove DNF" : "DNF"} disabled={busy} onPress={() => void togglePenalty(menuSolve, "dnf")} />
        <MenuItem icon={<IconComment size={15} color={t.readableMuted} />} label={menuSolve.comment ? "Edit comment" : "Add comment"} disabled={busy} onPress={() => editComment(menuSolve)} />
        <MenuItem icon={<IconClose size={15} color={t.danger} />} label={busy ? "Deleting…" : "Delete"} danger disabled={busy} onPress={() => void deleteTime(menuSolve.id)} />
      </>}
      {error ? <View style={{ padding: 8 }}><FormError>{error}</FormError></View> : null}
    </Popover>
    <Sheet open={editing !== null} title="Comment" onClose={() => setEditing(null)}>
      {editing && <View style={{ gap: 12 }}>
        <Text style={{ color: t.readableMuted, fontSize: 13 }}>{fmtSolve(editing.time_ms, editing.penalty)} · {fmtDate(editing.created_at)}</Text>
        <Input accessibilityLabel="Solve comment" placeholder="What happened on this solve?" value={draft} onChangeText={setDraft} multiline autoFocus maxLength={COMMENT_MAX} editable={!busy} style={styles.commentInput} />
        {error ? <FormError>{error}</FormError> : null}
        <View style={styles.commentActions}>
          {editing.comment ? <Btn variant="ghost" label="Remove" disabled={busy} onPress={() => void saveComment(null)} /> : <View />}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn variant="ghost" label="Cancel" disabled={busy} onPress={() => setEditing(null)} />
            <Btn variant="primary" label={busy ? "Saving…" : "Save"} disabled={busy} onPress={() => void saveComment(draft)} />
          </View>
        </View>
      </View>}
    </Sheet>
  </MenuContext.Provider>;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function MenuItem({ icon, label, danger, disabled, onPress }: { icon: ReactNode; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable accessibilityRole="menuitem" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.accentSoft : "transparent", opacity: disabled ? 0.45 : 1 }]}>
    <View style={styles.itemIcon}>{icon}</View><Text style={[styles.itemText, { color: danger ? t.danger : t.text }]}>{label}</Text>
  </Pressable>;
}

/** The shared solve actions, for lists that draw their own buttons. */
export const useSolveMenu = () => useContext(MenuContext);

/** Wrap a time row: a long press opens the time menu at the touch point. */
export function SolveRow({ solve, children, style, disabled }: { solve: SolveSummary; children: ReactNode; style?: object; disabled?: boolean }) {
  const { open } = useContext(MenuContext);
  const t = useTheme();
  const [pressed, setPressed] = useState(false);
  return <Pressable disabled={disabled} delayLongPress={500} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    onLongPress={event => open(solve, { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, width: 0, height: 0 })}
    style={[style, pressed && { backgroundColor: t.hover }]}>{children}</Pressable>;
}

/** Penalties, comment and deletion in the practice time list. */
export function SolveActionButtons({ solve }: { solve: SolveSummary }) {
  const t = useTheme();
  const { deleteTime, togglePenalty, editComment, busy } = useContext(MenuContext);
  return <>
    <MiniBtn accessibilityRole="button" accessibilityLabel="+2 penalty" accessibilityState={{ selected: solve.penalty === "+2" }} label="+2" on={solve.penalty === "+2"} disabled={busy} onPress={() => void togglePenalty(solve, "+2")} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Did not finish" accessibilityState={{ selected: solve.penalty === "dnf" }} label="DNF" on={solve.penalty === "dnf"} disabled={busy} onPress={() => void togglePenalty(solve, "dnf")} />
    <MiniBtn accessibilityRole="button" accessibilityLabel={solve.comment ? "Edit comment" : "Add comment"} icon={<IconComment size={15} color={solve.comment ? t.accent : t.readableMuted} />} disabled={busy} onPress={() => editComment(solve)} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Delete solve" danger icon={<IconClose size={15} color={t.danger} />} disabled={busy} onPress={() => void deleteTime(solve.id)} />
  </>;
}

/**
 * The four buttons under a time that was just recorded: delete, DNF, +2 (the flag) and comment.
 * Each is a flat square so the row stays readable at a glance on a phone.
 */
export function LastSolveActions({ solve, compact }: { solve: SolveSummary; compact?: boolean }) {
  const t = useTheme();
  const { deleteTime, togglePenalty, editComment, busy } = useContext(MenuContext);
  const size = compact ? 32 : 38;
  return <View style={styles.lastRow} accessibilityRole="toolbar">
    <ActionButton size={size} label="Delete solve" danger disabled={busy} onPress={() => void deleteTime(solve.id)}><IconClose size={16} color={t.danger} /></ActionButton>
    <ActionButton size={size} label="Did not finish" on={solve.penalty === "dnf"} disabled={busy} onPress={() => void togglePenalty(solve, "dnf")}><Text style={[styles.dnf, { color: solve.penalty === "dnf" ? t.warning : t.text2 }]}>DNF</Text></ActionButton>
    <ActionButton size={size} label="+2 penalty" on={solve.penalty === "+2"} disabled={busy} onPress={() => void togglePenalty(solve, "+2")}><IconFlag size={16} color={solve.penalty === "+2" ? t.warning : t.text2} /><Text style={[styles.plusTwo, { color: solve.penalty === "+2" ? t.warning : t.text2 }]}>+2</Text></ActionButton>
    <ActionButton size={size} label={solve.comment ? "Edit comment" : "Add comment"} on={!!solve.comment} disabled={busy} onPress={() => editComment(solve)}><IconComment size={16} color={solve.comment ? t.accent : t.text2} /></ActionButton>
  </View>;
}

function ActionButton({ size, label, on, danger, disabled, onPress, children }: { size: number; label: string; on?: boolean; danger?: boolean; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on, disabled: !!disabled }} disabled={disabled} hitSlop={4} onPress={onPress}
    style={({ pressed }) => [styles.action, { minWidth: size, height: size, backgroundColor: pressed ? (danger ? t.dangerSoft : t.hover) : on ? t.accentSoft : "transparent", opacity: disabled ? 0.45 : 1 }]}>
    {children}
  </Pressable>;
}

/** The small "i" button on a time, opening its date, scramble and comment. */
export function SolveInfoButton({ solve }: { solve: SolveDto }) {
  const t = useTheme();
  const { ref, anchor, open, close } = useAnchor();
  const date = useMemo(() => fmtDate(solve.created_at), [solve.created_at]);
  return <>
    <View ref={ref} collapsable={false}><MiniBtn accessibilityLabel="Show solve details" icon={<IconInfo size={15} color={t.readableMuted} />} onPress={open} /></View>
    <Popover anchor={anchor} onClose={close} width={280} alignRight gap={8}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 6, gap: 2 }}>
        <Text style={[styles.label, { color: t.readableMuted }]}>{contextLabel(solve)}</Text>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: "500" }}>{date}</Text>
        <Text style={[styles.label, { color: t.readableMuted, marginTop: 8 }]}>Scramble</Text>
        {solve.scramble ? <AlgText alg={solve.scramble} size={13} selectable /> : <Text style={{ color: t.text, fontSize: 13 }}>No scramble recorded.</Text>}
        {solve.comment ? <>
          <Text style={[styles.label, { color: t.readableMuted, marginTop: 8 }]}>Comment</Text>
          <Text style={{ color: t.text, fontSize: 13 }} selectable>{solve.comment}</Text>
        </> : null}
      </View>
    </Popover>
  </>;
}

const styles = StyleSheet.create({
  menuHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  itemIcon: { width: 30, alignItems: "flex-start" },
  itemText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase" },
  dnf: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  plusTwo: { fontSize: 12, fontWeight: "700", marginLeft: 3 },
  lastRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 12 },
  commentInput: { minHeight: 96, textAlignVertical: "top", paddingTop: 10 },
  commentActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
