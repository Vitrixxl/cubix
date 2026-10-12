import * as Clipboard from "expo-clipboard";
import { useSetAtom } from "jotai";
import { Check, Copy, MessageSquare, Plus, Search, Share2, UserPlus, UserRoundX, Users } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { Conversation, Group, Match, Person } from "../../../../src/client/lib/community";
import { community } from "../../lib/social";
import { routeAtom } from "../../state";
import { Empty, ListSkeleton, Numeric, SearchField, Segmented } from "../layout";
import { Sheet, SheetInput, SheetScrollView } from "../Sheet";
import { Face, day, relative } from "../chat/kit";
import { waiting } from "./cards";
import { Caption, Dashed, GroupMark, Pill, TextLink } from "./marks";
import { tr } from "../../../../src/client/i18n";

/**
 * The people of the community (the web's community/people.tsx and dialogs.tsx): the Community tab's list (the requests
 * waiting, the friends with the score of your battles, the groups, the players found by name, the link that adds the
 * account), and the sheets around it: adding a friend, the requests, a new group with the friends to invite, and the
 * request a shared link opens.
 */

const me = () => community.host.account();

/** The address of a friend's page (`u`) or a group's (`g`) under the Community tab. */
export const peopleView = (kind: "u" | "g", id: string | number) => `people/${kind}/${id}`;
/** The direct conversation with a player, if there is one. */
export const directWith = (id: string) => community.conversations?.find(c => c.kind === "direct" && c.with?.id === id);
/** The battles of a conversation, from its cards, the latest first. */
export const battlesIn = (c: Conversation | undefined) => (c ? community.messages.get(c.id) ?? [] : []).filter(m => m.match).map(m => community.card(m.match!)).reverse();
/** The account's wins and losses among battles played. */
export function tally(battles: Match[]) {
  const done = battles.filter(b => b.status === "done"), won = done.filter(b => b.winner === me().id).length;
  return { won, lost: done.length - won, played: done.length };
}

/**
 * A player in a list, the same everywhere (members, players found, friends to pick): the face, the name, a line under
 * it, and what can be done on the right. `face` stands in for the avatar (a group's mark), `lead` comes before it (a tick).
 */
export function PersonRow({ p, name, face, detail, lead, children, onPress, selected, className }: {
  p?: Person; name?: ReactNode; face?: ReactNode; detail?: string; lead?: ReactNode; children?: ReactNode; onPress?: () => void; selected?: boolean; className?: string;
}) {
  const body = <>
    {lead}
    {face ?? <Face name={p?.username} src={p?.avatar} size={36} />}
    <View className="min-w-0 flex-1">
      {typeof (name ?? p?.username) === "string" || name == null ? <Text numberOfLines={1} className="text-[15px] font-bold">{name ?? p?.username}</Text> : name}
      {detail ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Text> : null}
    </View>
    {children ? <View className="shrink-0 flex-row items-center gap-1">{children}</View> : null}
  </>;
  const row = cn("min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-1.5", className);
  return onPress
    ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={p?.username} onPress={onPress} className={cn(row, "active:bg-muted/60", selected && "bg-primary/10")}>{body}</Pressable>
    : <View className={row}>{body}</View>;
}

/** A search field inside a sheet, which the sheet lifts over the keyboard. */
export function SheetSearch({ value, onChangeText, placeholder, label, autoFocus }: { value: string; onChangeText: (text: string) => void; placeholder: string; label?: string; autoFocus?: boolean }) {
  return <View className="justify-center">
    <SheetInput value={value} onChangeText={onChangeText} placeholder={placeholder} accessibilityLabel={label ?? placeholder} autoCapitalize="none" autoCorrect={false} autoFocus={autoFocus}
      returnKeyType="search" className="pl-10" />
    <View pointerEvents="none" className="absolute left-3"><Icon as={Search} size={17} className="text-muted-foreground" /></View>
  </View>;
}

type Found = Person & { relation: "friend" | "incoming" | "outgoing" | "none" };
const RELATION = { none: "", friend: "Already your friend", incoming: "Wants to be your friend", outgoing: "Request sent" } as const;

