import { Lock, Trophy } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { ACHIEVEMENT_GROUPS, achievementPuzzle } from "../../../src/client/lib/achievements";
import type { AchievementDto, AchievementSummaryDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { usePreservedList } from "../hooks/usePreservedList";
import { useColors } from "../theme";
import { Bar, Choice, Empty, IconTile, Numeric } from "./layout";
import { ChoiceButton, PuzzleIcon } from "./PuzzlePicker";
import { locale, tr } from "../../../src/client/i18n";

/**
 * The web app's achievements: a group filter and All / Unlocked / Locked, then every group (a puzzle or "General")
 * with its heading and count, and a row per achievement: lock or trophy, title, progress or unlock date, what it
 * takes, a bar.
 */

/** "17 / 210" and a bar. */
export function AchievementTotal({ summary }: { summary: AchievementSummaryDto }) {
  return <View className="flex-row items-center gap-2.5" accessibilityLabel={tr("{0} of {1} achievements unlocked", { 0: summary.unlocked, 1: summary.total })}>
    <Numeric className="text-sm text-muted-foreground">{summary.unlocked} / {summary.total}</Numeric>
    <Bar ratio={summary.total ? summary.unlocked / summary.total : 0} className="w-16" />
  </View>;
}

const unlockedDate = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });

const AchievementRow = memo(function AchievementRow({ achievement: a }: { achievement: AchievementDto }) {
  const note = a.unlockedAt ? unlockedDate(a.unlockedAt) : tr(a.detail);
  return <View accessibilityLabel={`${tr(a.title)}: ${tr(a.description)}. ${a.unlocked ? tr("Unlocked") : tr("{0} percent", { 0: Math.round(a.ratio * 100) })}, ${note}`}
    className={cn("mb-2 flex-row items-start gap-3 rounded-xl border border-border bg-card p-3.5", !a.unlocked && "opacity-75")}>
    <IconTile icon={a.unlocked ? Trophy : Lock} tone={a.unlocked ? "primary" : "muted"} />
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-start justify-between gap-2.5">
        <Text className="shrink text-sm font-semibold">{tr(a.title)}</Text>
        <Numeric className="shrink text-right text-xs text-muted-foreground">{note}</Numeric>
      </View>
      <Text className="text-xs text-muted-foreground">{tr(a.description)}</Text>
      <Bar ratio={a.ratio} done={a.unlocked} className="mt-1" />
    </View>
  </View>;
});

type Filter = "all" | "unlocked" | "locked";
type Row = { key: string } & ({ kind: "group"; group: string; unlocked: number; total: number } | { kind: "item"; achievement: AchievementDto });

/** The whole list, filterable by group and completion; `initialGroup` preselects a puzzle. */
export function AchievementList({ summary, initialGroup, scrollKey }: { summary: AchievementSummaryDto; initialGroup?: string; scrollKey: string }) {
  const colors = useColors();
  const [group, setGroup] = useState(initialGroup && ACHIEVEMENT_GROUPS.includes(initialGroup) ? initialGroup : "all");
  const [filter, setFilter] = useState<Filter>("all");
  const groups = useMemo(() => [...new Set(summary.achievements.map(a => a.group))], [summary]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const name of groups) {
      if (group !== "all" && group !== name) continue;
      const members = summary.achievements.filter(a => a.group === name);
      const visible = members.filter(a => filter === "all" || a.unlocked === (filter === "unlocked"));
      if (!visible.length) continue;
      result.push({ key: `group:${name}`, kind: "group", group: name, unlocked: members.filter(a => a.unlocked).length, total: members.length });
      for (const achievement of visible) result.push({ key: achievement.id, kind: "item", achievement });
    }
    return result;
  }, [summary, groups, group, filter]);
  const key = `${scrollKey}:${group}:${filter}`;
  const scroll = usePreservedList<Row>(key);
  return <View className="min-h-0 flex-1 gap-2">
    <View className="flex-row flex-wrap items-center gap-2">
      <ChoiceButton label={tr("Achievement group")} value={group} options={[{ id: "all", label: tr("All puzzles") }, ...groups.map(name => ({ id: name, label: tr(name) }))]} onChange={setGroup} />
      <Choice label={tr("Completion")} value={filter} onChange={setFilter} options={[{ id: "all", label: tr("All") }, { id: "unlocked", label: tr("Unlocked") }, { id: "locked", label: tr("Locked") }]} />
    </View>
    <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
      className="flex-1" contentContainerClassName="pb-4"
      ListEmptyComponent={<Empty icon={Trophy}>{filter === "unlocked" ? tr("Nothing unlocked here yet. Keep practising!") : tr("Everything here is unlocked.")}</Empty>}
      renderItem={({ item: row }) => {
        if (row.kind === "item") return <AchievementRow achievement={row.achievement} />;
        const puzzle = achievementPuzzle(row.group);
        return <View className="min-h-10 flex-row items-center gap-3 pt-2.5 pb-1">
          {puzzle ? <PuzzleIcon puzzle={puzzle} size={18} color={colors.foreground} /> : <Icon as={Trophy} size={18} />}
          <Text className="flex-1 text-sm font-semibold">{tr(row.group)}</Text>
          <Numeric className="text-xs text-muted-foreground">{row.unlocked} / {row.total}</Numeric>
        </View>;
      }} />
  </View>;
}
