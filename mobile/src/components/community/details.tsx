import { Crown, LogOut, MessageSquare, Pencil, Plus, Shield, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { eventName, scoreOf, tournamentUrl, type Conversation, type Group, type Match } from "../../../../src/client/lib/community";
import { plural } from "../../../../src/client/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { community } from "../../lib/social";
import { Empty, Figure, Label, MenuItem, MoreMenu, Numeric, SectionHead } from "../layout";
import { Sheet, SheetInput } from "../Sheet";
import { Face, day, relative } from "../chat/kit";
import { EventTile, MatchStatusBadge, StatusBadge, Strip } from "../tournaments/format";
import { MatchSheet } from "./cards";
import { TournamentSheet } from "./launch";
import { GroupMark, organiser } from "./marks";
import { Field, FriendPicker, PersonRow, friendsOutside } from "./people";
import { tr } from "../../../../src/client/i18n";
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
/** A quiet button of the details: an icon and a word. */
function Quiet({ icon, label, onPress, danger }: { icon: typeof Plus; label: string; onPress: () => void; danger?: boolean }) {
  return <Button variant="ghost" size="sm" className={cn("h-10 rounded-lg px-2.5", danger && "justify-start")} onPress={onPress}>
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
      <Numeric className="text-xs text-muted-foreground">{tr("Created {0} · {1}", { 0: day(g.createdAt), 1: plural(members.length, "member") })}</Numeric>
      {run ? <Quiet icon={Pencil} label={tr("Edit")} onPress={() => setEditing(true)} /> : null}
    </View>
    <Part title={tr("Members")} count={members.length} action={run ? <Quiet icon={UserPlus} label={tr("Invite")} onPress={() => setInviting(true)} /> : null}>
      <View className="-mx-2 gap-0.5">{[...members, ...invited].map(m => <Member key={m.id} g={g} m={m} leave={leave} />)}</View>
    </Part>
    <Part title={tr("Tournaments")} count={g.tournaments.length} action={run ? <Quiet icon={Plus} label={tr("Organise")} onPress={() => setOrganising(true)} /> : null}>
      {!g.tournaments.length ? <Empty className="flex-none p-3">{run ? tr("No tournament yet: organise the first one.") : tr("No tournament yet. The group's owner and admins organise them.")}</Empty>
        : <View className="-mx-2 gap-0.5">{g.tournaments.map(t => <DetailRow key={t.id} event={t.event} title={t.name} label={tr("Open {0}", { 0: t.name })}
          detail={t.status === "finished" && t.winner ? tr("Won by {0}", { 0: t.winner.username }) : `${day(t.startsAt)} · ${plural(t.players, "player")}`}
          trailing={<StatusBadge t={t} />} onPress={() => { leave(); community.host.navigate(tournamentUrl(t.id)); }} />)}</View>}
    </Part>
    <Part title={tr("Battles")} count={g.battles.length}>
      <Battles battles={g.battles} empty={tr("No battle yet: launch one from the top of the conversation.")} />
    </Part>
    <View className="-mx-5 border-t border-border px-3 pt-3">
      {g.role !== "owner"
        ? <Quiet icon={LogOut} label={tr("Leave the group")} danger onPress={() => void community.remove(g.id, me())} />
        : <Quiet icon={Trash2} label={tr("Delete the group")} danger onPress={() => void community.deleteGroup(g.id)} />}
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
  return <PersonRow p={m} name={<Text numberOfLines={1} className={cn("text-sm font-medium", m.role === "invited" && "text-muted-foreground")}>{self ? tr("You") : m.username}</Text>}
    detail={m.role === "invited" ? tr("Invited {0}", { 0: relative(m.joinedAt) }) : tr("Joined {0}", { 0: relative(m.joinedAt) })}>
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
  return <Sheet open={open} onClose={onClose} title={tr("Edit the group")} description={tr("Its members see the change at once.")}>
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
  return <Sheet open={open} onClose={onClose} title={tr("Invite to {0}", { 0: g.name })} description={tr("They join once they accept the invitation.")}>
    <FriendPicker friends={friendsOutside(g)} value={picked} onChange={setPicked} />
    <View className="gap-1.5">
      <Label>{tr("Or a player who is not your friend, by username:")}</Label>
      <View className="flex-row items-center gap-2">
        <View className="flex-1"><SheetInput value={name} onChangeText={setName} placeholder={tr("Username")} accessibilityLabel={tr("Invite a player")} autoCapitalize="none" autoCorrect={false}
          returnKeyType="send" onSubmitEditing={() => void byName()} /></View>
        <Button variant="outline" disabled={!name.trim()} className="h-11 rounded-lg" onPress={() => void byName()}><Text>{tr("Invite")}</Text></Button>
      </View>
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
function Battles({ battles, empty }: { battles: Match[]; empty: string }) {
  const [shown, setShown] = useState<Match | null>(null);
  if (!battles.length) return <Empty className="flex-none p-3">{empty}</Empty>;
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
      <Text className="text-xs text-muted-foreground">{friend ? tr("Friends since {0}", { 0: day(friend.since) }) : tr("No longer friends")}</Text>
    </View>
    <Part title={tr("Your battles")} count={battles.length}>
      {done.length ? <Strip className="mb-1">
        <Figure label={tr("Won")} value={won} tone="good" className="w-1/3" />
        <Figure label={tr("Lost")} value={done.length - won} tone="bad" className="w-1/3" />
        <Figure label={tr("Played")} value={done.length} className="w-1/3" />
      </Strip> : null}
      <Battles battles={battles} empty={tr("No battle yet: challenge {0} from the top of the conversation.", { 0: other.username })} />
    </Part>
    {friend ? <View className="-mx-5 border-t border-border px-3 pt-3">
      <Quiet icon={UserMinus} label={tr("Remove from friends")} danger onPress={() => void community.removeFriend(other.id)} />
    </View> : null}
  </>;
}
