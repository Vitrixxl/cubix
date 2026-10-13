import { Crown, History, LogOut, MessageCircle, MessageSquare, Pencil, Plus, Shield, Swords, Trash2, Trophy, UserMinus, UserPlus, UserRoundX, Users, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { MATCH_STATUS, communityUrl, eventName, formatText, scoreOf, seatIn, tournamentUrl, type Conversation, type Group, type Match } from "../../../../src/client/lib/community";
import { plural } from "../../../../src/client/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../../hooks/useLayout";
import { community } from "../../lib/social";
import { Empty, Figure, HeadButton, ListSkeleton, MenuItem, MoreMenu, Numeric, SectionHead } from "../layout";
import { PushedBar } from "../AppBar";
import { Sheet, SheetInput } from "../Sheet";
import { Column, Columns, Face, day, relative, time } from "../chat/kit";
import { EventTile, MatchStatusBadge, StatusBadge, Strip } from "../tournaments/format";
import { MatchSheet, TournamentChatCard, waiting } from "./cards";
import { BattleSheet, TournamentSheet } from "./launch";
import { Caption, GroupMark, Pill, TextLink, organiser } from "./marks";
import { Field, FriendPicker, PersonRow, battlesIn, directWith, friendsOutside, tally } from "./people";
import { localFormat, said, tr } from "../../../../src/client/i18n";
import { msg } from "../../../../src/client/i18n/msg";

/**
 * The details of a conversation (the web's community/groups.tsx), in a tall sheet over it. A group's: what it is
 * about, its members (invited by its owner and admins, from the friends or by name), its tournaments and its battles,
 * then leaving or deleting it. A friend's: since when, the battles between the two and their record, and ending the
 * friendship. `leave` closes the sheet before going to another page.
 */
export function Details({ conversation: c, leave }: { conversation: Conversation; leave: () => void }) {
  return c.kind === "group" ? <GroupDetails id={c.group!.id} leave={leave} /> : <FriendDetails c={c} />;
}

const me = () => community.host.account().id;

/** A part of the details: its title, a count, an action on the right. */
function Part({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return <View className="-mx-5 gap-1.5 border-t border-border px-5 py-4" accessibilityLabel={title}>
    <SectionHead title={title} meta={count || undefined}>{action}</SectionHead>
    {children}
  </View>;
}
/** A quiet button of the details: an icon and a word, `full` what it does in words for a screen reader. */
function Quiet({ icon, label, full, onPress, danger }: { icon: typeof Plus; label: string; full?: string; onPress: () => void; danger?: boolean }) {
  return <Button variant="ghost" size="sm" className={cn("h-10 rounded-lg px-2.5", danger && "justify-start")} accessibilityLabel={full} onPress={onPress}>
    <Icon as={icon} size={16} className="text-muted-foreground" />
    <Text className="text-muted-foreground">{label}</Text>
  </Button>;
}
/** A row of the details that opens what it shows: the event's tile, two lines, and where it stands. */
function DetailRow({ event, title, detail, trailing, onPress, label }: { event: string; title: ReactNode; detail: string; trailing: ReactNode; onPress: () => void; label: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="min-h-14 flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted/60">
    <View className="scale-90"><EventTile event={event} /></View>
    <View className="min-w-0 flex-1">
      {typeof title === "string" ? <Text numberOfLines={1} className="text-sm font-medium">{title}</Text> : title}
      <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Numeric>
    </View>
    {trailing}
  </Pressable>;
}

const ROLE_LABEL = { owner: msg("Owner"), admin: msg("Admin"), member: "", invited: msg("Invited") };

function GroupDetails({ id, leave }: { id: number; leave: () => void }) {
  const g = community.groups.get(id), [editing, setEditing] = useState(false), [inviting, setInviting] = useState(false), [organising, setOrganising] = useState(false);
  if (!g) return <View className="items-center gap-3 pt-2" accessibilityLabel={tr("Loading")}>
    <Skeleton className="size-14 rounded-full" />
    <Skeleton className="h-5 w-1/2" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="mt-4 h-24 w-full" />
  </View>;
  const run = organiser(g.role), members = g.members.filter(m => m.role !== "invited"), invited = g.members.filter(m => m.role === "invited");
  return <>
    <View className="items-center gap-2 pb-4">
      <GroupMark size={56} />
      <Text accessibilityRole="header" className="text-center text-lg font-semibold tracking-tight">{g.name}</Text>
      {g.description ? <Text className="text-center text-sm text-muted-foreground">{g.description}</Text> : null}
      {run ? <Quiet icon={Pencil} label={tr("Edit")} onPress={() => setEditing(true)} /> : null}
    </View>
    <Part title={tr("Members")} count={members.length} action={run ? <Quiet icon={UserPlus} label={tr("Invite")} onPress={() => setInviting(true)} /> : null}>
      <View className="-mx-2 gap-0.5">{[...members, ...invited].map(m => <Member key={m.id} g={g} m={m} leave={leave} />)}</View>
    </Part>
    <Part title={tr("Tournaments")} count={g.tournaments.length} action={run ? <Quiet icon={Plus} label={tr("Organise")} onPress={() => setOrganising(true)} /> : null}>
      {!g.tournaments.length ? <Empty className="flex-none p-3">{tr("No tournament yet")}</Empty>
        : <View className="-mx-2 gap-0.5">{g.tournaments.map(t => <DetailRow key={t.id} event={t.event} title={t.name} label={tr("Open {0}", { 0: t.name })}
          detail={t.status === "finished" && t.winner ? tr("Won by {0}", { 0: t.winner.username }) : `${day(t.startsAt)} · ${plural(t.players, "player")}`}
          trailing={<StatusBadge t={t} />} onPress={() => { leave(); community.host.navigate(tournamentUrl(t.id)); }} />)}</View>}
    </Part>
    <Part title={tr("Battles")} count={g.battles.length}>
      <Battles battles={g.battles} />
    </Part>
    <View className="-mx-5 border-t border-border px-3 pt-3">
      {g.role !== "owner"
        ? <Quiet icon={LogOut} label={tr("Leave")} full={tr("Leave the group")} danger onPress={() => void community.remove(g.id, me())} />
        : <Quiet icon={Trash2} label={tr("Delete")} full={tr("Delete the group")} danger onPress={() => void community.deleteGroup(g.id)} />}
    </View>
    <EditGroupSheet group={g} open={editing} onClose={() => setEditing(false)} />
    <InviteSheet g={g} open={inviting} onClose={() => setInviting(false)} />
    <TournamentSheet group={g} open={organising} onClose={() => setOrganising(false)} />
  </>;
}

function Member({ g, m, leave }: { g: Group; m: Group["members"][number]; leave: () => void }) {
  const self = m.id === me(),
    removable = !self && m.role !== "owner" && (g.role === "owner" || (g.role === "admin" && m.role !== "admin")),
    manageable = removable || (g.role === "owner" && (m.role === "admin" || m.role === "member")),
    friend = community.me?.friends.some(f => f.id === m.id);
  return <PersonRow p={m} name={<Text numberOfLines={1} className={cn("text-sm font-medium", m.role === "invited" && "text-muted-foreground")}>{self ? tr("You") : m.username}</Text>}>
    {ROLE_LABEL[m.role] ? <Badge variant="secondary" className="gap-1">
      {m.role === "owner" ? <Icon as={Crown} size={12} className="text-secondary-foreground" /> : m.role === "admin" ? <Icon as={Shield} size={12} className="text-secondary-foreground" /> : null}
      <Text>{tr(ROLE_LABEL[m.role])}</Text>
    </Badge> : null}
    {manageable || (!self && m.role !== "invited") ? <MoreMenu label={tr("Manage {0}", { 0: m.username })}>
      {!self && m.role !== "invited" ? friend
        ? <MenuItem icon={MessageSquare} onPress={() => { leave(); void community.message(m.id); }}>{tr("Write to {0}", { 0: m.username })}</MenuItem>
        : <MenuItem icon={UserPlus} onPress={() => void community.addFriend(m.username)}>{tr("Add as a friend")}</MenuItem> : null}
      {g.role === "owner" && m.role === "member" ? <MenuItem icon={Shield} onPress={() => void community.setRole(g.id, m.id, "admin")}>{tr("Make admin")}</MenuItem> : null}
      {g.role === "owner" && m.role === "admin" ? <MenuItem icon={Users} onPress={() => void community.setRole(g.id, m.id, "member")}>{tr("Make member")}</MenuItem> : null}
      {removable ? <MenuItem icon={X} destructive onPress={() => void community.remove(g.id, m.id)}>{m.role === "invited" ? tr("Withdraw the invitation") : tr("Remove from the group")}</MenuItem> : null}
    </MoreMenu> : null}
  </PersonRow>;
}

/** A group's name and description, changed by its owner or an admin. */
function EditGroupSheet({ group: g, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(g.name), [description, setDescription] = useState(g.description);
  useEffect(() => { if (open) { setName(g.name); setDescription(g.description); } }, [open]);
  return <Sheet open={open} onClose={onClose} title={tr("Edit the group")}>
    <Field label={tr("Name")}><SheetInput value={name} onChangeText={setName} maxLength={40} accessibilityLabel={tr("Name")} /></Field>
    <Field label={tr("Description")}><SheetInput value={description} onChangeText={setDescription} maxLength={300} multiline accessibilityLabel={tr("Description")} className="min-h-20 py-2.5" textAlignVertical="top" /></Field>
    <Button disabled={name.trim().length < 2} className="h-11 rounded-lg" onPress={async () => { if (await community.updateGroup(g.id, name.trim(), description.trim())) onClose(); }}><Text>{tr("Save")}</Text></Button>
  </Sheet>;
}

/** Inviting to a group: friends ticked from a list, or any player by name. */
function InviteSheet({ g, open, onClose }: { g: Group; open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]), [name, setName] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPicked([]); setName(""); } }, [open]);
  const byName = async () => { if (name.trim() && (await community.invite(g.id, name.trim()))) setName(""); };
  return <Sheet open={open} onClose={onClose} title={tr("Invite to {0}", { 0: g.name })}>
    <FriendPicker friends={friendsOutside(g)} value={picked} onChange={setPicked} />
    <View className="flex-row items-center gap-2">
      <View className="flex-1"><SheetInput value={name} onChangeText={setName} placeholder={tr("Username")} accessibilityLabel={tr("Invite a player")} autoCapitalize="none" autoCorrect={false}
        returnKeyType="send" onSubmitEditing={() => void byName()} /></View>
      <Button variant="outline" disabled={!name.trim()} className="h-11 rounded-lg" onPress={() => void byName()}><Text>{tr("Invite")}</Text></Button>
    </View>
    <Button disabled={!picked.length || busy} className="h-11 rounded-lg" onPress={async () => {
      setBusy(true);
      for (const id of picked) await community.inviteFriend(g.id, id);
      setBusy(false);
      onClose();
    }}>
      <Icon as={UserPlus} size={16} />
      <Text>{picked.length ? tr("Invite {0}", { 0: picked.length }) : tr("Invite")}</Text>
    </Button>
  </Sheet>;
}

