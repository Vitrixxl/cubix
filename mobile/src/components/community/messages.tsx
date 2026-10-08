import { Check, MessagesSquare, PanelRight, SearchX, Swords, Trophy } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { cardText, communityUrl, type Conversation, type Match, type Message } from "../../../../src/client/lib/community";
import { plural } from "../../../../src/client/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { community } from "../../lib/social";
import { Empty, HeadButton, ListSkeleton } from "../layout";
import { Bubble, ChatClosed, ChatHeader, Composer, ConversationList, ConversationRow, Face, MessageList, relative } from "../chat/kit";
import { BattleCard, MatchSheet, TournamentChatCard } from "./cards";
import { BattleSheet, TournamentSheet } from "./launch";
import { GroupMark, organiser, title } from "./marks";
import { tr } from "../../../../src/client/i18n";

/**
 * Conversations (the web's community/messages.tsx): the list, friends and groups together with the group invitations
 * on top, and one conversation with its messages, its battles and tournaments as cards, and the box to write. Its
 * header launches a battle (and, in a group its organisers run, a tournament) and opens the details.
 */

const open = (id: number) => community.host.navigate(communityUrl("messages/" + id));

/** Every conversation, the latest first, found by name; the groups the account is invited to come first. */
export function Conversations({ onNewGroup }: { onNewGroup: () => void }) {
  useEffect(() => { void community.load("conversations"); }, []);
  const list = community.conversations, invitations = community.me?.invitations ?? [], [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list?.filter(c => title(c).toLowerCase().includes(q)) : list;
  }, [list, query]);
  return <ConversationList query={query} onQuery={setQuery}>
    {invitations.length && !query ? <View accessibilityLabel={tr("Invitations")} className="gap-0.5 pb-1">
      {invitations.map(g => <View key={g.id} className="min-h-14 flex-row items-center gap-3 rounded-lg bg-primary/10 px-2.5 py-2">
        <GroupMark />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-base font-medium">{g.name}</Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">{tr("{0} invites you", { 0: g.invitedBy })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Join {0}", { 0: g.name })} onPress={() => void community.join(g.id)} className="size-10 items-center justify-center rounded-lg bg-primary active:bg-primary/85">
          <Icon as={Check} size={17} className="text-primary-foreground" />
        </Pressable>
      </View>)}
    </View> : null}
    {!shown ? <ListSkeleton className="px-2" />
      : !shown.length ? query ? <Empty icon={SearchX} title={tr("No conversation by that name.")} className="py-10" />
        : <Empty icon={MessagesSquare} title={tr("No conversation yet.")} className="py-10">{tr("Write to a friend, or make a group.")}<Button variant="outline" className="h-11 rounded-lg" onPress={onNewGroup}><Text>{tr("New group")}</Text></Button>
        </Empty>
        : shown.map(c => <Row key={c.id} c={c} />)}
  </ConversationList>;
}

function Row({ c }: { c: Conversation }) {
  const last = c.lastMessage, words = last ? (last.card ? cardText(last) : last.body) : tr("No message yet");
  return <ConversationRow onPress={() => open(c.id)} name={title(c)} at={last?.at} unread={c.unread}
    face={c.kind === "group" ? <GroupMark /> : <Face name={c.with!.username} src={c.with!.avatar} size={40} />}
    icon={last?.card === "match" ? Swords : last?.card === "tournament" ? Trophy : null}
    preview={last ? (last.mine ? `You: ${words}` : c.kind === "group" ? `${last.from}: ${words}` : words) : words} />;
}

/**
 * One conversation: its header (who, what to launch, the details), its messages newest at the bottom split by day,
 * read while on screen, then the box to write.
 */
export function Chat({ conversation: c, onDetails, back }: { conversation: Conversation; onDetails: () => void; back: () => void }) {
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
    members = group?.members.filter(m => m.role !== "invited").length,
    me = community.host.account().id;
  return <View className="min-h-0 flex-1">
    <ChatHeader back={{ label: tr("Conversations"), onPress: back }} onOpen={onDetails} openLabel={tr("Details")}
      face={c.kind === "group" ? <GroupMark size={32} /> : <Face name={c.with!.username} src={c.with!.avatar} size={32} />}
      title={title(c)}
      sub={c.kind === "group" ? (members !== undefined ? plural(members, "member") : tr("Group")) : friend ? tr("Friends since {0}", { 0: relative(friend.since) }) : tr("No longer friends")}>
      {c.open ? <HeadButton icon={Swords} label={tr("Battle")} onPress={() => setBattle(true)} /> : null}
      {group && organiser(group.role) ? <HeadButton icon={Trophy} label={tr("Tournament")} onPress={() => setTournament(true)} /> : null}
      <HeadButton icon={PanelRight} label={tr("Details")} onPress={onDetails} />
    </ChatHeader>
    <MessageList<Message> key={c.id} messages={messages} me={me} group={c.kind === "group"}
      event={m => m.match ? { icon: Swords, text: <Who m={m} did={tr("launched a battle")} />, body: <BattleCard match={m.match} onOpen={setShown} /> }
        : m.tournament ? { icon: Trophy, text: <Who m={m} did={tr("organised a tournament")} />, body: <TournamentChatCard tournament={m.tournament} /> } : null}
      bubble={(m, mine, last) => <Bubble mine={mine} last={last}>{m.body}</Bubble>}
      empty={<Empty icon={MessagesSquare} title={c.kind === "group" ? tr("Say hello to the group.") : tr("Say hello to {0}.", { 0: c.with!.username })}>{tr("Messages you write show here.")}</Empty>} />
    {c.open ? <Write c={c} /> : <ChatClosed>{tr("You are no longer friends with {0}", { 0: c.with?.username })}</ChatClosed>}
    <BattleSheet conversation={c} group={group} open={battle} onClose={() => setBattle(false)} />
    {group ? <TournamentSheet group={group} open={tournament} onClose={() => setTournament(false)} /> : null}
    <MatchSheet match={shown} onClose={() => setShown(null)} />
  </View>;
}

/** Who launched a battle or a tournament, before what they did. */
function Who({ m, did }: { m: Message; did: string }) {
  return <Text className="text-xs text-muted-foreground"><Text className={cn("text-xs font-medium text-foreground")}>{m.senderId === community.host.account().id ? tr("You") : m.sender.username}</Text> {did}</Text>;
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
