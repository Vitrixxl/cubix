import { useAtomValue } from "jotai";
import { Ban, CalendarClock, Check, ChevronRight, FastForward, Flag, Gavel, History, Play, Plus, Trophy, Users } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { communityUrl, eventName, formatText, matchUrl, roundName, tournamentUrl, type Match, type Person, type Tournament, type TournamentDetail } from "../../../src/client/lib/community";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { ask } from "../components/Confirm";
import { Bar, Empty, Figure, HeadButton, MenuItem, MoreMenu, Numeric } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { TournamentSheet } from "../components/community/launch";
import { Cap, RoundStrip, SidePanel, type Cell } from "../components/duel/parts";
import { FullBracket, RoundBoard } from "../components/tournaments/Bracket";
import { Face, day, relative, time, useBack, when } from "../components/tournaments/format";
import { useLayout } from "../hooks/useLayout";
import { community, openUrl, useSocial } from "../lib/social";
import { signedInAtom } from "../state";
import { said, tr } from "../../../src/client/i18n";

/**
 * Tournaments, after the web's desktop/renderer/tournaments/page.tsx on a phone: the list in groups (under way,
 * registration open; the past ones in the History sheet), the account's match ready on top of everything, the open
 * tournament touched unfolding with its registration; and a tournament's own screen: where it stands, its rounds one at a time, its players ranked, the
 * rare actions (giving up, the organiser's) in its ⋯ menu. On a tablet the cards stand on two columns and the open
 * tournament touched comes in full in a sheet, or docked beside the list on a wide screen; a tournament's page shows its
 * whole bracket, its players under it or docked beside it.
 */
export function TournamentsPage({ view }: { view?: string }) {
  const id = Number((view ?? "").split("/")[0]);
  return id ? <TournamentView id={id} /> : <TournamentList />;
}

const full = (t: Tournament) => !!t.maxPlayers && t.players >= t.maxPlayers;
const players = (t: Tournament) => `${t.players}${t.maxPlayers ? " / " + t.maxPlayers : ""}`;
const where = (t: Tournament) => t.group ? tr("{0} · group tournament", { 0: t.group }) : tr("Open tournament");
const startNow = async (t: Tournament) => {
  if (await ask({ title: tr("Start the tournament now?"), text: tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players }), action: tr("Start now"), destructive: false, cancel: tr("Not now") })) void community.manage(t.id, "start");
};

/** On a tablet, cards on two columns (alternating, so they read in rows) rather than rows stretched across the screen. */
function Columns({ children }: { children: ReactNode[] }) {
  return <View className="flex-row items-start gap-3">
    {[0, 1].map(c => <View key={c} className="min-w-0 flex-1 gap-3">{children.filter((_, i) => i % 2 === c)}</View>)}
  </View>;
}

/** Register, or take the registration back, while the tournament has not started. */
function RegisterButton({ t, className }: { t: Tournament; className?: string }) {
  if (t.status !== "open") return null;
  return t.registered
    ? <Button variant="secondary" size="sm" className={cn("h-10 gap-1.5 rounded-xl bg-success/15", className)} accessibilityLabel={tr("Unregister")} accessibilityHint={tr("Registered")} onPress={() => void community.register(t.id, false)}>
      <Icon as={Check} size={16} className="text-success" /><Text className="text-success">{tr("Registered")}</Text>
    </Button>
    : <Button size="sm" className={cn("h-10 rounded-xl", className)} disabled={full(t)} onPress={() => void community.register(t.id, true)}><Text>{full(t) ? tr("Full") : tr("Register")}</Text></Button>;
}

/** The account's match ready, in the accent: the round, against whom, and the way to it. */
function MatchReady({ title, text, match }: { title: string; text?: string; match: number }) {
  return <View className="flex-row items-center gap-3 rounded-2xl bg-primary py-3 pr-3 pl-3.5">
    <Icon as={Trophy} size={20} className="text-primary-foreground" />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={2} className="text-[15px] font-bold text-primary-foreground">{title}</Text>
      {text ? <Text numberOfLines={2} className="text-xs text-primary-foreground/80">{text}</Text> : null}
    </View>
    <Button size="sm" className="h-10 gap-1.5 rounded-xl bg-primary-foreground active:bg-primary-foreground/90" onPress={() => openUrl(matchUrl(match))}>
      <Icon as={Play} size={15} className="text-primary" /><Text className="text-primary">{tr("Play")}</Text>
    </Button>
  </View>;
}