/** Battles as rows: who against whom, the score or where it stands; each opens its detail. */
function Battles({ battles }: { battles: Match[] }) {
  const [shown, setShown] = useState<Match | null>(null);
  if (!battles.length) return <Empty className="flex-none p-3">{tr("No battles yet")}</Empty>;
  return <>
    <View className="-mx-2 gap-0.5">
      {battles.map(match => {
        const b = community.card(match), won = b.winner === me(), mine = b.players.some(p => p?.id === me()),
          who = `${b.players[0]?.username} ${tr("vs")} ${b.players[1]?.username ?? tr("anyone")}`;
        return <DetailRow key={b.id} event={b.event} label={who} onPress={() => setShown(b)}
          title={<Text numberOfLines={1} className="text-sm font-medium">{b.players[0]?.username} <Text className="text-sm font-normal text-muted-foreground">{tr("vs")}</Text> {b.players[1]?.username ?? tr("anyone")}</Text>}
          detail={`${eventName(b.event)} · ${relative(b.finishedAt ?? b.createdAt)}`}
          trailing={b.status === "done" ? <Numeric className={cn("text-sm font-semibold", mine && (won ? "text-success" : "text-destructive"))}>{scoreOf(b).join("–")}</Numeric> : <MatchStatusBadge status={b.status} />} />;
      })}
    </View>
    <MatchSheet match={shown} onClose={() => setShown(null)} />
  </>;
}

