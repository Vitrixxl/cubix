/**
 * Conversations: one inbox of friends and groups (its title with the requests, the friends and a new group; a search;
 * filters; the group invitations as envelopes on top), and one conversation read as a transcript with its battles and
 * tournaments as cards, what waits for the account there listed under its header, and the box to write. Its header
 * launches a battle (and, in a group its organisers run, a tournament) and opens the details. The kit is chat.tsx,
 * shared with coaching.
 */
import { useEffect, useMemo, useState } from "react";
import { MessagesSquare, PanelRight, SearchX, UserPlus, Users } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar, Segmented, plural } from "../ui";
import { Empty, LINK, LINK_ACCENT, ListSkeleton, NUMERIC, Tip } from "../base";
import { relative, time } from "../coaching/parts";
import { Bubble, ChatClosed, ChatHeader, Composer, ConversationList as List, ConversationRow as Row, LIST, MessageList } from "../chat";
import { cardText, community, communityUrl, eventName, matchUrl, seatIn, type Conversation, type Message } from "./client";
import { BattleCard, TournamentChatCard } from "./cards";
import { BattleDialog, TournamentDialog, NewGroupDialog, Requests } from "./dialogs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { tr } from "../../../src/client/i18n";

/** A group's face where a person has an avatar: its mark on a quiet disc. */
export function GroupMark({ size = 40 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-accent text-primary" style={{ width: size, height: size }} aria-hidden="true">
      <Users className={size > 30 ? "size-4" : "size-3.5"} />
    </span>
  );
}

export const title = (c: Conversation) => (c.kind === "group" ? c.group!.name : c.with!.username);
export const organiser = (role: string | undefined) => role === "owner" || role === "admin";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "direct", label: "Friends" },
  { id: "group", label: "Groups" },
];

/**
 * The inbox: its title with the requests waiting, the friends and a new group; then the search, the filters (all,
 * unread, friends, groups), the groups the account is invited to as envelopes, and every conversation, the latest first.
 */