/** What can be done with a player found by name, in a word: add, accept, write; nothing once asked. */
export function RelationAction({ p, onMessage }: { p: Found; onMessage?: () => void }) {
  if (p.relation === "outgoing") return null;
  return <TextLink accent={p.relation !== "friend"} label={`${p.relation === "none" ? tr("Add") : p.relation === "incoming" ? tr("Accept") : tr("Write")} ${p.username}`}
    onPress={async () => {
      if (p.relation === "none") void community.addFriend(p.username);
      else if (p.relation === "incoming") void community.acceptFriend(p.id);
      else if (await community.message(p.id)) onMessage?.();
    }}>{p.relation === "none" ? tr("Add") : p.relation === "incoming" ? tr("Accept") : tr("Write")}</TextLink>;
}

/** Players whose name starts with what is typed, a moment after the last key; found again as relations change. */
function useFound(query: string) {
  const [found, setFound] = useState<Found[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) return void setFound(null);
    const timer = setTimeout(() => void community.search(q).then(setFound), 200);
    return () => clearTimeout(timer);
  }, [query, community.me]);
  return found;
}

/** The link that adds the account as a friend, on a card: copied or shared in a tap. */
function ShareLink() {
  const link = community.shareLink(), [copied, setCopied] = useState(false);
  return <View accessibilityLabel={tr("Your link")} className="flex-row items-center gap-2 rounded-2xl bg-card py-2.5 pr-2.5 pl-3.5">
    <View className="min-w-0 flex-1">
      <Text className="text-[11px] text-muted-foreground">{tr("Your link · whoever opens it adds you")}</Text>
      <Text numberOfLines={1} selectable className="text-sm font-bold">{link.replace(/^https?:\/\//, "")}</Text>
    </View>
    <Pill icon={copied ? Check : Copy} text={copied ? tr("Copied") : tr("Copy")} tone="soft" onPress={() => void Clipboard.setStringAsync(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    })} />
    <Pill icon={Share2} label={tr("Share")} onPress={() => void Share.share({ title: tr("Qbix"), message: tr("Add me on Qbix {0}", { 0: link }), url: link }).catch(() => {})} />
  </View>;
}

const FILTERS = ["all", "friends", "groups", "requests"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The Community tab: the search (a friend, a group or any player) and a new group, the filters, then the requests
 * waiting, the friends with the score of your battles and the groups, each opening its page; the link to share at the foot.
 */
export function Contacts({ onNewGroup }: { onNewGroup: () => void }) {
  const m = community.me, [query, setQuery] = useState(""), [filter, setFilter] = useState<Filter>("all"), found = useFound(query), q = query.trim().toLowerCase(),
    friends = (m?.friends ?? []).filter(f => f.username.toLowerCase().includes(q)),
    groups = (m?.groups ?? []).filter(g => g.name.toLowerCase().includes(q)),
    requests = m ? m.incoming.length + m.invitations.length + m.outgoing.length : 0,
    // Players found on Qbix who are not friends already (those show in the list).
    strangers = found?.filter(p => p.relation !== "friend");
  useEffect(() => { void community.load("conversations"); }, []);
  // ponytail: one request per friend for the score in the list; a count from the server when friends run to hundreds.
  useEffect(() => {
    for (const c of community.conversations ?? []) if (c.kind === "direct" && !community.messages.has(c.id)) void community.load(`messages:${c.id}`);
  }, [community.conversations]);
  return <View className="min-h-0 flex-1 gap-2.5 px-4 pt-3 pb-2">
    <View className="flex-row items-center gap-2">
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("A friend, a group or a Qbix player")} className="min-w-0 flex-1" />
      <Pill icon={Plus} text={tr("Group")} label={tr("New group")} tone="soft" onPress={onNewGroup} className="h-11" />
    </View>
    <Segmented label={tr("Contacts")} value={filter} onChange={setFilter} options={[
      { id: "all", label: tr("All") },
      { id: "friends", label: tr("Friends"), count: m?.friends.length },
      { id: "groups", label: tr("Groups"), count: m?.groups.length },
      { id: "requests", label: tr("Requests"), count: requests, accent: true },
    ]} />
    {!m ? <ListSkeleton className="flex-1" /> : <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2 pb-2" keyboardShouldPersistTaps="handled">
      {q && strangers ? <Part title={tr("On Qbix · “{0}”", { 0: query.trim() })}>
        {!strangers.length ? <Text className="px-1 text-[13px] text-muted-foreground">{tr("No other player by that name.")}</Text>
          : strangers.map(p => <PersonRow key={p.id} p={p} detail={RELATION[p.relation] ? tr(RELATION[p.relation]) : undefined}><RelationAction p={p} /></PersonRow>)}
      </Part> : null}
      {!q && (filter === "all" || filter === "requests") ? <Requests empty={filter === "requests"} /> : null}
      {filter === "all" || filter === "friends" ? <Part title={tr("Friends")} count={friends.length}>
        {!friends.length ? <Text className="px-1 text-[13px] text-muted-foreground">{q ? tr("No friend by that name.") : tr("No friend yet. Find players by their username, or share your link.")}</Text>
          : friends.map(f => <FriendRow key={f.id} f={f} />)}
      </Part> : null}
      {filter === "all" || filter === "groups" ? <Part title={tr("Groups")} count={groups.length}>
        {!groups.length ? <Text className="px-1 text-[13px] text-muted-foreground">{q ? tr("No group by that name.") : tr("No group yet: make one for your club or your friends.")}</Text>
          : groups.map(g => <Line key={g.id} view={peopleView("g", g.id)} face={<GroupMark size={44} />} name={g.name}
            sub={[plural(g.members, "member"), g.role === "owner" ? tr("you own it") : g.role === "admin" ? tr("you are admin") : ""].filter(Boolean).join(" · ")} />)}
      </Part> : null}
    </ScrollView>}
    <ShareLink />
  </View>;
}

/** A titled part of the list. */
function Part({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <View accessibilityLabel={title} className="gap-1 pt-1">
    <Caption className="px-1">{count ? `${title} · ${count}` : title}</Caption>
    {children}
  </View>;
}

/** A friend or a group in the list: the face, the name, a line under it, and on the right what stands between you; it opens their page. */
function Line({ view, face, name, sub, end, on = false }: { view: string; face: ReactNode; name: string; sub: string; end?: ReactNode; on?: boolean }) {
  const push = useSetAtom(routeAtom);
  return <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => push({ page: "community", view })}
    className={cn("min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-muted/60", on && "bg-accent")}>
    {face}
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-base font-bold tracking-tight">{name}</Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Text>
    </View>
    {end}
  </Pressable>;
}

function FriendRow({ f }: { f: Person & { since: number } }) {
  const c = directWith(f.id), messages = c && community.messages.get(c.id), t = tally(battlesIn(c)), waits = !!messages && waiting(messages).length > 0;
  return <Line view={peopleView("u", f.id)} on={waits} face={<Face name={f.username} src={f.avatar} size={44} />} name={f.username} sub={tr("Friends since {0}", { 0: day(f.since) })}
    end={messages ? <View className="items-end">
      {waits ? <Text className="text-[13px] font-extrabold text-primary">{tr("waiting")}</Text>
        : <Numeric className={cn("text-[15px] font-extrabold", t.won > t.lost ? "text-success" : t.won < t.lost ? "text-destructive" : "text-foreground")}>{t.played ? `${t.won}–${t.lost}` : "–"}</Numeric>}
      <Numeric className="text-[11px] font-semibold text-muted-foreground">{waits ? `${t.won}–${t.lost}` : t.played ? plural(t.played, "battle") : tr("none yet")}</Numeric>
    </View> : null} />;
}

/** What waits for an answer, each in a card of its own: friend requests, group invitations, then the requests sent. */
export function Requests({ empty, onDone }: { empty: boolean; onDone?: () => void }) {
  const m = community.me;
  if (!m) return null;
  const count = m.incoming.length + m.invitations.length;
  if (!count && !m.outgoing.length) return empty ? <Empty icon={Check} className="flex-none p-6">{tr("Nothing waiting. Requests and invitations show here.")}</Empty> : null;
  return <Part title={tr("Requests")} count={count}>
    <View className="gap-2">
      {m.incoming.map(p => <View key={p.id} className="gap-2.5 rounded-2xl bg-card p-2.5">
        <View className="flex-row items-center gap-2.5">
          <Face name={p.username} src={p.avatar} size={30} />
          <Text className="min-w-0 flex-1 text-sm"><Text className="text-sm font-bold">{p.username}</Text> {tr("wants to be your friend")} <Text className="text-sm text-muted-foreground">· {relative(p.at)}</Text></Text>
        </View>
        <View className="flex-row gap-2">
          <Pill text={tr("Accept")} label={tr("Accept {0}", { 0: p.username })} tone="primary" onPress={() => void community.acceptFriend(p.id)} className="flex-1" />
          <Pill text={tr("Decline")} label={tr("Decline {0}", { 0: p.username })} onPress={() => void community.removeFriend(p.id)} className="flex-1" />
        </View>
      </View>)}
      {m.invitations.map(g => <Dashed key={g.id}>
        <View className="flex-row items-start gap-2.5">
          <GroupMark size={30} />
          <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">{tr("{0} invites you to the group", { 0: g.invitedBy })} <Text className="text-[13px] font-bold text-foreground">{g.name}</Text> · {plural(g.members, "member")}</Text>
        </View>
        <View className="flex-row gap-4 pl-10">
          <TextLink accent label={tr("Join {0}", { 0: g.name })} onPress={() => { onDone?.(); void community.join(g.id); }}>{tr("Join")}</TextLink>
          <TextLink onPress={() => void community.remove(g.id, me().id)}>{tr("Decline")}</TextLink>
        </View>
      </Dashed>)}
      {m.outgoing.map(p => <Dashed key={p.id} quiet className="flex-row items-center gap-2.5 py-1.5">
        <Face name={p.username} src={p.avatar} size={30} />
        <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">{tr("Sent to")} <Text className="text-[13px] font-bold text-foreground">{p.username}</Text> · {relative(p.at)}</Text>
        <TextLink onPress={() => void community.removeFriend(p.id)}>{tr("Take back")}</TextLink>
      </Dashed>)}
    </View>
  </Part>;
}

/** The requests in a sheet, from the Messages tab's row. */
export function RequestsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title={tr("Requests")} hideTitle scroll>
    <Requests empty onDone={onClose} />
  </Sheet>;
}