function FriendDetails({ c }: { c: Conversation }) {
  const other = c.with!, friend = community.me?.friends.find(f => f.id === other.id),
    // The battles between the two, from the conversation's cards, the latest first.
    battles = (community.messages.get(c.id) ?? []).filter(m => m.match).map(m => community.card(m.match!)).reverse(),
    done = battles.filter(b => b.status === "done"), won = done.filter(b => b.winner === me()).length;
  return <>
    <View className="items-center gap-2 pb-4">
      <Face name={other.username} src={other.avatar} size={56} />
      <Text accessibilityRole="header" className="text-lg font-semibold tracking-tight">{other.username}</Text>
      {!friend ? <Text className="text-xs text-muted-foreground">{tr("No longer friends")}</Text> : null}
    </View>
    <Part title={tr("Your battles")} count={battles.length}>
      {done.length ? <Strip className="mb-1">
        <Figure label={tr("Won")} value={won} tone="good" className="w-1/3" />
        <Figure label={tr("Lost")} value={done.length - won} tone="bad" className="w-1/3" />
        <Figure label={tr("Played")} value={done.length} className="w-1/3" />
      </Strip> : null}
      <Battles battles={battles} />
    </Part>
    {friend ? <View className="-mx-5 border-t border-border px-3 pt-3">
      <Quiet icon={UserMinus} label={tr("Remove")} full={tr("Remove from friends")} danger onPress={() => void community.removeFriend(other.id)} />
    </View> : null}
  </>;
}

