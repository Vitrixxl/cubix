import { ChevronRight, MessagesSquare, PanelRight, SearchX, Swords, Trophy, UserPlus, UserRoundPlus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import { AppState, FlatList, Pressable, View } from "react-native";
import { cardText, communityUrl, type Conversation, type Match, type Message } from "../../../../src/client/lib/community";
import { plural } from "../../../../src/client/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../../hooks/useLayout";
import { community } from "../../lib/social";
import { replaceRouteAtom } from "../../state";
import { Empty, ListSkeleton, SearchField, Segmented } from "../layout";
import { Bubble, ChatClosed, ChatHeader, Composer, ConversationRow, Count, Face, MessageList, relative } from "../chat/kit";
import { BattleCard, MatchSheet, TournamentChatCard, WaitingLine, waiting } from "./cards";
import { BattleSheet, TournamentSheet } from "./launch";
import { Caption, Dashed, GroupMark, Pill, TextLink, organiser, title } from "./marks";
import { tr } from "../../../../src/client/i18n";

/**
 * Conversations (the web's community/messages.tsx): the inbox (search, a friend to add, a new group, filters, the
 * requests on one row, the group invitations, every conversation), and one conversation on a screen of its own: what
 * waits for the account there under its head, its messages as a transcript with its battles and tournaments as cards,
 * and the box to write. Its head launches a battle (and, in a group its organisers run, a tournament) and opens the
 * details.
 */

const open = (id: number) => community.host.navigate(communityUrl("messages/" + id));
const me = () => community.host.account().id;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "direct", label: "Friends" },
  { id: "group", label: "Groups" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/**
 * The inbox, the Messages tab: the search and its two actions, the filters, what waits for an answer, the conversations.
 * On a tablet in portrait what waits sits side by side; on a wide screen the inbox is a column beside the conversation
 * open (`selected`), which a row replaces rather than stacks.
 */
export function Inbox({ onAddFriend, onNewGroup, onRequests, selected }: { onAddFriend: () => void; onNewGroup: () => void; onRequests: () => void; selected?: number | null }) {
  useEffect(() => { void community.load("conversations"); }, []);
  const { tablet, wide } = useLayout(), replace = useSetAtom(replaceRouteAtom);
  const list = community.conversations, invitations = community.me?.invitations ?? [], [query, setQuery] = useState(""), [filter, setFilter] = useState<Filter>("all"),
    unread = list?.filter(c => c.unread).length ?? 0, row = tablet && !wide, cell = row ? "min-w-60 flex-1" : undefined;
  const pick = (id: number) => wide ? replace({ page: "community", view: "messages/" + id }) : open(id);
  const asks = !query ? <>
    <RequestsRow onPress={onRequests} className={cell} />
    {invitations.map(g => <Dashed key={g.id} className={cell}>
      <Text className="text-[13px] text-muted-foreground">{tr("{0} invites you to the group", { 0: g.invitedBy })} <Text className="text-[13px] font-bold text-foreground">{g.name}</Text> · {plural(g.members, "member")}</Text>
      <View className="flex-row gap-4">
        <TextLink accent label={tr("Join {0}", { 0: g.name })} onPress={() => void community.join(g.id)}>{tr("Join")}</TextLink>
        <TextLink onPress={() => void community.remove(g.id, me())}>{tr("Decline")}</TextLink>
      </View>
    </Dashed>)}
  </> : null, m = community.me, waits = !!m && m.incoming.length + m.outgoing.length + invitations.length > 0;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list?.filter(c => (filter === "all" || (filter === "unread" ? c.unread > 0 : c.kind === filter)) && (!q || title(c).toLowerCase().includes(q)));
  }, [list, query, filter]);
  return <View className={cn("min-h-0 flex-1 gap-2.5 px-4 pt-3", tablet && "px-7", wide && "pr-0")}>
    <View className="flex-row items-center gap-2">
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search conversations")} className="min-w-0 flex-1" />
      <Pill icon={UserPlus} label={tr("Add a friend")} onPress={onAddFriend} className="size-11" />
      <Pill icon={MessagesSquare} label={tr("New group")} onPress={onNewGroup} className="size-11" />
    </View>
    <Segmented label={tr("Conversations")} value={filter} onChange={setFilter}
      options={FILTERS.map(f => ({ id: f.id, label: tr(f.label), count: f.id === "unread" ? unread : undefined, accent: true }))} />
    {row && waits && asks ? <View className="flex-row flex-wrap gap-2.5">{asks}</View> : asks}
    {!shown ? <ListSkeleton />
      : !shown.length ? query || filter !== "all" ? <Empty icon={SearchX} title={query ? tr("No conversation by that name.") : tr("Nothing new")} />
        : <Empty icon={MessagesSquare} title={tr("No conversation yet.")}>{tr("Write to a friend, or make a group.")}<Button variant="outline" className="h-11 rounded-lg" onPress={onNewGroup}><Text>{tr("New group")}</Text></Button></Empty>
        : <FlatList data={shown} extraData={selected} keyExtractor={c => String(c.id)} className="-mx-1 min-h-0 flex-1" contentContainerClassName="gap-0.5 pb-2" keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Row c={item} onPress={() => pick(item.id)} on={item.id === selected} />} />}
  </View>;
}