/** Adding a friend: players found by their username, or the account's link to share. */
export function AddFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(""), found = useFound(query);
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  return <Sheet open={open} onClose={onClose} title={tr("Add a friend")} description={tr("Find players by their username, or share your link.")} contentClassName="gap-4">
    <SheetSearch value={query} onChangeText={setQuery} placeholder={tr("Username")} label={tr("Search players")} />
    {found && (!found.length
      ? <Empty icon={UserRoundX} className="flex-none p-4">{tr("No player by that name.")}</Empty>
      : <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="-mx-2 gap-0.5">
        {found.map(p => <PersonRow key={p.id} p={p} detail={RELATION[p.relation] ? tr(RELATION[p.relation]) : undefined}><RelationAction p={p} onMessage={onClose} /></PersonRow>)}
      </SheetScrollView>)}
    {!found ? <ShareLink /> : null}
  </Sheet>;
}

/** Friends to tick, found by name: who to invite to a group. */
export function FriendPicker({ friends, value, onChange }: { friends: Person[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState(""), shown = friends.filter(f => f.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (!friends.length) return <Empty icon={Users} className="flex-none rounded-lg border border-border p-4">{tr("Add friends first: you invite them from here.")}</Empty>;
  return <View className="min-h-0 shrink gap-2">
    <SheetSearch value={query} onChangeText={setQuery} placeholder={tr("Find a friend")} />
    {!shown.length ? <Empty className="flex-none rounded-lg border border-border p-4">{tr("No friend by that name.")}</Empty>
      : <View className="max-h-56 rounded-lg border border-border"><SheetScrollView contentContainerClassName="gap-0.5 p-1" accessibilityLabel={tr("Friends")}>
        {shown.map(f => {
          const checked = value.includes(f.id);
          return <PersonRow key={f.id} p={f} selected={checked} onPress={() => onChange(checked ? value.filter(id => id !== f.id) : [...value, f.id])}
            lead={<View className={cn("size-5 items-center justify-center rounded-md border", checked ? "border-primary bg-primary" : "border-input")}>
              {checked ? <Icon as={Check} size={13} strokeWidth={3} className="text-primary-foreground" /> : null}
            </View>} />;
        })}
      </SheetScrollView></View>}
    {value.length ? <Numeric className="text-xs text-muted-foreground">{tr("{0} invited", { 0: value.length })}</Numeric> : null}
  </View>;
}

/** A labelled field of a sheet's form. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View className="gap-1.5"><Text className="text-sm font-medium">{label}</Text>{children}</View>;
}

/** A new group: its name, what it is about, and the friends invited at once. */
export function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [invite, setInvite] = useState<string[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setDescription(""); setInvite([]); } }, [open]);
  return <Sheet open={open} onClose={onClose} title={tr("New group")} description={tr("A conversation for several friends, with its battles and tournaments. You run it.")}>
    <Field label={tr("Name")}><SheetInput value={name} onChangeText={setName} maxLength={40} accessibilityLabel={tr("Name")} /></Field>
    <Field label={tr("Description")}><SheetInput value={description} onChangeText={setDescription} maxLength={300} multiline accessibilityLabel={tr("Description")} className="min-h-16 py-2.5" textAlignVertical="top" /></Field>
    <Field label={tr("Invite friends")}><FriendPicker friends={community.me?.friends ?? []} value={invite} onChange={setInvite} /></Field>
    <Button disabled={busy || name.trim().length < 2} className="h-11 rounded-lg" onPress={async () => {
      setBusy(true);
      const done = await community.createGroup(name.trim(), description.trim(), invite);
      setBusy(false);
      if (done) onClose();
    }}><Text>{tr("Create the group")}</Text></Button>
  </Sheet>;
}

