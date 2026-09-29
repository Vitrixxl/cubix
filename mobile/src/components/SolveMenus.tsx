import { useSetAtom } from "jotai";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { deletedSolveIdAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { useTheme } from "../theme";
import { AlgText } from "./AlgText";
import { IconComment, IconFlag, IconInfo, IconTrash } from "./icons";
import { Popover, type Anchor } from "./Popover";
import { Sheet } from "./Sheet";
import { Btn, FormError, Input, MiniBtn, mono, CellGroup } from "./ui";

/** Notes are capped like the server does; the field simply stops accepting text there. */
const COMMENT_MAX = 500;
/** What the actions need from a solve; history rows on the profile provide the same fields. */
export type SolveSummary = Pick<SolveDto, "id" | "time_ms" | "penalty" | "created_at" | "comment">;

interface Menu { solve: SolveSummary; anchor: Anchor }
const MenuContext = createContext<{
  open: (solve: SolveSummary, anchor: Anchor) => void;
  deleteTime: (id: number) => Promise<void>;
  togglePenalty: (solve: SolveSummary, penalty: Penalty) => Promise<void>;
  editComment: (solve: SolveSummary) => void;
  /** The "Solve" dialog of a time: large time, date, scramble and its actions, all centred. */
  openSolve: (solve: SolveSummary | SolveDto) => void;
  busy: boolean;
  /** Mutations in flight, as the rows should already look: `null` for a deletion. Lists apply it on top of their data. */
  optimistic: ReadonlyMap<number, SolveSummary | null>;
}>({ open: () => {}, deleteTime: async () => {}, togglePenalty: async () => {}, editComment: () => {}, openSolve: () => {}, busy: false, optimistic: new Map() });

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
  const [detail, setDetail] = useState<SolveSummary | SolveDto | null>(null);
  const openSolve = useCallback((solve: SolveSummary | SolveDto) => { setError(""); setDetail(solve); }, []);
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
  // The expected result shows at once; it is dropped in the same render as the refreshed data, or on failure.
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, SolveSummary | null>>(new Map());
  const expect = (id: number, value: SolveSummary | null) => setOptimistic(current => new Map(current).set(id, value));
  const settle = (id: number) => setOptimistic(current => { const next = new Map(current); next.delete(id); return next; });
  const deleteTime = useCallback((id: number) => run(async () => {
    expect(id, null);
    try { await api.deleteSolve(id); notifyDeleted(id); bumpStats(v => v + 1); setMenu(null); setDetail(current => current?.id === id ? null : current); }
    finally { settle(id); }
  }), [run, notifyDeleted, bumpStats]);
  const togglePenalty = useCallback((solve: SolveSummary, penalty: Penalty) => run(async () => {
    const next: Penalty = solve.penalty === penalty ? "none" : penalty;
    expect(solve.id, { ...solve, penalty: next });
    try {
      const updated = await api.setPenalty(solve.id, next);
      notifyUpdated(updated); bumpStats(v => v + 1);
      setMenu(current => current && current.solve.id === solve.id ? { ...current, solve: updated } : current);
      setDetail(current => current?.id === solve.id ? { ...current, ...updated } : current);
    } finally { settle(solve.id); }
  }), [run, notifyUpdated, bumpStats]);
  const editComment = useCallback((solve: SolveSummary) => { setMenu(null); setDetail(null); setError(""); setDraft(solve.comment ?? ""); setEditing(solve); }, []);
  const saveComment = (text: string | null) => run(async () => {
    if (!editing) return;
    const updated = await api.setComment(editing.id, text);
    notifyUpdated(updated); bumpStats(v => v + 1); setEditing(null);
  });
  const shown = detail && { ...detail, ...optimistic.get(detail.id) };
  const menuSolve = menu?.solve;
  return <MenuContext.Provider value={{ open, deleteTime, togglePenalty, editComment, openSolve, busy, optimistic }}>
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
        <MenuItem icon={<IconTrash size={15} color={t.danger} />} label={busy ? "Deleting…" : "Delete"} danger disabled={busy} onPress={() => void deleteTime(menuSolve.id)} />
      </>}
      {error ? <View style={{ padding: 8 }}><FormError>{error}</FormError></View> : null}
    </Popover>
    <Sheet open={detail !== null} title="Solve" onClose={() => setDetail(null)}>
      {shown && <View style={styles.detail}>
        <Text style={[mono(t, 44, "500"), styles.detailTime, shown.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(shown.time_ms, shown.penalty)}</Text>
        <Text style={[styles.centred, { color: t.muted, fontSize: 13 }]}>{fmtDate(shown.created_at)}</Text>
        {"scramble" in shown && shown.scramble ? <AlgText alg={shown.scramble} size={16} lineHeight={16 * 1.55} selectable style={styles.centred} /> : null}
        {shown.comment ? <Text selectable style={[styles.centred, { color: t.text, fontSize: 14, lineHeight: 20 }]}>{shown.comment}</Text> : null}
        <CellGroup style={styles.detailActions}>
          <Btn variant="ghost" label="+2" active={shown.penalty === "+2"} accessibilityLabel="+2 penalty" disabled={busy} onPress={() => void togglePenalty(shown, "+2")} />
          <Btn variant="ghost" label="DNF" active={shown.penalty === "dnf"} accessibilityLabel="Did not finish" disabled={busy} onPress={() => void togglePenalty(shown, "dnf")} />
          <Btn variant="ghost" icon={IconComment} label="Comment" disabled={busy} onPress={() => editComment(shown)} />
          <Btn variant="ghost" tone="danger" icon={IconTrash} label={busy ? "Deleting…" : "Delete"} disabled={busy} onPress={() => void deleteTime(shown.id)} />
        </CellGroup>
        {error ? <FormError style={{ justifyContent: "center" }}>{error}</FormError> : null}
      </View>}
    </Sheet>
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
  return <Pressable accessibilityRole="menuitem" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.item, { borderColor: t.line, backgroundColor: pressed ? t.hover : "transparent", opacity: disabled ? 0.45 : 1 }]}>
    <View style={styles.itemIcon}>{icon}</View><Text style={[styles.itemText, { color: danger ? t.danger : t.text }]}>{label}</Text>
  </Pressable>;
}