/** The rounds of a tournament as a strip: those over filled, the one being played outlined. */
const roundCells = (t: Tournament): Cell[] => Array.from({ length: t.rounds }, (_, i) => i + 1 < t.round || t.status === "finished" ? "me" : i + 1 === t.round && t.status === "running" ? "now" : "");

function TournamentList() {
  useSocial();
  const signedIn = useAtomValue(signedInAtom);
  useEffect(() => { void community.load("tournaments"); }, []);
  useEffect(() => { if (signedIn && !community.me) void community.load("me"); }, [signedIn]);
  const list = community.tournaments, mine = list?.find(t => t.myMatch);
  const open = list?.filter(t => t.status === "open") ?? [];
  const [picked, setPicked] = useState<number | null>(null), [history, setHistory] = useState(false);
  const { tablet, wide } = useLayout(), sheet = tablet && !wide;
  const past = list?.filter(t => t.status === "finished" || t.status === "cancelled") ?? [];
  const unfolded = picked ?? (open.find(t => t.registered) ?? open[0])?.id;
  // The open tournament in full: docked beside the list (wide), in a sheet once touched (portrait tablet).
  const detail = open.find(t => t.id === (sheet ? picked : wide ? unfolded : null));
  // The organiser's actions on the card unfolded need the tournament's page.
  useEffect(() => { if (unfolded && !community.details.has(unfolded)) void community.load(`tournament:${unfolded}`); }, [unfolded]);
  const sections: [string, Tournament[]][] = [
    [tr("Under way"), list?.filter(t => t.status === "running") ?? []],
    [tr("Registration open"), open],
  ];
  const card = (t: Tournament) => t.status === "open"
    ? <OpenCard key={t.id} t={community.summary(t)} unfolded={!tablet && t.id === unfolded} picked={wide && t.id === unfolded}
      onPress={() => t.id === unfolded && !sheet ? openUrl(tournamentUrl(t.id)) : setPicked(t.id)} />
    : <TournamentRow key={t.id} t={t} />;
  return <View className="flex-1">
    <AppBar puzzle={false}>
      {past.length ? <HeadButton icon={History} label={tr("History")} onPress={() => setHistory(true)} /> : null}
      <NewTournament />
    </AppBar>
    <SectionTabs />
    <View className="min-h-0 flex-1 flex-row">
      <View className="min-h-0 flex-1">
        {!list ? <View accessibilityLabel={tr("Loading")} className="gap-2.5 px-4 pt-3">
          <Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-36 rounded-3xl" />
        </View>
          : list.length === past.length ? <Empty icon={Trophy} title={tr("No tournament yet")} />
          : <ScrollView className="min-h-0 flex-1" contentContainerClassName={cn("gap-2.5 px-4 pt-3 pb-4", tablet && "gap-3 px-7 pt-4")}>
            {mine ? <MatchReady match={mine.myMatch!} title={tr("{0}: your match is ready", { 0: said(roundName(mine.round, mine.rounds)) })} text={`${mine.name} · ${formatText(mine)}`} /> : null}
            {sections.map(([title, items]) => items.length ? <View key={title} accessibilityLabel={title} className="gap-2">
              <Cap className="mt-1">{title} · {items.length}</Cap>
              {tablet ? <Columns>{items.map(card)}</Columns> : items.map(card)}
            </View> : null)}
          </ScrollView>}
      </View>
      {wide && detail ? <SidePanel><ScrollView contentContainerClassName="gap-3"><OpenDetail t={community.summary(detail)} /></ScrollView></SidePanel> : null}
    </View>
    {sheet ? <Sheet open={!!detail} onClose={() => setPicked(null)} title={detail?.name ?? ""} hideTitle scroll>{detail ? <OpenDetail t={community.summary(detail)} /> : null}</Sheet> : null}
    <Sheet open={history} onClose={() => setHistory(false)} title={tr("History")} scroll contentClassName="gap-2">{past.map(t => <TournamentRow key={t.id} t={t} />)}</Sheet>
  </View>;
}