export function ConversationList({ id, onFriends, className }: { id: number | null; onFriends: () => void; className?: string }) {
  useEffect(() => {
    void community.load("conversations");
  }, []);
  const list = community.conversations,
    invitations = community.me?.invitations ?? [],
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    unread = list?.filter((c) => c.unread).length ?? 0,
    shown = useMemo(() => {
      const q = query.trim().toLowerCase();
      return list?.filter((c) => (filter === "all" || (filter === "unread" ? c.unread > 0 : c.kind === filter)) && (!q || title(c).toLowerCase().includes(q)));
    }, [list, query, filter]);
  return (
    <List
      head={
        <>
          <h1 className="mr-auto text-2xl font-extrabold tracking-[-0.02em]">{tr("Messages")}</h1>
          <Requests />
          <Tip content={tr("Friends")}>
            <Button variant="outline" size="icon" aria-label={tr("Friends")} onClick={onFriends} data-action="community:friends">
              <UserPlus />
            </Button>
          </Tip>
          <NewGroupDialog
            trigger={
              <Tip content={tr("New group")}>
                <Button variant="outline" size="icon" aria-label={tr("New group")} data-action="community:new-group">
                  <MessagesSquare />
                </Button>
              </Tip>
            }
          />
        </>
      }
      query={query}
      onQuery={setQuery}
      top={
        <>
          <Segmented
            value={filter}
            onChange={setFilter}
            label="Conversations"
            action="conversations:filter:"
            options={FILTERS.map((f) => (f.id === "unread" && unread ? { ...f, count: unread } : f))}
            className="mx-3 flex-nowrap self-start"
          />
          {invitations.length > 0 && !query && (
            <ul className="flex shrink-0 flex-col gap-2 px-3" aria-label={tr("Invitations")}>
              {invitations.map((g) => (
                <li key={g.id} className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-dashed border-warning/45 px-3.5 py-3 text-[13px] text-muted-foreground" data-invitation={g.id}>
                  <span>
                    {tr("{0} invites you to the group", { 0: g.invitedBy })} <b className="font-bold text-foreground">{g.name}</b> · <span className={NUMERIC}>{plural(g.members, "member")}</span>
                  </span>
                  <span className="flex gap-4">
                    <button type="button" className={LINK_ACCENT} aria-label={tr("Join {0}", { 0: g.name })} onClick={() => void community.join(g.id)}>
                      {tr("Join")}
                    </button>
                    <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={() => void community.remove(g.id, s.user.id)}>
                      {tr("Decline")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      }
      className={className}
      data-slot="conversation-list"
    >
      {!shown ? (
        <ListSkeleton />
      ) : !shown.length ? (
        query || filter !== "all" ? (
          <Empty icon={SearchX} title={query ? "No conversation by that name." : "Nothing new"} />
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
    words = last ? (last.card ? cardText(last) : last.body) : tr("No message yet"),
    members = c.kind === "group" ? community.me?.groups.find((g) => g.id === c.group!.id)?.members : undefined;
  return (
    <Row
      to={communityUrl("messages/" + c.id)}
      active={active}
      face={c.kind === "group" ? <GroupMark size={36} /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={36} />}
      name={title(c)}
      tag={members}
      at={last?.at}
      preview={last ? (last.mine ? tr("You: {0}", { 0: words }) : c.kind === "group" ? `${last.from}: ${words}` : words) : words}
      // A battle or a tournament not seen yet waits for the account.
      act={!!last?.card && c.unread > 0}
      unread={c.unread}
    />
  );
}

/**
 * One conversation: its header (who, what to launch, the details), what waits for the account in it, its messages
 * newest at the bottom split by day, read while on screen, then the box to write.
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
        face={c.kind === "group" ? <GroupMark size={40} /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={40} />}
        title={title(c)}
        sub={c.kind === "group" ? (members !== undefined ? plural(members, "member") : tr("Group")) : friend ? tr("Friends since {0}", { 0: relative(friend.since) }) : tr("No longer friends")}
        onOpen={onDetails}
      >
        {c.open && <BattleDialog conversation={c} group={group} />}
        {group && organiser(group.role) && <TournamentDialog group={group} />}
        <Tip content={details ? tr("Hide the details") : tr("Show the details")}>
          <Button variant={details ? "secondary" : "outline"} size="icon" aria-label={tr("Details")} aria-pressed={details} onClick={onDetails} data-action="conversation:details">
            <PanelRight />
          </Button>
        </Tip>
      </ChatHeader>
      <Agenda messages={messages} />
      <MessageList
        key={c.id}
        messages={messages}
        me={s.user.id}
        event={(m) => (m.match ? <BattleCard match={m.match} /> : m.tournament ? <TournamentChatCard tournament={m.tournament} /> : null)}
        bubble={(m) => <Bubble at={m.createdAt}>{m.body}</Bubble>}
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

export type Waiting = { key: string; lead: React.ReactNode; text: React.ReactNode; label: string; run: () => void; accent: boolean };
/** What waits for the account in a conversation, the latest first: battles to take or play, tournaments to enter or play. */
export function waiting(messages: Message[]) {
  const me = s.user.id,
    out: Waiting[] = [];
  for (const message of [...messages].reverse()) {
    if (message.match) {
      const m = community.card(message.match),
        seat = seatIn(m, me),
        lead = eventName(m.event),
        key = "m" + m.id;
      if (m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)))
        out.push({ key, lead, text: m.players[1] ? tr("{0} challenges you", { 0: m.players[0]?.username }) : tr("{0} waits for an opponent", { 0: m.players[0]?.username }), label: tr("Accept"), run: () => void community.acceptBattle(m), accent: true });
      else if (m.status === "waiting" && seat === 0) out.push({ key, lead, text: tr("Your battle waits"), label: tr("Call off"), run: () => void community.cancelBattle(m), accent: false });
      else if ((m.status === "ready" || m.status === "live") && seat !== null) out.push({ key, lead, text: tr("Your battle is on"), label: tr("Play"), run: () => go(matchUrl(m.id)), accent: true });
    } else if (message.tournament) {
      const t = community.summary(message.tournament),
        key = "t" + t.id,
        left = t.maxPlayers ? t.maxPlayers - t.players : null;
      if (t.myMatch) out.push({ key, lead: t.name, text: tr("Your match is ready"), label: tr("Play your match"), run: () => go(matchUrl(t.myMatch!)), accent: true });
      else if (t.status === "open" && !t.registered && left !== 0)
        out.push({ key, lead: time(t.startsAt), text: left ? `${t.name} · ${tr("{0} places left", { 0: left })}` : t.name, label: tr("Register"), run: () => void community.register(t.id, true), accent: true });
    }
  }
  return out;
}

/** What waits for the account here, in a line under the header: each thing in a few words and its step. Nothing when nothing waits. */
function Agenda({ messages }: { messages: Message[] | undefined }) {
  const items = messages ? waiting(messages) : [];
  if (!items.length) return null;
  return (
    <section className="flex shrink-0 items-center gap-x-6 gap-y-1 overflow-x-auto border-y border-muted px-5 py-2.5 text-[13px] whitespace-nowrap text-muted-foreground [scrollbar-width:none]" aria-label={tr("Waiting for you here")} data-slot="agenda">
      <span className="text-xs font-bold">{tr("Waiting for you here")}</span>
      {items.slice(0, 4).map((w) => (
        <span key={w.key} className="flex items-center gap-2">
          <b className={cn(NUMERIC, "font-bold text-foreground")}>{w.lead}</b>
          {w.text}
          <button type="button" className={w.accent ? LINK_ACCENT : LINK} onClick={w.run}>
            {w.label}
          </button>
        </span>
      ))}
    </section>
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