/** The shared solve actions, for lists that draw their own buttons. */
export const useSolveMenu = () => useContext(MenuContext);

/** Wrap a time row: a long press opens the time menu at the touch point. */
export function SolveRow({ solve, children, style }: { solve: SolveSummary; children: ReactNode; style?: object }) {
  const { open } = useContext(MenuContext);
  const t = useTheme();
  const [pressed, setPressed] = useState(false);
  return <Pressable delayLongPress={500} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
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
    <MiniBtn accessibilityRole="button" accessibilityLabel={solve.comment ? "Edit comment" : "Add comment"} icon={<IconComment size={13} color={solve.comment ? t.text : t.muted} />} disabled={busy} onPress={() => editComment(solve)} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Delete solve" danger icon={IconTrash} disabled={busy} onPress={() => void deleteTime(solve.id)} />
  </>;
}

/** `.times-actions` of a times row: +2, DNF, delete, then "i" opening the solve dialog (comment lives there). */
export function TimesRowActions({ solve }: { solve: SolveSummary | SolveDto }) {
  const { deleteTime, togglePenalty, openSolve, busy } = useContext(MenuContext);
  return <View style={styles.timesActions}>
    <MiniBtn accessibilityRole="button" accessibilityLabel="+2 penalty" accessibilityState={{ selected: solve.penalty === "+2" }} label="+2" on={solve.penalty === "+2"} disabled={busy} onPress={() => void togglePenalty(solve, "+2")} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Did not finish" accessibilityState={{ selected: solve.penalty === "dnf" }} label="DNF" on={solve.penalty === "dnf"} disabled={busy} onPress={() => void togglePenalty(solve, "dnf")} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Delete solve" danger icon={IconTrash} disabled={busy} onPress={() => void deleteTime(solve.id)} />
    <MiniBtn accessibilityRole="button" accessibilityLabel="Scramble and details" icon={IconInfo} onPress={() => openSolve(solve)} />
  </View>;
}

/**
 * `.solve-actions` under a time that was just recorded: +2 and DNF (mono), then comment and delete as
 * square icon controls, 30 px high and centred.
 */
export function LastSolveActions({ solve }: { solve: SolveSummary }) {
  const t = useTheme();
  const { deleteTime, togglePenalty, editComment, busy } = useContext(MenuContext);
  return <View style={styles.lastRow} accessibilityRole="toolbar">
    <Btn size={30} mono label="+2" active={solve.penalty === "+2"} accessibilityLabel="+2 penalty" disabled={busy} onPress={() => void togglePenalty(solve, "+2")} />
    <Btn size={30} mono label="DNF" active={solve.penalty === "dnf"} accessibilityLabel="Did not finish" disabled={busy} onPress={() => void togglePenalty(solve, "dnf")} />
    <Btn size={30} iconOnly icon={<IconComment size={15} color={solve.comment ? t.text : t.muted} />} accessibilityLabel={solve.comment ? "Edit comment" : "Add comment"} disabled={busy} onPress={() => editComment(solve)} />
    <DeleteControl disabled={busy} onPress={() => void deleteTime(solve.id)} />
  </View>;
}

/** `.control.icon-only.danger-hover`: the trash turns red while pressed. */
function DeleteControl({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  const [down, setDown] = useState(false);
  return <Btn size={30} iconOnly icon={<IconTrash size={15} color={down ? t.danger : t.muted} />} accessibilityLabel="Delete solve" disabled={disabled} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} onPress={onPress} />;
}

/** The small "i" button on a time, opening the solve dialog (date, scramble, penalties, comment, delete). */
export function SolveInfoButton({ solve }: { solve: SolveDto | SolveSummary }) {
  const { openSolve } = useContext(MenuContext);
  return <MiniBtn accessibilityLabel="Show solve details" icon={IconInfo} onPress={() => openSolve(solve)} />;
}

const styles = StyleSheet.create({
  menuHead: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 1 },
  // Rows of the menu, split by lines like the web's `.menu-option`s.
  item: { flexDirection: "row", alignItems: "center", gap: 12, height: 44, paddingHorizontal: 16, borderTopWidth: 1 },
  itemIcon: { width: 30, alignItems: "flex-start" },
  itemText: { fontSize: 14, fontWeight: "600" },
  dnf: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  lastRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  timesActions: { flexDirection: "row", alignItems: "center", gap: 1 },
  detail: { alignItems: "center", gap: 14, paddingTop: 4 },
  detailTime: { textAlign: "center", letterSpacing: -0.9, lineHeight: 52 },
  centred: { textAlign: "center", alignSelf: "stretch" },
  detailActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  commentInput: { minHeight: 96, textAlignVertical: "top", paddingTop: 10 },
  commentActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