/** A tournament under way or past on one row: its name, where and what, and the round it is at. */
function TournamentRow({ t }: { t: Tournament }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={tr("Open {0}", { 0: t.name })} onPress={() => openUrl(tournamentUrl(t.id))}
    className="flex-row items-center gap-3 rounded-2xl bg-card px-3.5 py-2.5 active:bg-muted/50">
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-base font-bold">{t.name}</Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">
        {t.myMatch ? <Text className="text-xs font-bold text-primary">{tr("Your match")} · </Text> : null}
        {[t.group ?? tr("Open"), eventName(t.event), formatText(t)].join(" · ")}
      </Text>
    </View>
    <View className="items-end gap-1">
      {t.status === "running" ? <Badge variant="accent"><Text>{said(roundName(t.round, t.rounds))}</Text></Badge>
        : t.winner ? <Badge variant="warning"><Text>{tr("{0} won the tournament", { 0: t.winner.username })}</Text></Badge>
        : <Badge variant="secondary"><Text className="text-muted-foreground">{t.status === "cancelled" ? tr("Cancelled") : tr("Finished")}</Text></Badge>}
      {t.status === "running" ? <RoundStrip cells={roundCells(t)} label={tr("Rounds")} className="w-14 flex-none" /> : null}
    </View>
  </Pressable>;
}

/**
 * A tournament open to registration as a card: its name and state, where and what; folded, how full it is and when it
 * starts beside the button; unfolded, the players as a bar, the start, registering, the organiser's start and its page.
 */
function OpenCard({ t, unfolded, picked = false, onPress }: { t: Tournament; unfolded: boolean; picked?: boolean; onPress: () => void }) {
  const d = community.details.get(t.id);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: picked }} accessibilityLabel={tr("Open {0}", { 0: t.name })} onPress={onPress}
    className={cn("gap-2 bg-card", unfolded ? "rounded-3xl p-4" : "rounded-2xl px-3.5 py-3 active:bg-muted/50", picked && "border-2 border-primary")}>
    <View className="flex-row items-center justify-between gap-2">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-bold">{t.name}</Text>
      {t.registered ? <Badge variant="success"><Icon as={Check} size={12} className="text-success" /><Text>{tr("Registered")}</Text></Badge>
        : <Badge variant={full(t) ? "secondary" : "success"}><Text>{full(t) ? tr("Full") : tr("Registration open")}</Text></Badge>}
    </View>
    <Text className="text-xs text-muted-foreground">{[where(t), eventName(t.event), formatText(t)].join(" · ")}</Text>
    {unfolded ? <>
      <View className="flex-row items-center gap-2.5">
        <Bar ratio={t.maxPlayers ? t.players / t.maxPlayers : 1} fill="bg-success" className="h-1.5 flex-1" />
        <Numeric className="text-sm text-muted-foreground"><Text className="text-sm font-bold">{players(t)}</Text> {tr("players")}</Numeric>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Icon as={CalendarClock} size={15} className="text-muted-foreground" />
        <Numeric className="text-sm text-muted-foreground">{tr("Starts {0}", { 0: when(t.startsAt) })}</Numeric>
      </View>
      <View className="flex-row items-center gap-1.5">
        <RegisterButton t={t} />
        {d?.canManage ? <Button variant="secondary" size="sm" className="h-10 gap-1.5 rounded-xl" onPress={() => void startNow(t)}>
          <Icon as={FastForward} size={15} /><Text>{tr("Start now")}</Text>
        </Button> : null}
        <View className="flex-1" />
        <Pressable accessibilityRole="link" accessibilityLabel={tr("See the tournament")} onPress={() => openUrl(tournamentUrl(t.id))} className="size-10 items-center justify-center rounded-xl active:bg-muted">
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </Pressable>
      </View>
    </> : <View className="flex-row items-center gap-2.5">
      <Numeric numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">{players(t)} · {day(t.startsAt)} · {time(t.startsAt)}</Numeric>
      <RegisterButton t={t} />
    </View>}
  </Pressable>;
}

/**
 * An open tournament in full, for a tablet's sheet or a wide screen's side panel: where and what, its description, its
 * start and players, registering, the organiser's start and the way to its page.
 */