const shortDate = localFormat({ day: "numeric", month: "short" });
const when = (at: number) => (Date.now() - at < 86_400_000 ? time(at) : shortDate.format(at));
const MARK = { good: "bg-success/15 text-success", accent: "bg-primary/15 text-primary", quiet: "bg-muted text-muted-foreground" } as const;
/** Where a battle stands for the account, in a small filled word. */
function Mark({ tone, children }: { tone: keyof typeof MARK; children: string }) {
  return <View className={cn("h-[22px] items-center justify-center rounded-full px-2", MARK[tone].split(" ")[0])}>
    <Text className={cn("text-[11px] font-bold", MARK[tone].split(" ")[1])}>{said(children)}</Text>
  </View>;
}

/** Battles as lines: when, the event, how it is won (or who played), the score and where it stands; each opens its detail. */
function BattleLines({ battles, group = false }: { battles: Match[]; group?: boolean }) {
  const [shown, setShown] = useState<Match | null>(null);
  return <View>
    {battles.map((b, i) => {
      const seat = seatIn(b, me()), [a, z] = scoreOf(b), mine = seat === 1 ? [z, a] : [a, z], won = b.status === "done" && seat !== null && b.winner === me();
      return <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${eventName(b.event)} · ${formatText(b)}`} onPress={() => setShown(b)}
        className={cn("min-h-11 flex-row items-center gap-2.5 active:bg-muted/40", i > 0 && "border-t border-border")}>
        <Numeric className="w-10 text-[11px] text-muted-foreground">{when(b.finishedAt ?? b.createdAt)}</Numeric>
        <Text numberOfLines={1} className="w-12 text-sm font-extrabold">{eventName(b.event)}</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] text-muted-foreground">{group ? `${b.players[0]?.username ?? ""} ${tr("vs")} ${b.players[1]?.username ?? tr("anyone")}` : formatText(b)}</Text>
        <Numeric className={cn("text-[15px] font-extrabold", b.status !== "done" && b.status !== "live" && "text-muted-foreground")}>{b.status === "done" || b.status === "live" ? `${mine[0]}–${mine[1]}` : "–"}</Numeric>
        {b.status === "done" && seat !== null ? <Mark tone={won ? "good" : "accent"}>{won ? tr("Won") : tr("Lost")}</Mark>
          : <Mark tone={b.status === "live" ? "accent" : b.status === "ready" ? "good" : "quiet"}>{b.status === "cancelled" ? tr("Called off") : MATCH_STATUS[b.status]}</Mark>}
      </Pressable>;
    })}
    <MatchSheet match={shown} onClose={() => setShown(null)} />
  </View>;
}

/** One thing to do, in a card of its own: a lead in large, a title and a line, and its step. */
function Offer({ lead, title, sub, action, accent, run }: { lead: string; title: string; sub?: string; action: string; accent: boolean; run: () => void }) {
  return <View className={cn("flex-row items-center gap-3 rounded-2xl px-4 py-3", accent ? "bg-accent" : "bg-muted")}>
    <Numeric numberOfLines={1} className="max-w-24 text-xl font-extrabold tracking-tight">{lead}</Numeric>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-sm font-bold">{title}</Text>
      {sub ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Text> : null}
    </View>
    {accent ? <Pill text={action} tone="primary" onPress={run} /> : <TextLink accent onPress={run}>{action}</TextLink>}
  </View>;
}

/** The head of a friend's or a group's page: the face and the name in large. */
function Head({ face, name }: { face: ReactNode; name: string }) {
  return <View className="flex-row items-center gap-3">
    {face}
    <Text numberOfLines={1} accessibilityRole="header" className="min-w-0 flex-1 text-[26px] font-extrabold tracking-[-0.035em]">{name}</Text>
  </View>;
}

/**
 * A friend's page, pushed from the Community tab: Challenge and Write in large, the score of your battles, what waits
 * for you between you and a rematch; every battle in the History sheet, ending the friendship in its menu. On a tablet
 * what waits goes in a second column; `docked` beside the list on a wide screen, it keeps one column and closes.
 */
export function FriendPage({ id, back, docked = false }: { id: string; back: () => void; docked?: boolean }) {
  const f = community.me?.friends.find(x => x.id === id), [c, setC] = useState<Conversation | undefined>(() => directWith(id)), [battle, setBattle] = useState(false), [history, setHistory] = useState(false);
  useEffect(() => { void community.load("conversations"); }, []);
  useEffect(() => {
    const found = directWith(id);
    if (found) setC(found);
    // A battle needs the conversation it shows in: made on first need, without leaving the page.
    else if (community.conversations && f) void community.act<Conversation>("POST", "social/conversations", { userId: id }, ["conversations"]).then(setC);
  }, [id, community.conversations, !!f]);
  useEffect(() => { if (c) void community.load(`messages:${c.id}`); }, [c?.id]);
  const messages = c ? community.messages.get(c.id) : undefined, battles = battlesIn(c), t = tally(battles), items = messages ? waiting(messages) : [],
    last = battles.find(b => b.status === "done"), you = community.host.account(), split = useLayout().tablet && !docked;
  return <View className="min-h-0 flex-1">
    <PushedBar title={tr("Friend")} onBack={back} back={docked ? "close" : "back"}>
      {f ? <HeadButton icon={History} label={tr("History")} onPress={() => setHistory(true)} /> : null}
      {f ? <MoreMenu label={tr("More about {0}", { 0: f.username })}>
        <MenuItem icon={UserMinus} destructive onPress={() => void community.removeFriend(f.id)}>{tr("Remove from friends")}</MenuItem>
      </MoreMenu> : null}
    </PushedBar>
    {!community.me ? <ListSkeleton className="px-4" /> : !f ? <Empty icon={UserRoundX} title={tr("No longer friends")} />
      : <ScrollView className="min-h-0 flex-1" contentContainerClassName={cn("gap-3 px-4 pb-4", split && "px-7")}><Columns split={split}><Column split={split}>
        <Head face={<Face name={f.username} src={f.avatar} size={64} />} name={f.username} />
        <View className="flex-row gap-2">
          <Pill icon={Swords} text={tr("Challenge")} tone="primary" disabled={!c} onPress={() => setBattle(true)} className="h-11 flex-1" />
          <Pill icon={MessageCircle} text={tr("Write")} onPress={() => void community.message(f.id)} className="h-11 flex-1" />
        </View>
        <Caption className="pt-1">{tr("Your battles")}</Caption>
        <View accessibilityLabel={tr("{0} to {1}", { 0: t.won, 1: t.lost })} className="flex-row items-center justify-between rounded-3xl bg-muted px-4 py-4">
          <View className="w-24 items-center gap-1"><Face name={you.username} size={30} /><Text className="text-sm font-bold">{tr("You")}</Text><Text className="text-[11px] text-muted-foreground">{plural(t.won, "win")}</Text></View>
          <Numeric className="text-[46px] leading-none font-extrabold tracking-[-0.05em]">{t.won}<Text className="text-[46px] font-extrabold text-muted-foreground"> – </Text>{t.lost}</Numeric>
          <View className="w-24 items-center gap-1"><Face name={f.username} src={f.avatar} size={30} /><Text numberOfLines={1} className="text-sm font-bold">{f.username}</Text><Text className="text-[11px] text-muted-foreground">{plural(t.lost, "win")}</Text></View>
        </View>
        </Column><Column split={split}>
        {items.length || last ? <Caption className="pt-1">{tr("Waiting for you")}</Caption> : null}
        {items.map(w => <Offer key={w.key} lead={w.lead} title={w.text} action={w.label} accent={w.accent} run={w.run} />)}
        {c && last ? <Offer lead={eventName(last.event)} title={tr("A rematch?")} sub={formatText(last)} action={tr("Launch")} accent={false}
          run={() => void community.battle(c.id, { event: last.event, points: last.points, sets: last.sets, opponentId: null })} /> : null}
      </Column></Columns></ScrollView>}
    {c ? <BattleSheet conversation={c} open={battle} onClose={() => setBattle(false)} /> : null}
    <Sheet open={history} onClose={() => setHistory(false)} title={tr("History")} scroll>
      {!messages ? <ListSkeleton rows={2} /> : !battles.length ? <Empty icon={Swords} title={tr("No battles yet")} className="flex-none p-4" /> : <BattleLines battles={battles} />}
    </Sheet>
  </View>;
}

/**
 * A group's page, pushed from the Community tab: its members in place of a score (invited by its organisers), a
 * battle, a tournament or a message to launch; its battles and its tournaments in the History sheet, editing or leaving
 * it in its menu. On a tablet its members go in a second column; `docked` beside the list on a wide screen, it keeps one
 * column and closes.
 */
export function GroupPage({ id, back, docked = false }: { id: number; back: () => void; docked?: boolean }) {
  useEffect(() => { void community.load(`group:${id}`); void community.load("conversations"); }, [id]);
  const g = community.groups.get(id), [editing, setEditing] = useState(false), [inviting, setInviting] = useState(false), [organising, setOrganising] = useState(false), [battle, setBattle] = useState(false),
    [history, setHistory] = useState(false),
    c = g && community.conversations?.find(x => x.id === g.conversationId);
  const run = organiser(g?.role), members = g?.members.filter(m => m.role !== "invited") ?? [], invited = g?.members.filter(m => m.role === "invited") ?? [],
    split = useLayout().tablet && !docked;
  return <View className="min-h-0 flex-1">
    <PushedBar title={tr("Group")} onBack={back} back={docked ? "close" : "back"}>
      {g ? <HeadButton icon={History} label={tr("History")} onPress={() => setHistory(true)} /> : null}
      {g ? <MoreMenu label={tr("More about {0}", { 0: g.name })}>
        {run ? <MenuItem icon={Pencil} onPress={() => setEditing(true)}>{tr("Edit the group")}</MenuItem> : null}
        {g.role === "owner" ? <MenuItem icon={Trash2} destructive onPress={() => void community.deleteGroup(g.id)}>{tr("Delete the group")}</MenuItem>
          : <MenuItem icon={LogOut} destructive onPress={() => void community.remove(g.id, me())}>{tr("Leave the group")}</MenuItem>}
      </MoreMenu> : null}
    </PushedBar>
    {!g ? <ListSkeleton className="px-4" /> : <ScrollView className="min-h-0 flex-1" contentContainerClassName={cn("gap-3 px-4 pb-4", split && "px-7")}><Columns split={split}><Column split={split}>
      <Head name={g.name}
        face={<View className="flex-row" importantForAccessibility="no-hide-descendants">
          {members.slice(0, 3).map((m, i) => <View key={m.id} className={cn("rounded-full border-[3px] border-background", i > 0 && "-ml-4")}><Face name={m.username} src={m.avatar} size={44} /></View>)}
        </View>} />
      <View className="flex-row gap-2">
        {c?.open !== false ? <Pill icon={Swords} text={tr("Battle")} tone={run ? "muted" : "primary"} disabled={!c} onPress={() => setBattle(true)} className="h-11 flex-1" /> : null}
        {run ? <Pill icon={Trophy} text={tr("New tournament")} tone="primary" onPress={() => setOrganising(true)} className="h-11 flex-[1.4]" /> : null}
        <Pill icon={MessageCircle} text={tr("Write")} onPress={() => community.host.navigate(communityUrl("messages/" + g.conversationId))} className="h-11 flex-1" />
      </View>
      {g.description ? <Text className="text-sm leading-relaxed text-muted-foreground">{g.description}</Text> : null}
      </Column><Column split={split}>
      <View className="flex-row items-center justify-between pt-1">
        <Caption>{`${tr("Members")} · ${members.length}`}</Caption>
        {run ? <TextLink accent onPress={() => setInviting(true)}>{tr("Invite")}</TextLink> : null}
      </View>
      <View className="-mx-2 gap-0.5">{[...members, ...invited].map(m => <Member key={m.id} g={g} m={m} leave={() => {}} />)}</View>
    </Column></Columns></ScrollView>}
    {g ? <>
      <Sheet open={history} onClose={() => setHistory(false)} title={tr("History")} scroll>
        <Caption>{tr("Battles of the group")}</Caption>
        {g.battles.length ? <BattleLines battles={g.battles.map(b => community.card(b))} group /> : <Text className="text-[13px] text-muted-foreground">{tr("No battles yet")}</Text>}
        <Caption>{tr("Tournaments")}</Caption>
        {!g.tournaments.length ? <Text className="text-[13px] text-muted-foreground">{tr("No tournament yet")}</Text>
          : g.tournaments.map(t => <TournamentChatCard key={t.id} tournament={t} />)}
      </Sheet>
      <EditGroupSheet group={g} open={editing} onClose={() => setEditing(false)} />
      <InviteSheet g={g} open={inviting} onClose={() => setInviting(false)} />
      <TournamentSheet group={g} open={organising} onClose={() => setOrganising(false)} />
      {c ? <BattleSheet conversation={c} group={g} open={battle} onClose={() => setBattle(false)} /> : null}
    </> : null}
  </View>;
}