/** The request a shared link opens: the player behind it, and adding them. */
export function LinkSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const [player, setPlayer] = useState<Found | null | undefined>(undefined);
  useEffect(() => {
    void community.search(username).then(list => setPlayer(list.find(p => p.username.toLowerCase() === username.toLowerCase()) ?? null));
  }, [username, community.me]);
  const self = username.toLowerCase() === me().username.toLowerCase();
  return <Sheet open onClose={onClose} title={self ? tr("Your link") : tr("Add a friend")}
    description={self ? tr("This is the link others open to add you. Share it with your friends.") : tr("You opened a link to add this player.")}>
    {self ? null : player === undefined ? <ListSkeleton rows={1} />
      : !player ? <Empty icon={UserRoundX} className="flex-none p-4">{tr("No player is called {0}.", { 0: username })}</Empty>
        : <View className="-mx-2"><PersonRow p={player} detail={player.relation === "friend" ? tr("Already your friend") : player.relation === "outgoing" ? tr("Request sent") : player.relation === "incoming" ? tr("Wants to be your friend") : undefined}>
          {player.relation === "none" ? <Button size="sm" className="h-10 rounded-lg px-3" onPress={() => void community.addFriend(player.username)}><Icon as={UserPlus} size={15} /><Text>{tr("Add")}</Text></Button>
            : player.relation === "friend" ? <Button size="sm" variant="outline" className="h-10 rounded-lg px-3" onPress={async () => { if (await community.message(player.id)) onClose(); }}><Icon as={MessageSquare} size={15} /><Text>{tr("Message")}</Text></Button>
              : <RelationAction p={player} />}
        </PersonRow></View>}
  </Sheet>;
}

/** The friends not in a group yet, to invite. */
export const friendsOutside = (group: Group | undefined) => (community.me?.friends ?? []).filter(f => !group?.members.some(m => m.id === f.id));
