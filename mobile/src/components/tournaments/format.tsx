import { useAtomValue, useSetAtom } from "jotai";
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { MATCH_STATUS, STATUS_TEXT, roundName, type MatchStatus, type Person, type TournamentStatus } from "../../../../src/client/lib/community";
import type { EventId } from "../../../../src/shared/puzzles";
import { useColors } from "../../theme";
import { openUrl } from "../../lib/social";
import { goBackAtom, previousRouteAtom } from "../../state";
import { BackButton, Numeric } from "../layout";
import { PuzzleIcon } from "../PuzzlePicker";
import { UserAvatar } from "../UserAvatar";
import { LiveDot } from "../duel/parts";
import { localFormat, said, tn, tr } from "../../../../src/client/i18n";

/**
 * How tournaments and matches are drawn on the phone, after the web's desktop/renderer/tournaments/format.tsx: the
 * dates, a tournament's and a match's status as badges, an event's tile, a player's line and the band of figures.
 */

const DAY = localFormat({ weekday: "short", day: "numeric", month: "short" }),
  TIME = localFormat({ hour: "2-digit", minute: "2-digit" });
export const day = (ms: number) => DAY.format(ms);
export const time = (ms: number) => TIME.format(ms);
/**
 * "in 3 hours", "in 2 days", "now", "2 days ago", translated (the web's Intl.RelativeTimeFormat, which Hermes lacks):
 * each unit and direction is a text of its own, as languages word them differently.
 */
export function relative(ms: number, now = Date.now()) {
  const minutes = Math.round((ms - now) / 60_000), abs = Math.abs(minutes), future = minutes > 0;
  if (abs < 1) return tr("now");
  if (abs < 60) return future ? tn(abs, "in {n} minute") : tn(abs, "{n} minute ago", "{n} minutes ago");
  const hours = Math.round(abs / 60);
  if (abs < 48 * 60) return future ? tn(hours, "in {n} hour") : tn(hours, "{n} hour ago", "{n} hours ago");
  const days = Math.round(abs / 1440);
  return future ? tn(days, "in {n} day") : tn(days, "{n} day ago", "{n} days ago");
}
/** "Sat 10 Oct · 18:00 · in 2 days" */
export const when = (ms: number) => `${day(ms)} · ${time(ms)} · ${relative(ms)}`;

/** The way back: the page before, or `to` (a web address) when the page was opened on its own (a link, a notification). */
export function Back({ to }: { to: string }) {
  const previous = useAtomValue(previousRouteAtom), goBack = useSetAtom(goBackAtom);
  return <BackButton onPress={() => previous ? goBack() : openUrl(to)} />;
}

/** A status as a soft badge: the accent with the live dot while under way, green when ready or open, quiet once over. */
function StateBadge({ tone, children, className }: { tone: "live" | "good" | "quiet" | "off"; children: ReactNode; className?: string }) {
  return <Badge variant={tone === "live" ? "accent" : tone === "good" ? "success" : "secondary"} className={cn("shrink-0", className)}>
    {tone === "live" ? <LiveDot className="size-1.5" /> : null}
    <Text className={tone === "off" ? "text-muted-foreground" : undefined}>{said(children)}</Text>
  </Badge>;
}

const MATCH_TONE = { waiting: "quiet", ready: "good", live: "live", done: "quiet", cancelled: "off" } as const;
/** A match's status; `children` says it otherwise (a bye). */
export function MatchStatusBadge({ status, children, className }: { status: MatchStatus; children?: ReactNode; className?: string }) {
  return <StateBadge tone={MATCH_TONE[status]} className={className}>{children ?? MATCH_STATUS[status]}</StateBadge>;
}

const TOURNAMENT_TONE = { open: "good", running: "live", finished: "quiet", cancelled: "off" } as const;
/** A tournament's status: the round being played while it runs. */
export function StatusBadge({ t }: { t: { status: TournamentStatus; round: number; rounds: number } }) {
  return <StateBadge tone={TOURNAMENT_TONE[t.status]}>{t.status === "running" ? roundName(t.round, t.rounds) : STATUS_TEXT[t.status]}</StateBadge>;
}

/** An event's icon on the quiet square of a card. */
export function EventTile({ event }: { event: string }) {
  const colors = useColors();
  return <View className="size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
    <PuzzleIcon puzzle={event as EventId} size={20} color={colors.mutedForeground} />
  </View>;
}

/** A player's face, by name. */
export const Face = ({ p, size = 32 }: { p: Pick<Person, "username"> | null | undefined; size?: number }) =>
  p ? <UserAvatar user={{ username: p.username, isGuest: false }} size={size} />
    : <View className="shrink-0 rounded-full border border-dashed border-muted-foreground/40" style={{ width: size, height: size }} />;

/**
 * A player of a match on one line: the face, the name (`name` says it otherwise: "You", "To be decided"), then the score
 * on the right. The winner in bold with a green check, the other muted once it is decided; the account's name in the
 * accent.
 */
export function PlayerLine({ p, name, score, won = false, decided = false, me = false, size = 32 }: {
  p: Person | null | undefined; name?: string; score?: number; won?: boolean; decided?: boolean; me?: boolean; size?: number;
}) {
  return <View className="min-w-0 flex-row items-center gap-2.5">
    <Face p={p} size={size} />
    <Text numberOfLines={1} className={cn("min-w-0 shrink text-sm", !p ? "text-muted-foreground italic" : won ? "font-semibold" : decided ? "text-muted-foreground" : "font-medium", me && p && !decided && "text-primary")}>
      {said(name) ?? p?.username}
    </Text>
    {won ? <View accessibilityLabel={tr("Winner")} className="size-4 items-center justify-center rounded-full bg-success/15">
      <Icon as={Check} size={11} strokeWidth={3} className="text-success" />
    </View> : null}
    {score != null ? <Numeric className={cn("ml-auto pl-2 text-base", won ? "font-semibold" : "text-muted-foreground")}>{score}</Numeric> : null}
  </View>;
}

/** A secondary group of figures: a quiet muted band, two figures a row (the web's `Strip` on a phone). */
export function Strip({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row flex-wrap gap-y-3 rounded-xl border border-border bg-muted/45 px-4 py-3", className)} {...props} />;
}
