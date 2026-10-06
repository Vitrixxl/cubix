/** Conversations with friends and groups: the list, and one conversation with its messages and the box to write. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessagesSquare, Send, Users } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar } from "../ui";
import { Count, day, Nothing, PANEL, ROWS, RowLink, RowsSkeleton, relative, time } from "../coaching/parts";
import { community, communityUrl, type Conversation } from "./client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";

export function Messages({ id }: { id: number | null }) {
  useEffect(() => {
    void community.load("conversations");
  }, []);
  const list = community.conversations,
    current = list?.find((c) => c.id === id);
  // The latest conversation opens when none is chosen.
  useEffect(() => {
    if (!id && list?.length) go(communityUrl("messages/" + list[0]!.id), true);
  }, [id, list?.length]);
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className={cn(PANEL, "w-80 shrink-0 overflow-y-auto")}>
        {!list ? (
          <RowsSkeleton />
        ) : !list.length ? (
          <Nothing>
            {tr("No conversation yet.")}<Button variant="outline" onClick={() => go(communityUrl("friends"))}>
              {tr("Find friends")}</Button>
          </Nothing>
        ) : (
          <ul className={ROWS} data-slot="conversations">
            {list.map((c) => (
              <li key={c.id}>
                <ConversationRow c={c} active={c.id === id} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={cn(PANEL, "min-w-0 flex-1")}>
        {current ? (
          <Chat conversation={current} />
        ) : (
          <Nothing>
            <MessagesSquare className="size-6" />
            {list && id ? tr("This conversation does not exist.") : tr("Your conversations open here.")}
          </Nothing>
        )}
      </div>
    </div>
  );
}

/** A group's face beside its name, where a person has an avatar. */
export function GroupMark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" style={{ width: size, height: size }} aria-hidden="true">
      <Users className="size-4" />
    </span>
  );
}

const title = (c: Conversation) => (c.kind === "group" ? c.group!.name : c.with!.username);

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  return (
    <RowLink to={communityUrl("messages/" + c.id)} active={active}>
      {c.kind === "group" ? (
        <GroupMark />
      ) : (
        <Avatar name={c.with!.username} src={c.with!.avatar} size={36} />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{title(c)}</span>
          {c.kind === "group" && <span className="shrink-0 text-[11px] text-muted-foreground">{tr("group")}</span>}
          {c.lastMessage && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{relative(c.lastMessage.at)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
            {c.lastMessage ? (c.lastMessage.mine ? tr("You: {0}", { 0: c.lastMessage.body }) : c.kind === "group" ? `${c.lastMessage.from}: ${c.lastMessage.body}` : c.lastMessage.body) : tr("No message yet")}
          </span>
          <Count n={c.unread} />
        </span>
      </span>
    </RowLink>
  );
}

/** One conversation: its messages, newest at the bottom, split by day, read while on screen; the box to write under. */
export function Chat({ conversation: c, head = true }: { conversation: Conversation; head?: boolean }) {
  const messages = community.messages.get(c.id);
  useEffect(() => {
    void community.load(`messages:${c.id}`);
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
  const end = useRef<HTMLDivElement>(null),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, c.id]);
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    if (await community.send(c.id, body)) setText("");
    setSending(false);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm" data-conversation={c.id}>
      {head && (
        <header className="flex min-h-13 shrink-0 items-center gap-3 border-b px-4">
          {c.kind === "direct" && <Avatar name={c.with!.username} src={c.with!.avatar} size={28} />}
          <span className="font-semibold">{title(c)}</span>
          {c.kind === "group" && (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => go(communityUrl("groups/" + c.group!.id))}>
              {tr("Open the group")}</Button>
          )}
        </header>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
        {!messages ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="ml-auto h-8 w-1/3" />
          </div>
        ) : !messages.length ? (
          <Nothing>{c.kind === "group" ? tr("Say hello to the group.") : tr("Say hello to {0}.", { 0: c.with!.username })}</Nothing>
        ) : (
          messages.map((m, i) => {
            const mine = m.senderId === s.user.id,
              previous = messages[i - 1],
              newDay = !previous || day(previous.createdAt) !== day(m.createdAt),
              sameSender = !newDay && previous?.senderId === m.senderId && m.createdAt - previous.createdAt < 5 * 60_000;
            return (
              <div key={m.id} className="flex flex-col">
                {newDay && <span className="my-2 self-center text-[11px] text-muted-foreground">{day(m.createdAt)}</span>}
                <div className={cn("flex max-w-[75%] flex-col gap-0.5", mine ? "items-end self-end" : "items-start self-start", !sameSender && "mt-1.5")}>
                  {!mine && !sameSender && c.kind === "group" && <span className="px-1 text-[11px] font-medium text-muted-foreground">{m.sender.username}</span>}
                  <span className={cn("rounded-2xl px-3 py-1.5 break-words whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted")} title={time(m.createdAt)}>
                    {m.body}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
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
    </div>
  );
}
