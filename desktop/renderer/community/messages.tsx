/**
 * Conversations: the list, friends and groups together with the group invitations on top, and one conversation with
 * its messages, its battles and tournaments as cards, and the box to write. Its header launches a battle (and, in a
 * group its organisers run, a tournament) and opens the details beside it. The kit is chat.tsx, shared with coaching.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, MessagesSquare, PanelRight, SearchX, Swords, Trophy, Users } from "lucide-react";
import { store as s } from "../store";
import { Avatar, plural } from "../ui";
import { Empty, ListSkeleton, Tip } from "../base";
import { relative } from "../coaching/parts";
import { Bubble, ChatClosed, ChatHeader, Composer, ConversationList as List, ConversationRow as Row, LIST, MessageList } from "../chat";
import { cardText, community, communityUrl, type Conversation } from "./client";
import { BattleCard, TournamentChatCard } from "./cards";
import { BattleDialog, TournamentDialog, NewGroupDialog } from "./dialogs";
import { Button } from "@/components/ui/button";
import { tr } from "../../../src/client/i18n";

/** A group's face beside its name, where a person has an avatar. */
export function GroupMark({ size = 40 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" style={{ width: size, height: size }} aria-hidden="true">
      <Users className={size > 30 ? "size-4" : "size-3.5"} />
    </span>
  );
}

export const title = (c: Conversation) => (c.kind === "group" ? c.group!.name : c.with!.username);
export const organiser = (role: string | undefined) => role === "owner" || role === "admin";

/** Every conversation, the latest first, found by name; the groups the account is invited to come first. */
export function ConversationList({ id, className }: { id: number | null; className?: string }) {
  useEffect(() => {
    void community.load("conversations");
  }, []);
  const list = community.conversations,
    invitations = community.me?.invitations ?? [],
    [query, setQuery] = useState(""),
    shown = useMemo(() => {
      const q = query.trim().toLowerCase();
      return q ? list?.filter((c) => title(c).toLowerCase().includes(q)) : list;
    }, [list, query]);
  return (
    <List query={query} onQuery={setQuery} className={className} data-slot="conversation-list">
      {invitations.length > 0 && !query && (
        <ul className={LIST} aria-label={tr("Invitations")}>
          {invitations.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-lg bg-primary/10 px-2.5 py-2" data-invitation={g.id}>
              <GroupMark />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{g.name}</span>
                <span className="truncate text-xs text-muted-foreground">{tr("{0} invites you", { 0: g.invitedBy })}</span>
              </span>
              <Tip content={tr("Join")}>
                <Button size="icon-sm" aria-label={tr("Join {0}", { 0: g.name })} onClick={() => void community.join(g.id)}>
                  <Check />
                </Button>
              </Tip>
            </li>
          ))}
        </ul>
      )}
      {!shown ? (
        <ListSkeleton />
      ) : !shown.length ? (
        query ? (
          <Empty icon={SearchX} title="No conversation by that name." />
        ) : (
          <Empty icon={MessagesSquare} title="No conversation yet.">
            {tr("Write to a friend, or make a group.")}
            <NewGroupDialog />
          </Empty>
        )
      ) : (
        <ul className={LIST} data-slot="conversations">
          {shown.map((c) => (
            <li key={c.id}>
              <ConversationRow c={c} active={c.id === id} />
            </li>
          ))}
        </ul>
      )}
    </List>
  );
}

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  const last = c.lastMessage,
    words = last ? (last.card ? cardText(last) : last.body) : tr("No message yet");
  return (
    <Row
      to={communityUrl("messages/" + c.id)}
      active={active}
      face={c.kind === "group" ? <GroupMark /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={40} />}
      name={title(c)}
      at={last?.at}
      icon={last?.card === "match" ? Swords : last?.card === "tournament" ? Trophy : null}
      preview={last ? (last.mine ? tr("You: {0}", { 0: words }) : c.kind === "group" ? `${last.from}: ${words}` : words) : words}
      unread={c.unread}
    />
  );
}

/**
 * One conversation: its header (who, what to launch, the details), its messages newest at the bottom split by day,
 * read while on screen, then the box to write.
 */
export function Chat({ conversation: c, details, onDetails, back }: { conversation: Conversation; details: boolean; onDetails: () => void; back?: () => void }) {
  const messages = community.messages.get(c.id);
  useEffect(() => {
    void community.load(`messages:${c.id}`);
    if (c.kind === "group") void community.load(`group:${c.group!.id}`);
    community.open = c.id;
    const visible = () => document.visibilityState === "visible" && community.read(c.id);
    document.addEventListener("visibilitychange", visible);
    return () => {
      if (community.open === c.id) community.open = null;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [c.id]);
  useEffect(() => {
    if (messages && c.unread) community.read(c.id);
  }, [messages, c.unread]);
  const group = c.kind === "group" ? community.groups.get(c.group!.id) : undefined,
    friend = c.kind === "direct" ? community.me?.friends.find((f) => f.id === c.with!.id) : undefined,
    members = group?.members.filter((m) => m.role !== "invited").length;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-conversation={c.id}>
      <ChatHeader
        back={back && { label: "Conversations", onClick: back }}
        face={c.kind === "group" ? <GroupMark size={32} /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={32} />}
        title={title(c)}
        sub={c.kind === "group" ? (members !== undefined ? plural(members, "member") : tr("Group")) : friend ? tr("Friends since {0}", { 0: relative(friend.since) }) : tr("No longer friends")}
        onOpen={onDetails}
      >
        {c.open && <BattleDialog conversation={c} group={group} />}
        {group && organiser(group.role) && <TournamentDialog group={group} />}
        <Tip content={details ? tr("Hide the details") : tr("Show the details")}>
          <Button variant={details ? "secondary" : "ghost"} size="icon" aria-label={tr("Details")} aria-pressed={details} onClick={onDetails} data-action="conversation:details">
            <PanelRight />
          </Button>
        </Tip>
      </ChatHeader>
      <MessageList
        key={c.id}
        messages={messages}
        me={s.user.id}
        group={c.kind === "group"}
        event={(m) => (m.match ? { icon: Swords, text: <Who m={m} did={tr("launched a battle")} />, body: <BattleCard match={m.match} /> } : m.tournament ? { icon: Trophy, text: <Who m={m} did={tr("organised a tournament")} />, body: <TournamentChatCard tournament={m.tournament} /> } : null)}
        bubble={(m, mine, last) => (
          <Bubble mine={mine} last={last} at={m.createdAt}>
            {m.body}
          </Bubble>
        )}
        empty={
          <Empty icon={MessagesSquare} title={c.kind === "group" ? tr("Say hello to the group.") : tr("Say hello to {0}.", { 0: c.with!.username })}>
            {tr("Messages you write show here.")}
          </Empty>
        }
      />
      {c.open ? <Write c={c} /> : <ChatClosed>{tr("You are no longer friends with {0}", { 0: c.with?.username })}</ChatClosed>}
    </div>
  );
}

/** Who launched a battle or a tournament, before what they did. */
function Who({ m, did }: { m: { senderId: string; sender: { username: string } }; did: string }) {
  return (
    <>
      <span className="font-medium text-foreground">{m.senderId === s.user.id ? tr("You") : m.sender.username}</span> {did}
    </>
  );
}

function Write({ c }: { c: Conversation }) {
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    if (await community.send(c.id, body)) setText("");
    setSending(false);
  }
  return <Composer value={text} onChange={setText} onSend={() => void send()} sending={sending} label={tr("Message {0}", { 0: title(c) })} maxLength={1000} />;
}