function OpenDetail({ t }: { t: Tournament }) {
  const d = community.details.get(t.id);
  return <>
    <View className="flex-row items-center justify-between gap-2">
      <Cap className="min-w-0 flex-1">{where(t)}</Cap>
      {t.registered ? <Badge variant="success"><Icon as={Check} size={12} className="text-success" /><Text>{tr("Registered")}</Text></Badge>
        : <Badge variant={full(t) ? "secondary" : "success"}><Text>{full(t) ? tr("Full") : tr("Registration open")}</Text></Badge>}
    </View>
    <View className="gap-1">
      <Text accessibilityRole="header" className="text-3xl font-extrabold tracking-[-0.03em]">{t.name}</Text>
      <Text className="text-sm text-muted-foreground">{[eventName(t.event), formatText(t)].join(" · ")}</Text>
      {d?.description ? <Text className="text-sm text-muted-foreground">{d.description}</Text> : null}
    </View>
    <View className="flex-row gap-2">
      <Tile label={tr("Starts")} value={`${day(t.startsAt)} · ${time(t.startsAt)}`} className="bg-muted" />
      <Tile label={tr("Players")} value={players(t)} className="bg-muted" />
    </View>
    <Bar ratio={t.maxPlayers ? t.players / t.maxPlayers : 1} fill="bg-success" className="h-1.5" />
    <View className="flex-row gap-2">
      <RegisterButton t={t} className="h-12 flex-1" />
      {d?.canManage ? <Button variant="secondary" className="h-12 flex-1 gap-1.5 rounded-xl" onPress={() => void startNow(t)}>
        <Icon as={FastForward} size={16} /><Text>{tr("Start now")}</Text>
      </Button> : null}
    </View>
    <Button variant="ghost" className="h-12 gap-1.5 rounded-xl" accessibilityLabel={tr("See the tournament")} onPress={() => openUrl(tournamentUrl(t.id))}>
      <Text>{tr("Open")}</Text><Icon as={ChevronRight} size={16} />
    </Button>
  </>;
}

/** A new tournament in one of the groups the account runs (owner or admin); none, no button. */
function NewTournament() {
  const groups = community.me?.groups.filter(g => g.role === "owner" || g.role === "admin") ?? [];
  const [group, setGroup] = useState<number | null>(null);
  const loaded = group === null ? undefined : community.groups.get(group);
  if (!groups.length) return null;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full" accessibilityLabel={tr("New tournament")}><Icon as={Plus} size={22} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {groups.map(g => <MenuItem key={g.id} icon={Trophy} onPress={() => { setGroup(g.id); if (!community.groups.has(g.id)) void community.load(`group:${g.id}`); }}>{tr("New tournament in {0}", { 0: g.name })}</MenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {loaded ? <TournamentSheet group={loaded} open onClose={() => setGroup(null)} /> : null}
  </>;
}

/** How far each player went: still in or out (and in which round), the champion first; registration order before the start. */
function standings(t: TournamentDetail) {
  return t.entrants.map((p, i) => {
    const played = t.matches.filter(m => m.players.some(x => x?.id === p.id)),
      reached = Math.max(0, ...played.map(m => m.round)),
      lost = played.find(m => m.status === "done" && !!m.winner && m.winner !== p.id);
    return { p, seed: p.seed ?? i + 1, reached, out: lost?.round ?? null, champion: t.winner?.id === p.id };
  }).sort((a, b) => Number(b.champion) - Number(a.champion) || Number(a.out !== null) - Number(b.out !== null)
    || b.reached - a.reached || (b.out ?? 0) - (a.out ?? 0) || a.seed - b.seed);
}

/** A figure of the tournament on a quiet tile. */
function Tile({ label, value, tone, className }: { label: string; value: ReactNode; tone?: "accent" | "warning"; className?: string }) {
  return <Figure className={cn("min-w-0 flex-1 rounded-2xl bg-card px-3 py-2.5", className)} label={label} value={value} tone={tone ?? ""} />;
}

