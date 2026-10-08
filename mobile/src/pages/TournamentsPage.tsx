import { CalendarClock, Check, Crown, Flag, Play, Swords, Trophy, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { communityUrl, eventName, formatText, matchUrl, roundName, tournamentUrl, type Tournament, type TournamentDetail } from "../../../src/client/lib/community";
import { ask } from "../components/Confirm";
import { Empty, Figure, ListSkeleton, MenuItem, MoreMenu, Numeric, Page, PageHead, SectionHead, Segmented, Surface } from "../components/layout";
import { Bracket } from "../components/tournaments/Bracket";
import { Back, EventTile, Face, StatusBadge, Strip, day, relative, time, when } from "../components/tournaments/format";
import { community, openUrl, useSocial } from "../lib/social";
import { tr } from "../../../src/client/i18n";
import { plural } from "../../../src/client/lib/format";

/**
 * Tournaments, after the web's desktop/renderer/tournaments/page.tsx on a phone: the ones open to every player and those
 * of the account's groups, to register for until they start, then followed round by round; and one tournament's page:
 * where it stands, its bracket and its players, the player's own match a tap away.
 */
export function TournamentsPage({ view }: { view?: string }) {
  const id = Number((view ?? "").split("/")[0]);
  return id ? <TournamentView id={id} /> : <TournamentList />;
}

/** Register, or take the registration back, while the tournament has not started. */
function RegisterButton({ t, size = "default", className }: { t: Tournament; size?: "default" | "sm"; className?: string }) {
  if (t.status !== "open") return null;
  const full = !!t.maxPlayers && t.players >= t.maxPlayers;
  return t.registered
    ? <Button variant="outline" size={size} className={cn("gap-1.5", className)} accessibilityLabel={tr("Unregister")} accessibilityHint={tr("Registered")} onPress={() => void community.register(t.id, false)}>
      <Icon as={Check} size={16} className="text-success" /><Text>{tr("Registered")}</Text>
    </Button>
    : <Button size={size} className={className} disabled={full} onPress={() => void community.register(t.id, true)}><Text>{full ? tr("Full") : tr("Register")}</Text></Button>;
}

/** The account's match ready to be played: the round, against whom, and the way to it. */
function MatchReady({ title, text, match }: { title: string; text: string; match: number }) {
  return <Alert variant="info" icon={Swords} title={title}>
    <Text className="text-sm text-muted-foreground">{text}</Text>
    <Button size="sm" className="mt-2 gap-1.5 self-start" onPress={() => openUrl(matchUrl(match))}>
      <Icon as={Play} size={15} /><Text>{tr("Play your match")}</Text>
    </Button>
  </Alert>;
}

/** The cards on their way: shaped like a tournament's card. */
function CardsSkeleton() {
  return <View accessibilityLabel={tr("Loading")} className="gap-3">
    {[0, 1, 2].map(i => <Surface key={i} className="gap-4 p-4">
      <View className="flex-row items-start gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <View className="flex-1 gap-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></View>
        <Skeleton className="h-5 w-20" />
      </View>
      <Skeleton className="h-4 w-3/4" />
    </Surface>)}
  </View>;
}

function TournamentList() {
  useSocial();
  useEffect(() => { void community.load("tournaments"); }, []);
  const list = community.tournaments,
    mine = list?.filter(t => t.myMatch) ?? [],
    sections: [string, Tournament[]][] = [
      [tr("Under way"), list?.filter(t => t.status === "running") ?? []],
      [tr("Registration open"), list?.filter(t => t.status === "open") ?? []],
      [tr("Past"), list?.filter(t => t.status === "finished" || t.status === "cancelled") ?? []],
    ];
  return <Page>
    <PageHead lead={<Back to="/profile" />} title={tr("Tournaments")} sub={tr("Open to every player, and your groups'")} />
    <ScrollView className="-mx-4 min-h-0 flex-1" contentContainerClassName="gap-6 px-4 pb-4">
      {mine.map(t => <MatchReady key={t.id} title={tr("{0} · your match in {1} is ready.", { 0: roundName(t.round, t.rounds), 1: t.name })} text={formatText(t)} match={t.myMatch!} />)}
      {!list ? <CardsSkeleton />
        : !list.length ? <Empty icon={Trophy}>{tr("No tournament yet. The next ones will be listed here.")}</Empty>
        : sections.map(([title, items]) => items.length ? <View key={title} accessibilityLabel={title} className="gap-2">
          <SectionHead title={title} meta={items.length} />
          <View className="gap-3">{items.map(t => <TournamentCard key={t.id} t={t} />)}</View>
        </View> : null)}
    </ScrollView>
  </Page>;
}

/** A tournament as a card: its name, group and format, when, how many, and registering. The whole card opens its page. */
function TournamentCard({ t }: { t: Tournament }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={tr("Open {0}", { 0: t.name })} onPress={() => openUrl(tournamentUrl(t.id))}
    className="gap-4 rounded-xl border border-border bg-card p-4 active:bg-muted/40">
    <View className="flex-row items-start gap-3">
      <EventTile event={t.event} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={2} className="text-base leading-snug font-semibold tracking-tight">{t.name}</Text>
        <Text className="text-sm text-muted-foreground">
          {t.group ? <Text className="text-sm text-foreground/80">{t.group} · </Text> : null}
          {eventName(t.event)} · {formatText(t)}
        </Text>
      </View>
      <StatusBadge t={t} />
    </View>
    <View className="flex-row flex-wrap gap-x-5 gap-y-1.5">
      <Meta icon={CalendarClock}>{t.status === "open" ? tr("Starts {0}", { 0: when(t.startsAt) }) : t.status === "running" ? tr("Started {0}", { 0: relative(t.startedAt ?? t.startsAt) }) : day(t.finishedAt ?? t.startsAt)}</Meta>
      <Meta icon={Users}>{t.maxPlayers ? tr("{0} / {1} players", { 0: t.players, 1: t.maxPlayers }) : plural(t.players, "player")}</Meta>
      {t.winner ? <Meta icon={Crown} tone="text-warning">{tr("{0} won the tournament", { 0: t.winner.username })}</Meta> : null}
    </View>
    {t.status === "open" || t.myMatch ? <View className="flex-row flex-wrap items-center gap-2">
      <RegisterButton t={t} size="sm" />
      {t.myMatch ? <Button size="sm" className="gap-1.5" onPress={() => openUrl(matchUrl(t.myMatch!))}><Icon as={Play} size={15} /><Text>{tr("Play your match")}</Text></Button> : null}
    </View> : null}
  </Pressable>;
}

function Meta({ icon, tone, children }: { icon: typeof Users; tone?: string; children: string }) {
  return <View className="flex-row items-center gap-2">
    <Icon as={icon} size={16} className={tone ?? "text-muted-foreground"} />
    <Numeric className={cn("text-sm", tone ? "text-foreground" : "text-muted-foreground")}>{children}</Numeric>
  </View>;
}

function TournamentView({ id }: { id: number }) {
  useSocial();
  useEffect(() => { void community.load(`tournament:${id}`); }, [id]);
  const [part, setPart] = useState<"bracket" | "players">("bracket");
  const t = community.details.get(id);
  // A group's tournament goes back to the group's conversation, where its card is.
  const back = t?.groupId ? communityUrl(`groups/${t.groupId}`) : tournamentUrl();
  // Still in it while it runs: the tournament is the whole app, left only by giving up.
  const held = community.competition?.tournament === id;
  const lead = held ? <View className="size-11 items-center justify-center"><Icon as={Trophy} size={22} className="text-warning" /></View> : <Back to={back} />;
  if (!t) return <Page accessibilityLabel={tr("Loading")}>
    <PageHead lead={lead} title={tr("Tournament")} />
    <Skeleton className="h-36 rounded-xl" />
    <Surface className="min-h-0 flex-1 gap-3 p-4">
      <Skeleton className="h-5 w-24" />
      {[0, 1, 2, 3].map(k => <Skeleton key={k} className="h-20 w-56 rounded-xl" />)}
    </Surface>
  </Page>;
  const me = community.host.account().id,
    round = t.matches.filter(m => m.round === t.round),
    over = round.filter(m => m.status === "done" || m.status === "cancelled").length,
    manage = t.canManage && (t.status === "open" || t.status === "running");
  const confirm = async (question: { title: string; text: string; action: string; destructive?: boolean }, then: () => unknown) => {
    if (await ask({ ...question, cancel: tr("Not now") })) void then();
  };
  return <Page>
    <PageHead lead={lead} title={t.name} sub={t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament")}>
      <StatusBadge t={t} />
      {held || manage ? <MoreMenu>
        {held ? <MenuItem icon={Flag} destructive onPress={() => void community.withdraw(t)}>{tr("Give up")}</MenuItem> : null}
        {t.canManage && t.status === "open" ? <MenuItem onPress={() => confirm({ title: tr("Start the tournament now?"), text: tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players }), action: tr("Start now"), destructive: false }, () => community.manage(t.id, "start"))}>{tr("Start now")}</MenuItem> : null}
        {manage ? <MenuItem destructive onPress={() => confirm({ title: tr("Cancel the tournament?"), text: tr("Its matches stop where they are. This cannot be undone."), action: tr("Cancel the tournament") }, () => community.manage(t.id, "cancel"))}>{tr("Cancel")}</MenuItem> : null}
      </MoreMenu> : null}
    </PageHead>
    {held ? <Standing t={t} me={me} /> : null}
    {t.status === "open" || (t.myMatch && !held) ? <View className="flex-row gap-2">
      <RegisterButton t={t} className="flex-1" />
      {t.myMatch && !held ? <Button className="flex-1 gap-1.5" onPress={() => openUrl(matchUrl(t.myMatch!))}><Icon as={Play} size={16} /><Text>{tr("Play your match")}</Text></Button> : null}
    </View> : null}
    <Strip>
      <Figure className="w-1/2 pr-3" label={tr("Event")} value={eventName(t.event)} />
      <Figure className="w-1/2" label={t.status === "open" ? tr("Starts") : tr("Started")} value={t.status === "open" ? `${day(t.startsAt)} · ${time(t.startsAt)}` : day(t.startedAt ?? t.startsAt)} />
      <Figure className="w-full" label={tr("Format")} value={formatText(t)} />
      <Figure className="w-1/2 pr-3" label={tr("Players")} value={`${t.players}${t.maxPlayers ? " / " + t.maxPlayers : ""}`} />
      {t.status === "running" ? <Figure className="w-1/2" label={roundName(t.round, t.rounds)} value={`${over} of ${round.length} over`} tone="accent" />
        : t.status === "finished" ? <Figure className="w-1/2" label={tr("Champion")} value={t.winner?.username ?? "–"} tone="warning" />
        : t.status === "open" ? <Figure className="w-1/2" label={tr("Registration")} value={`closes ${relative(t.startsAt)}`} />
        : <Figure className="w-1/2" label={tr("Status")} value="Cancelled" />}
    </Strip>
    {t.description ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{t.description}</Text> : null}
    <Segmented label={tr("Tournament")} value={part} onChange={setPart} options={[{ id: "bracket", label: tr("Bracket") }, { id: "players", label: tr("Players · {0}", { 0: t.entrants.length }) }]} />
    <Surface className="min-h-0 flex-1 p-4">
      {part === "players" ? <Entrants t={t} me={me} />
        : t.matches.length ? <Bracket tournament={t} me={me} onOpen={m => openUrl(matchUrl(m.id))} onAward={t.canManage ? (m, p) => void community.award(m.id, p.id, t.id) : undefined} />
        : <Empty icon={Trophy}>{t.status === "cancelled" ? tr("Called off before it started.") : tr("The players are drawn into the bracket {0}.", { 0: t.status === "open" ? relative(t.startsAt) : tr("at the start") })}</Empty>}
    </Surface>
  </Page>;
}

