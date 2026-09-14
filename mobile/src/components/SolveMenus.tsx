import { useAtomValue, useSetAtom } from "jotai";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { contextLabel } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { deletedSolveIdAtom, routeAtom, statsVersionAtom, userAtom } from "../state";
import { useTheme } from "../theme";
import { AlgText } from "./AlgText";
import { IconClose, IconInfo, IconMessage } from "./icons";
import { Popover, useAnchor, type Anchor } from "./Popover";
import { FormError, MiniBtn } from "./ui";

interface Menu { id: number; anchor: Anchor }
const MenuContext = createContext<(id: number, anchor: Anchor) => void>(() => {});

/** One menu for all times: any solve row long-pressed opens Share / Delete, exactly like the web context menu. */
export function SolveMenuProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const user = useAtomValue(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const notifyDeleted = useSetAtom(deletedSolveIdAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const open = useCallback((id: number, anchor: Anchor) => { setError(""); setMenu({ id, anchor }); }, []);
  const deleteTime = async () => {
    if (!menu || deleting) return;
    setDeleting(true); setError("");
    try { await api.deleteSolve(menu.id); notifyDeleted(menu.id); bumpStats(v => v + 1); setMenu(null); }
    catch (e) { setError((e as Error).message); }
    finally { setDeleting(false); }
  };
  const canShare = !!user && !user.isGuest;
  return <MenuContext.Provider value={open}>
    {children}
    <Popover anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} width={180}>
      {canShare && <MenuItem icon={<IconMessage size={15} color={t.accent} />} label="Share" disabled={deleting} onPress={() => { const id = menu!.id; setMenu(null); setRoute({ page: "messages", solveId: id }); }} />}
      <MenuItem icon={<IconClose size={15} color={t.danger} />} label={deleting ? "Deleting…" : "Delete"} danger disabled={deleting} onPress={() => void deleteTime()} />
      {error ? <View style={{ padding: 8 }}><FormError>{error}</FormError></View> : null}
    </Popover>
  </MenuContext.Provider>;
}

function MenuItem({ icon, label, danger, disabled, onPress }: { icon: ReactNode; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable accessibilityRole="menuitem" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.accentSoft : "transparent", opacity: disabled ? 0.45 : 1 }]}>
    {icon}<Text style={[styles.itemText, { color: danger ? t.danger : t.text }]}>{label}</Text>
  </Pressable>;
}

/** Wrap a time row: a long press opens the time menu at the touch point. */
export function SolveRow({ solveId, children, style, disabled }: { solveId: number; children: ReactNode; style?: object; disabled?: boolean }) {
  const open = useContext(MenuContext);
  const t = useTheme();
  const [pressed, setPressed] = useState(false);
  return <Pressable disabled={disabled} delayLongPress={500} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    onLongPress={event => open(solveId, { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, width: 0, height: 0 })}
    style={[style, pressed && { backgroundColor: t.hover }]}>{children}</Pressable>;
}

/** The small "i" button on a time, opening its date and scramble. */
export function SolveInfoButton({ solve }: { solve: SolveDto }) {
  const t = useTheme();
  const { ref, anchor, open, close } = useAnchor();
  const date = useMemo(() => new Date(solve.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), [solve.created_at]);
  return <>
    <View ref={ref} collapsable={false}><MiniBtn accessibilityLabel="Show solve details" icon={<IconInfo size={15} color={t.readableMuted} />} onPress={open} /></View>
    <Popover anchor={anchor} onClose={close} width={280} alignRight gap={8}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 6, gap: 2 }}>
        <Text style={[styles.label, { color: t.readableMuted }]}>{contextLabel(solve)}</Text>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: "500" }}>{date}</Text>
        <Text style={[styles.label, { color: t.readableMuted, marginTop: 8 }]}>Scramble</Text>
        {solve.scramble ? <AlgText alg={solve.scramble} size={13} selectable /> : <Text style={{ color: t.text, fontSize: 13 }}>No scramble recorded.</Text>}
      </View>
    </Popover>
  </>;
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  itemText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase" },
});