function TournamentView({ id }: { id: number }) {
  useSocial();
  useEffect(() => { void community.load(`tournament:${id}`); }, [id]);
  const t = community.details.get(id);
  // A group's tournament goes back to the group's conversation, where its card is.
  const back = useBack(t?.groupId ? communityUrl(`groups/${t.groupId}`) : tournamentUrl());
  const [deciding, setDeciding] = useState(false);
  const { tablet, wide } = useLayout();
  if (!t) return <View accessibilityLabel={tr("Loading")} className="flex-1">
    <PushedBar title={tr("Tournament")} onBack={back} />
    <View className="gap-2.5 px-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></View>
  </View>;
  const me = community.host.account().id,
    round = t.matches.filter(m => m.round === t.round),
    over = round.filter(m => m.status === "done" || m.status === "cancelled").length,
    manage = t.canManage && (t.status === "open" || t.status === "running"),
    // Still in it while it runs: giving up is the way out.
    held = community.competition?.tournament === id,
    decidable = t.canManage ? t.matches.filter(m => (m.status === "ready" || m.status === "live") && m.players.every(Boolean)) : [];
  const confirm = async (question: { title: string; text: string; action: string; destructive?: boolean }, then: () => unknown) => {
    if (await ask({ ...question, cancel: tr("Not now") })) void then();
  };
  const ranked = standings(t);
  const rows = ranked.map((r, i) => <View key={r.p.id} className="min-h-11 flex-row items-center gap-2.5">
    <Numeric className={cn("w-6 text-right text-base font-extrabold", i < 3 && t.status !== "open" ? "text-warning" : "text-muted-foreground")}>{i + 1}</Numeric>
    <Face p={r.p} size={30} />
    <Text numberOfLines={1} className={cn("min-w-0 flex-1 text-[15px] font-bold", r.p.id === me && "text-primary")}>{r.p.username}</Text>
    {r.champion ? <Badge variant="warning"><Text>{tr("Champion")}</Text></Badge>
      : r.out !== null ? <Text className="text-xs text-muted-foreground">{tr("Out · {0}", { 0: said(roundName(r.out, t.rounds)).toLowerCase() })}</Text>
      : t.status === "running" && r.reached ? <Badge variant={r.reached === t.round ? "accent" : "secondary"}><Text>{said(roundName(r.reached, t.rounds))}</Text></Badge>
      : null}
  </View>);
  // The players: under the bracket (two columns on a portrait tablet), or docked beside it on a wide screen.
  const playerList = <>
    <Text accessibilityRole="header" className="text-base font-bold">{tr("Players")} <Text className="text-base font-bold text-muted-foreground">{t.entrants.length}</Text></Text>
    {!t.entrants.length ? <Empty icon={Users} className="p-2">{tr("No one yet.")}</Empty>
      : <ScrollView className="min-h-0 flex-1" accessibilityLabel={tr("Players")} contentContainerStyle={{ paddingBottom: 8 }}>
        {tablet && !wide ? <Columns>{rows}</Columns> : rows}
      </ScrollView>}
  </>;
  const main = <View className={cn("min-h-0 flex-1 gap-2.5 px-4 pt-0.5 pb-3", tablet && "gap-3 px-7")}>
    <Cap>{[where(t), eventName(t.event), formatText(t)].join(" · ")}</Cap>
    {t.description ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{t.description}</Text> : null}
    <View className="flex-row gap-2">
      {t.status === "running" ? <Tile label={said(roundName(t.round, t.rounds))} value={tr("{0} / {1} over", { 0: over, 1: round.length })} tone="accent" /> : null}
      <Tile label={tr("Players")} value={players(t)} />
      {t.status === "open" ? <>
        <Tile label={tr("Starts")} value={`${day(t.startsAt)} · ${time(t.startsAt)}`} />
        <Tile label={tr("Registration")} value={tr("closes {0}", { 0: relative(t.startsAt) })} />
      </> : t.status === "running" ? <Tile label={tr("Started")} value={time(t.startedAt ?? t.startsAt)} />
        : t.status === "finished" ? <Tile label={tr("Champion")} value={t.winner?.username ?? "–"} tone="warning" />
        : <Tile label={tr("Status")} value={tr("Cancelled")} />}
    </View>
    <Standing t={t} me={me} held={held} />
    {t.status === "open" ? <View className="flex-row items-center gap-2"><RegisterButton t={t} className="flex-1" /></View> : null}
    {t.matches.length ? tablet ? <View className={cn("min-h-0 rounded-3xl bg-card p-4", wide ? "flex-1" : "flex-[3]")}><FullBracket tournament={t} me={me} onOpen={m => openUrl(matchUrl(m.id))} /></View>
      : <RoundBoard tournament={t} me={me} onOpen={m => openUrl(matchUrl(m.id))} />
      : <Empty icon={Trophy} className="flex-none p-3">{t.status === "cancelled" ? tr("Called off before it started.") : tr("The players are drawn into the bracket {0}.", { 0: t.status === "open" ? relative(t.startsAt) : tr("at the start") })}</Empty>}
    {wide ? null : <View className={cn("min-h-0 flex-1 gap-1.5 rounded-3xl bg-card px-4 pt-3.5 pb-1", tablet && "flex-[2]")}>{playerList}</View>}
  </View>;
  return <View className="flex-1">
    <PushedBar title={t.name} onBack={back}>
      {held || manage ? <MoreMenu>
        {held ? <MenuItem icon={Flag} onPress={() => void community.withdraw(t)}>{tr("Give up")}</MenuItem> : null}
        {t.canManage && t.status === "open" ? <MenuItem icon={FastForward} onPress={() => confirm({ title: tr("Start the tournament now?"), text: tr("The {0} registered players are drawn into the bracket and registration closes.", { 0: t.players }), action: tr("Start now"), destructive: false }, () => community.manage(t.id, "start"))}>{tr("Start now")}</MenuItem> : null}
        {decidable.length ? <MenuItem icon={Gavel} onPress={() => setDeciding(true)}>{tr("Decide a match…")}</MenuItem> : null}
        {manage ? <MenuItem icon={Ban} destructive onPress={() => confirm({ title: tr("Cancel the tournament?"), text: tr("Its matches stop where they are. This cannot be undone."), action: tr("Cancel the tournament") }, () => community.manage(t.id, "cancel"))}>{tr("Cancel the tournament")}</MenuItem> : null}
      </MoreMenu> : null}
    </PushedBar>
    {wide ? <View className="min-h-0 flex-1 flex-row">{main}<SidePanel className="mt-0 gap-1.5">{playerList}</SidePanel></View> : main}
    <Sheet open={deciding} onClose={() => setDeciding(false)} title={tr("Decide a match")} description={tr("Give the match to")} scroll>
      {decidable.map(m => <Decide key={m.id} m={m} t={t} onDone={() => setDeciding(false)} />)}
    </Sheet>
  </View>;
}

