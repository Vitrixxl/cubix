import { useAtom } from "jotai";
import { Pressable, StyleSheet, Text } from "react-native";
import { learnedCaseIdsAtom } from "../state";
import { useTheme } from "../theme";
import { IconCheck } from "./icons";

export function LearnedToggle({ caseId }: { caseId: string }) {
  const t = useTheme();
  const [learnedIds, setLearnedIds] = useAtom(learnedCaseIdsAtom);
  const learned = learnedIds.includes(caseId);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: learned }} accessibilityLabel={`${caseId} learned`}
    onPress={() => setLearnedIds(previous => previous.includes(caseId) ? previous.filter(id => id !== caseId) : [...previous, caseId])}
    style={({ pressed }) => [styles.toggle, { backgroundColor: learned ? (pressed ? t.goodSoftStrong : t.goodSoft) : pressed ? t.surface3 : t.hover }]}>
    {learned && <IconCheck size={13} color={t.good} />}
    <Text style={[styles.text, { color: learned ? t.good : t.readableMuted }]}>{learned ? "Learned" : "To learn"}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 80, minHeight: 30, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: "600" },
});