/** The requests on one row, pinned over the conversations: who asked first and how many more; nothing when none waits. */
function RequestsRow({ onPress, className }: { onPress: () => void; className?: string }) {
  const m = community.me;
  if (!m || (!m.incoming.length && !m.outgoing.length)) return null;
  const first = m.incoming[0], more = m.incoming.length - 1,
    line = first ? tr("{0} wants to be your friend", { 0: first.username }) + (more > 0 ? " · " + tr("{0} more", { 0: more }) : "") : tr("Sent to {0}", { 0: m.outgoing.map(p => p.username).join(", ") });
  return <Pressable accessibilityRole="button" accessibilityLabel={tr("Requests")} onPress={onPress} className={cn("min-h-14 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-2 active:bg-muted/60", className)}>
    <View className="size-9 items-center justify-center rounded-xl bg-primary/15"><Icon as={UserRoundPlus} size={18} className="text-primary" /></View>
    <View className="min-w-0 flex-1">
      <Text className="text-sm font-bold">{tr("Requests")}</Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{line}</Text>
    </View>
    <Count n={m.incoming.length} />
    <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
  </Pressable>;
}

function Row({ c, onPress, on }: { c: Conversation; onPress: () => void; on: boolean }) {
  const last = c.lastMessage, words = last ? (last.card ? cardText(last) : last.body) : tr("No message yet"),
    members = c.kind === "group" ? community.me?.groups.find(g => g.id === c.group!.id)?.members : undefined;
  return <ConversationRow onPress={onPress} on={on} name={title(c)} at={last?.at} unread={c.unread} tag={members}
    // A battle or a tournament not seen yet waits for the account.
    act={!!last?.card && c.unread > 0}
    face={c.kind === "group" ? <GroupMark size={44} /> : <Face name={c.with!.username} src={c.with!.avatar} size={44} />}
    icon={last?.card === "match" ? Swords : last?.card === "tournament" ? Trophy : null}
    preview={last ? (last.mine ? tr("You: {0}", { 0: words }) : c.kind === "group" ? `${last.from}: ${words}` : words) : words} />;
}

/**
 * One conversation, a screen of its own: its head (who, a battle to launch, the details), what waits for the account
 * there, its messages newest at the bottom split by day, read while on screen, then the box to write.
 */
export function Chat({ conversation: c, onDetails, back }: { conversation: Conversation; onDetails: () => void; back?: () => void }) {
  const messages = community.messages.get(c.id), [battle, setBattle] = useState(false), [tournament, setTournament] = useState(false), [shown, setShown] = useState<Match | null>(null);
  useEffect(() => {
    void community.load(`messages:${c.id}`);
    if (c.kind === "group") void community.load(`group:${c.group!.id}`);
    community.open = c.id;
    const visible = AppState.addEventListener("change", state => { if (state === "active") community.read(c.id); });
    return () => {
      if (community.open === c.id) community.open = null;
      visible.remove();
    };
  }, [c.id]);
  useEffect(() => { if (messages && c.unread) community.read(c.id); }, [messages, c.unread]);
  const group = c.kind === "group" ? community.groups.get(c.group!.id) : undefined,
    friend = c.kind === "direct" ? community.me?.friends.find(f => f.id === c.with!.id) : undefined,
    members = group?.members.filter(m => m.role !== "invited").length;
  return <View className="min-h-0 flex-1">
    <ChatHeader back={back && { label: tr("Conversations"), onPress: back }} onOpen={onDetails} openLabel={tr("Details")}
      face={c.kind === "group" ? <GroupMark size={32} /> : <Face name={c.with!.username} src={c.with!.avatar} size={32} />}
      title={title(c)}
      sub={c.kind === "group" ? (members !== undefined ? plural(members, "member") : tr("Group")) : friend ? tr("Friends since {0}", { 0: relative(friend.since) }) : tr("No longer friends")}>
      {c.open ? <Pill icon={Swords} text={tr("Battle")} tone="soft" onPress={() => setBattle(true)} /> : null}
      {group && organiser(group.role) ? <Pill icon={Trophy} label={tr("Tournament")} onPress={() => setTournament(true)} /> : null}
      <Pill icon={PanelRight} label={tr("Details")} onPress={onDetails} />
    </ChatHeader>
    <Agenda messages={messages} />
    <MessageList<Message> key={c.id} messages={messages} me={me()}
      event={m => m.match ? <BattleCard match={m.match} onOpen={setShown} /> : m.tournament ? <TournamentChatCard tournament={m.tournament} /> : null}
      bubble={m => <Bubble>{m.body}</Bubble>}
      empty={<Empty icon={MessagesSquare} title={c.kind === "group" ? tr("Say hello to the group.") : tr("Say hello to {0}.", { 0: c.with!.username })}>{tr("Messages you write show here.")}</Empty>} />
    {c.open ? <Write c={c} /> : <ChatClosed>{tr("You are no longer friends with {0}", { 0: c.with?.username })}</ChatClosed>}
    <BattleSheet conversation={c} group={group} open={battle} onClose={() => setBattle(false)} />
    {group ? <TournamentSheet group={group} open={tournament} onClose={() => setTournament(false)} /> : null}
    <MatchSheet match={shown} onClose={() => setShown(null)} />
  </View>;
}

/** What waits for the account here, under the head; nothing when nothing waits. */
function Agenda({ messages }: { messages: Message[] | undefined }) {
  const items = messages ? waiting(messages) : [];
  if (!items.length) return null;
  return <View accessibilityLabel={tr("Waiting for you here")} className="gap-0.5 border-y border-border px-4 pt-2 pb-1">
    <Caption>{tr("Waiting for you here")}</Caption>
    {items.slice(0, 3).map(w => <WaitingLine key={w.key} w={w} />)}
  </View>;
}

function Write({ c }: { c: Conversation }) {
  const [text, setText] = useState(""), [sending, setSending] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    if (await community.send(c.id, body)) setText("");
    setSending(false);
  }
  return <Composer value={text} onChange={setText} onSend={() => void send()} sending={sending} label={tr("Message {0}", { 0: title(c) })} maxLength={1000} />;
}