/** A match the organiser may decide: its players, each a button giving it to them. */
function Decide({ m, t, onDone }: { m: Match; t: TournamentDetail; onDone: () => void }) {
  const give = async (p: Person) => {
    if (!(await ask({ title: tr("Give the match to {0}?", { 0: p.username }), text: tr("The match ends at once and {0} goes through.", { 0: p.username }), action: tr("Give the match"), destructive: false }))) return;
    onDone();
    void community.award(m.id, p.id, t.id);
  };
  return <View className="gap-2 border-b border-border py-3">
    <Text className="text-xs font-medium text-muted-foreground">{said(roundName(m.round, t.rounds))} · {tr("Match {0}", { 0: m.slot + 1 })}</Text>
    <View className="flex-row gap-2">
      {m.players.map(p => p ? <Button key={p.id} variant="secondary" className="h-11 flex-1 gap-2 rounded-xl" onPress={() => void give(p)}>
        <Face p={p} size={22} /><Text numberOfLines={1} className="shrink">{p.username}</Text>
      </Button> : null)}
    </View>
  </View>;
}

/** Where the account stands in the tournament: its match to play now, or the round it waits for while still in. */
function Standing({ t, me, held }: { t: TournamentDetail; me: string; held: boolean }) {
  const mine = t.matches.find(m => m.id === t.myMatch),
    opponent = mine?.players.find(p => p && p.id !== me),
    round = t.matches.filter(m => m.round === t.round),
    over = round.filter(m => m.status === "done" || m.status === "cancelled").length;
  if (mine) return <MatchReady match={mine.id} title={tr("{0}: your match is ready", { 0: said(roundName(mine.round, t.rounds)) })}
    text={opponent ? tr("vs {0}", { 0: opponent.username }) : undefined} />;
  if (!held) return null;
  return <View className="flex-row items-center gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5">
    <Icon as={Check} size={16} className="text-success" />
    <View className="min-w-0 flex-1">
      <Text className="text-sm font-bold">{tr("You are still in")}</Text>
      <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{said(roundName(t.round, t.rounds))} · {tr("{0} / {1} over", { 0: over, 1: round.length })}</Numeric>
    </View>
  </View>;
}