/** Where the account stands in the tournament it is in: its match to play now, or the round it waits for. */
function Standing({ t, me }: { t: TournamentDetail; me: string }) {
  const mine = t.matches.find(m => m.id === t.myMatch),
    opponent = mine?.players.find(p => p && p.id !== me),
    round = t.matches.filter(m => m.round === t.round),
    over = round.filter(m => m.status === "done" || m.status === "cancelled").length;
  return mine
    ? <MatchReady title={tr("{0}: your match is ready", { 0: roundName(mine.round, t.rounds) })} match={mine.id}
      text={opponent ? tr("Against {0}. Both of you on the match page and it starts.", { 0: opponent.username }) : tr("It starts once both players are on its page.")} />
    : <Alert icon={Check} title={tr("You are still in")}>
      {tr("Waiting for the rest of the {0}: {1} of {2} matches over. Your next match opens here by itself.", { 0: roundName(t.round, t.rounds), 1: over, 2: round.length })}
    </Alert>;
}

/** The players registered, in their draw order once the tournament started. */
function Entrants({ t, me }: { t: TournamentDetail; me: string }) {
  if (!t.entrants.length) return <Empty icon={Users}>{tr("No one yet.")}</Empty>;
  return <ScrollView className="-m-2 min-h-0 flex-1" accessibilityLabel={tr("Players")}>
    {t.entrants.map(p => <View key={p.id} className="min-h-12 flex-row items-center gap-3 px-2 py-1.5">
      {p.seed ? <Numeric className="w-5 text-right text-xs text-muted-foreground">{p.seed}</Numeric> : null}
      <Face p={p} />
      <Text numberOfLines={1} className={cn("min-w-0 flex-1 text-sm font-medium", p.id === me && "text-primary")}>{p.username}</Text>
      {t.winner?.id === p.id ? <Icon as={Trophy} size={16} className="text-warning" /> : null}
    </View>)}
  </ScrollView>;
}
