/**
 * Conversations: the list, friends and groups together with the group invitations on top, and one conversation with
 * its messages, its battles and tournaments as cards, and the box to write. Its header launches a battle (and, in a
 * group its organisers run, a tournament) and opens the details beside it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, MessagesSquare, PanelRight, Search, Send, Swords, Trophy, Users } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar, NUMERIC, plural } from "../ui";
import { Tip } from "../base";
import { Count, day, Nothing, PANEL, ROWS, RowLink, RowsSkeleton, relative, time } from "../coaching/parts";
import { cardText, community, communityUrl, type Conversation, type Message } from "./client";
import { BattleCard, TournamentChatCard } from "./cards";
import { BattleDialog, TournamentDialog, NewGroupDialog } from "./dialogs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";

/** A group's face beside its name, where a person has an avatar. */
export function GroupMark({ size = 36 }: { size?: number }) {
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
    <div className={cn(PANEL, "w-80 shrink-0", className)} data-slot="conversation-list">
      <div className="shrink-0 p-2 pb-1">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search conversations")} aria-label={tr("Search conversations")} />
        </InputGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {invitations.length > 0 && !query && (
          <ul className={ROWS} aria-label={tr("Invitations")}>
            {invitations.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-lg bg-primary/8 px-2.5 py-2.5" data-invitation={g.id}>
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
          <RowsSkeleton />
        ) : !shown.length ? (
          <Nothing>
            {query ? (
              tr("No conversation by that name.")
            ) : (
              <>
                <MessagesSquare className="size-6" />
                {tr("No conversation yet: write to a friend, or make a group.")}
                <NewGroupDialog />
              </>
            )}
          </Nothing>
        ) : (
          <ul className={ROWS} data-slot="conversations">
            {shown.map((c) => (
              <li key={c.id}>
                <ConversationRow c={c} active={c.id === id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  const last = c.lastMessage,
    words = last ? (last.card ? cardText(last) : last.body) : tr("No message yet");
  return (
    <RowLink to={communityUrl("messages/" + c.id)} active={active}>
      {c.kind === "group" ? <GroupMark /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={36} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{title(c)}</span>
          {last && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{relative(last.at)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground", last?.card && "flex items-center gap-1")}>
            {last?.card === "match" && <Swords className="size-3 shrink-0" />}
            {last?.card === "tournament" && <Trophy className="size-3 shrink-0" />}
            {last ? (last.mine ? tr("You: {0}", { 0: words }) : c.kind === "group" ? `${last.from}: ${words}` : words) : words}
          </span>
          <Count n={c.unread} />
        </span>
      </span>
    </RowLink>
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-sm" data-conversation={c.id}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
        {back && (
          <Button variant="ghost" size="icon" aria-label={tr("Conversations")} onClick={back} className="-ml-1">
            <ChevronLeft />
          </Button>
        )}
        <button type="button" onClick={onDetails} className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          {c.kind === "group" ? <GroupMark size={32} /> : <Avatar name={c.with!.username} src={c.with!.avatar} size={32} />}
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{title(c)}</span>
            <span className={cn(NUMERIC, "truncate text-xs text-muted-foreground")}>
              {c.kind === "group" ? (members !== undefined ? plural(members, "member") : tr("Group")) : friend ? tr("Friends since {0}", { 0: relative(friend.since) }) : tr("No longer friends")}
            </span>
          </span>
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {c.open && <BattleDialog conversation={c} group={group} />}
          {group && organiser(group.role) && <TournamentDialog group={group} />}
          <Tip content={details ? tr("Hide the details") : tr("Show the details")}>
            <Button variant={details ? "secondary" : "ghost"} size="icon" aria-label={tr("Details")} aria-pressed={details} onClick={onDetails} data-action="conversation:details">
              <PanelRight />
            </Button>
          </Tip>
        </span>
      </header>
      <Messages c={c} messages={messages} />
      <Composer c={c} />
    </div>
  );
}

function Messages({ c, messages }: { c: Conversation; messages: Message[] | undefined }) {
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, c.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3 md:px-4">
      {!messages ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="ml-auto h-8 w-1/3" />
          <Skeleton className="h-28 w-80 rounded-xl" />
        </div>
      ) : !messages.length ? (
        <Nothing>{c.kind === "group" ? tr("Say hello to the group.") : tr("Say hello to {0}.", { 0: c.with!.username })}</Nothing>
      ) : (
        messages.map((m, i) => {
          const mine = m.senderId === s.user.id,
            previous = messages[i - 1],
            newDay = !previous || day(previous.createdAt) !== day(m.createdAt),
            card = m.match || m.tournament,
            sameSender = !newDay && !card && !(previous?.match || previous?.tournament) && previous?.senderId === m.senderId && m.createdAt - previous.createdAt < 5 * 60_000;
          return (
            <div key={m.id} className="flex flex-col" data-message={m.id}>
              {newDay && <span className="my-2 self-center text-[11px] text-muted-foreground">{day(m.createdAt)}</span>}
              <div className={cn("flex max-w-[85%] flex-col gap-1 md:max-w-[75%]", mine ? "items-end self-end" : "items-start self-start", !sameSender && "mt-1.5")}>
                {!sameSender && (card || (!mine && c.kind === "group")) && (
                  <span className="px-1 text-[11px] text-muted-foreground">
                    {card ? (
                      <>
                        <span className="font-medium">{mine ? tr("You") : m.sender.username}</span> · {m.match ? tr("launched a battle") : tr("organised a tournament")} · {time(m.createdAt)}
                      </>
                    ) : (
                      <span className="font-medium">{m.sender.username}</span>
                    )}
                  </span>
                )}
                {m.match ? (
                  <BattleCard match={m.match} />
                ) : m.tournament ? (
                  <TournamentChatCard tournament={m.tournament} />
                ) : (
                  <span className={cn("rounded-2xl px-3 py-1.5 break-words whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted")} title={time(m.createdAt)}>
                    {m.body}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
      <div ref={end} />
    </div>
  );
}

function Composer({ c }: { c: Conversation }) {
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    if (await community.send(c.id, body)) setText("");
    setSending(false);
  }
  return (
    <form
      className="shrink-0 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          value={text}
          rows={1}
          maxLength={1000}
          disabled={!c.open}
          placeholder={c.open ? tr("Message") : tr("You are no longer friends with {0}", { 0: c.with?.username })}
          aria-label={tr("Message")}
          className="max-h-32 min-h-9"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" size="icon-xs" disabled={!text.trim() || sending || !c.open} aria-label={tr("Send")}>
            <Send />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
