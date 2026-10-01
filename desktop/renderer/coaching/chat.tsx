/** Conversations between coaches and students: the list, and one conversation with its messages and the box to write. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, NUMERIC, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, type Conversation } from "./client";
import { Nothing, PANEL, RowLink, RowsSkeleton, Count, day, relative, time, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";

export function Messages({ id }: { id: number | null }) {
  useEffect(() => {
    void coaching.load("conversations");
  }, []);
  const phone = usePhone();
  const list = coaching.conversations;
  const current = list?.find((c) => c.id === id);
  // Phones show the list, or one conversation.
  const showList = !phone || !id,
    showChat = !phone || !!id;
  return (
    <div className={cn(PANEL, "flex-1 flex-row")}>
      {showList && (
        <div className={cn("flex min-h-0 shrink-0 flex-col", phone ? "flex-1" : "w-72 border-r")}>
          {!list ? (
            <RowsSkeleton />
          ) : !list.length ? (
            <Nothing>
              No conversation yet.
              <UiButton variant="outline" onClick={() => go(url("coaches"))}>
                Find a coach
              </UiButton>
            </Nothing>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto" data-slot="conversations">
              {list.map((c) => (
                <li key={c.id}>
                  <ConversationRow c={c} active={c.id === id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showChat &&
        (current ? (
          <Chat conversation={current} back={phone ? url("messages") : undefined} />
        ) : list && id ? (
          <Nothing>This conversation does not exist.</Nothing>
        ) : (
          <Nothing className="max-md:hidden">{list?.length ? "Pick a conversation." : ""}</Nothing>
        ))}
    </div>
  );
}

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  return (
    <RowLink to={url("messages/" + c.id)} active={active}>
      <Avatar name={c.with.username} size={36} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{c.with.username}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{c.role === "student" ? "coach" : "student"}</span>
          {c.lastMessage && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{relative(c.lastMessage.at)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
            {c.lastMessage ? (c.lastMessage.mine ? "You: " : "") + c.lastMessage.body : "No message yet"}
          </span>
          <Count n={c.unread} />
        </span>
      </span>
    </RowLink>
  );
}

/**
 * One conversation: its messages, newest at the bottom, split by day; read as long as it is on screen. The coach
 * reaches the student's page from it, the student the coach's slots.
 */
export function Chat({ conversation: c, back, head = true, className }: { conversation: Conversation; back?: string; head?: boolean; className?: string }) {
  const messages = coaching.messages.get(c.id);
  useEffect(() => {
    void coaching.load(`messages:${c.id}`);
    coaching.open = c.id;
    const visible = () => document.visibilityState === "visible" && coaching.read(c.id);
    document.addEventListener("visibilitychange", visible);
    return () => {
      if (coaching.open === c.id) coaching.open = null;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [c.id]);
  useEffect(() => {
    if (messages && c.unread) coaching.read(c.id);
  }, [messages, c.unread]);
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, c.id]);
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await coaching.send(c.id, body);
      setText("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  }
  let lastDay = "";
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)} data-slot="chat" data-conversation={c.id}>
      {head && (
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4">
          {back && (
            <UiButton variant="ghost" size="icon-sm" aria-label="Every conversation" onClick={() => go(back)}>
              <ChevronLeft />
            </UiButton>
          )}
          <Avatar name={c.with.username} size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{c.with.username}</span>
            <span className="text-xs text-muted-foreground">{c.role === "student" ? "Your coach" : "Your student"}</span>
          </span>
          {c.role === "student" ? (
            <UiButton variant="outline" size="sm" onClick={() => go(url("coach/" + c.coachId))} data-action="chat:book">
              <CalendarPlus />
              Book
            </UiButton>
          ) : (
            <Tip content="Student page">
              <UiButton variant="outline" size="sm" onClick={() => go(url("students/" + c.studentId))} data-action="chat:student">
                <UserRound />
                Student
              </UiButton>
            </Tip>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite" data-slot="messages">
        {!messages ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-9 w-1/2 rounded-xl" />
            <Skeleton className="h-9 w-3/5 rounded-xl" />
          </div>
        ) : !messages.length ? (
          <Nothing className="h-full">Say hello to {c.with.username}.</Nothing>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m) => {
              const mine = m.senderId === s.user.id,
                today = day(m.createdAt),
                divider = today !== lastDay;
              lastDay = today;
              return (
                <div key={m.id} className="flex flex-col gap-1.5">
                  {divider && <span className="py-2 text-center text-[11px] font-medium text-muted-foreground">{today}</span>}
                  <div className={cn("flex max-w-[78%] flex-col gap-0.5", mine ? "items-end self-end" : "items-start self-start")} data-mine={mine || undefined}>
                    <p className={cn("rounded-xl px-3 py-2 break-words whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.body}</p>
                    <span className={cn(NUMERIC, "px-1 text-[10px] text-muted-foreground")}>{time(m.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="shrink-0 border-t p-3">
        <InputGroup>
          <InputGroupTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={2000}
            rows={1}
            placeholder={"Message " + c.with.username}
            aria-label={"Message " + c.with.username}
            data-action="chat:input"
            className="max-h-32 min-h-9 resize-none"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" size="icon-xs" disabled={!text.trim() || sending} aria-label="Send" data-action="chat:send">
              <Send />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
