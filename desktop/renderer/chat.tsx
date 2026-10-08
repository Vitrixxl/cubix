/**
 * The conversations' kit, the same in the community and in coaching: the list of conversations and its rows, the
 * header of the open one, its messages grouped by sender and split by day, and the box to write.
 */
import React, { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, Lock, Send, type LucideIcon } from "lucide-react";
import { Avatar, Count, NUMERIC, ROW, SearchField, Surface, Tip, said, type Props } from "./base";
import { day, dayKey, span, time } from "./coaching/parts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { localFormat, tr } from "../../src/client/i18n";

/** The rows of a list inside its card. */
export const LIST = "flex flex-col gap-0.5 p-1.5";

/** A new message rising into place, unless motion is reduced. */
const FRESH = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150";

const shortDay = localFormat({ day: "numeric", month: "short" });
/** When a conversation last moved: the time today, "Yesterday", the date before. */
function stamp(at: number) {
  const key = dayKey(at);
  if (key === dayKey(Date.now())) return time(at);
  if (key === dayKey(Date.now() - 86_400_000)) return tr("Yesterday");
  return shortDay.format(at);
}

/** The conversations beside the open one: a card the page's height, its search on top when it has one. */
export function ConversationList({ query, onQuery, children, className, ...rest }: { query?: string; onQuery?: (query: string) => void } & Props & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Surface className={cn("w-80 shrink-0 max-md:w-full", className)} {...rest}>
      {onQuery && (
        <div className="shrink-0 p-2 pb-1">
          <SearchField value={query ?? ""} onChange={onQuery} placeholder="Search conversations" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </Surface>
  );
}

/** A conversation in the list: the face, the name (bold while unread) and when it last moved, then the last words and the count unread. */
export function ConversationRow({
  to,
  active,
  face,
  name,
  tag,
  at,
  icon: I,
  preview,
  unread,
}: {
  to: string;
  active: boolean;
  face: React.ReactNode;
  name: React.ReactNode;
  /** A word after the name: what the other is to the account. */
  tag?: React.ReactNode;
  at?: number;
  icon?: LucideIcon | null;
  preview: React.ReactNode;
  unread: number;
}) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={cn(ROW, "flex w-full min-w-0 items-center gap-3 px-2.5 py-2")}>
      {face}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{name}</span>
          {tag && <span className="shrink-0 text-xs text-muted-foreground">{tag}</span>}
          {at != null && <span className={cn(NUMERIC, "ml-auto shrink-0 text-xs text-muted-foreground")}>{stamp(at)}</span>}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("flex min-w-0 items-center gap-1 text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
            {I && <I className="size-3 shrink-0" />}
            <span className="truncate">{preview}</span>
          </span>
          <Count n={unread} />
        </span>
      </span>
    </Link>
  );
}

/** The open conversation in its card, beside the list; `children` may add a side panel. */
export function ChatPanel({ children, className }: Props) {
  return <Surface className={cn("min-w-0 flex-1 flex-row", className)}>{children}</Surface>;
}

/**
 * The open conversation's header over a hairline: the way back on phones, the face, the name and one muted line (a
 * click opens their details when `onOpen` is given), the conversation's actions on the right.
 */
export function ChatHeader({
  back,
  face,
  title,
  sub,
  onOpen,
  tip,
  action,
  children,
}: {
  back?: { label: string; onClick: () => void };
  face: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  onOpen?: () => void;
  tip?: string;
  action?: string;
  children?: React.ReactNode;
}) {
  const who = (
    <>
      {face}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{title}</span>
        {sub && <span className={cn(NUMERIC, "truncate text-xs text-muted-foreground")}>{sub}</span>}
      </span>
    </>
  );
  const open = onOpen && (
    <button type="button" onClick={onOpen} data-action={action} className={cn(ROW, "flex min-w-0 items-center gap-3 px-1.5 py-1")}>
      {who}
    </button>
  );
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1.5 border-b px-2.5 md:px-3">
      {back && (
        <Tip content={said(back.label)}>
          <Button variant="ghost" size="icon" aria-label={said(back.label)} onClick={back.onClick}>
            <ChevronLeft />
          </Button>
        </Tip>
      )}
      {open ? tip ? <Tip content={said(tip)}>{open}</Tip> : open : <div className="flex min-w-0 items-center gap-3 px-1.5">{who}</div>}
      {children && <span className="ml-auto flex shrink-0 items-center gap-1">{children}</span>}
    </header>
  );
}

/** What a message needs to take its place: who sent it and when. */
export interface Said {
  id: number;
  senderId: string;
  createdAt: number;
  sender?: { username: string; avatar?: string | null };
}

/** How long apart two messages of one sender may be and still read as one group. */
const GROUP_GAP = 5 * 60_000;

type Block<T> = { day: boolean } & ({ kind: "group"; mine: boolean; items: T[] } | { kind: "event"; m: T; event: ChatEvent });
/** A message shown apart, centred (a battle, a tournament): its line and what goes under it. */
export type ChatEvent = { icon: LucideIcon; text: React.ReactNode; body?: React.ReactNode };

/**
 * The messages, newest at the bottom: split by day, each sender's run of messages grouped, its time once after the
 * group; `group` (more than two people) names the others once per group with their face. A message `event` returns
 * something for stands apart, centred. `bubble` draws a message inside its group; `children` come after (the ones on
 * their way). The newest stays in view as messages arrive and pictures take their height.
 */
export function MessageList<T extends Said>({
  messages,
  me,
  group = false,
  event,
  bubble,
  empty,
  children,
}: {
  messages: T[] | undefined;
  me: string;
  group?: boolean;
  event?: (m: T) => ChatEvent | null;
  bubble: (m: T, mine: boolean, last: boolean) => React.ReactNode;
  empty: React.ReactNode;
  children?: React.ReactNode;
}) {
  const end = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    // The messages there on arrival come still; the ones after rise into place.
    initial = useRef<number | undefined>(undefined),
    extra = React.Children.count(children);
  if (initial.current === undefined && messages) initial.current = messages.length;
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, extra]);
  // A picture or a video taking its height later keeps the newest message in view, unless the reader went up.
  const stick = () => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 480) end.current?.scrollIntoView({ block: "end" });
  };
  const blocks: Block<T>[] = [];
  messages?.forEach((m, i) => {
    const previous = messages[i - 1],
      newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt),
      ev = event?.(m),
      last = blocks[blocks.length - 1];
    if (ev) return void blocks.push({ kind: "event", m, event: ev, day: newDay });
    if (!newDay && last?.kind === "group" && previous!.senderId === m.senderId && m.createdAt - previous!.createdAt < GROUP_GAP) last.items.push(m);
    else blocks.push({ kind: "group", mine: m.senderId === me, items: [m], day: newDay });
  });
  const fresh = (m: T) => initial.current !== undefined && messages!.indexOf(m) >= initial.current;
  return (
    <div ref={scroller} onLoad={stick} onLoadedMetadata={stick} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-4" aria-live="polite" data-slot="messages">
      {!messages ? (
        <ChatSkeleton />
      ) : !messages.length && !extra ? (
        empty
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((b) => {
            const first = b.kind === "group" ? b.items[0]! : b.m;
            return (
              <React.Fragment key={first.id}>
                {b.day && <DayDivider at={first.createdAt} />}
                {b.kind === "event" ? (
                  <div className={cn("flex flex-col items-center gap-2", fresh(b.m) && FRESH)} data-message={b.m.id}>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <b.event.icon className="size-3.5 shrink-0" />
                      <span>{b.event.text}</span>
                      <span aria-hidden="true">·</span>
                      <span className={NUMERIC}>{time(b.m.createdAt)}</span>
                    </span>
                    {b.event.body}
                  </div>
                ) : (
                  <Group block={b} group={group} bubble={bubble} fresh={fresh} />
                )}
              </React.Fragment>
            );
          })}
          {children}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function Group<T extends Said>({ block: { mine, items }, group, bubble, fresh }: { block: { mine: boolean; items: T[] }; group: boolean; bubble: (m: T, mine: boolean, last: boolean) => React.ReactNode; fresh: (m: T) => boolean }) {
  const sender = items[0]!.sender,
    named = group && !mine && !!sender;
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")} data-mine={mine || undefined}>
      {named && <span className="pl-12 text-xs font-medium text-muted-foreground">{sender!.username}</span>}
      <div className="flex max-w-[85%] min-w-0 items-end gap-2 md:max-w-[70%]">
        {named && <Avatar name={sender!.username} src={sender!.avatar} size={28} />}
        <div className={cn("flex min-w-0 flex-col gap-0.5", mine ? "items-end" : "items-start")}>
          {items.map((m, i) => (
            <div key={m.id} className={cn("flex max-w-full flex-col", mine ? "items-end" : "items-start", fresh(m) && FRESH)} data-message={m.id}>
              {bubble(m, mine, i === items.length - 1)}
            </div>
          ))}
        </div>
      </div>
      <span className={cn(NUMERIC, "text-xs text-muted-foreground", named ? "pl-12" : "px-1")}>{time(items[items.length - 1]!.createdAt)}</span>
    </div>
  );
}

/** A message's words: on the accent for one's own, muted for the others'; the last of a group points to its sender. Its day and time show on hover. */
export function Bubble({ mine, last, at, children }: { mine: boolean; last: boolean; at: number; children: React.ReactNode }) {
  return (
    <Tip content={<span className={NUMERIC}>{span(at)}</span>} side={mine ? "left" : "right"}>
      <p className={cn("max-w-full rounded-2xl px-3 py-1.5 break-words whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted", last && (mine ? "rounded-br-md" : "rounded-bl-md"))}>{children}</p>
    </Tip>
  );
}

/** The day the messages under it were written, between two hairlines: Today, Yesterday, then the date. */
function DayDivider({ at }: { at: number }) {
  const key = dayKey(at),
    label = key === dayKey(Date.now()) ? tr("Today") : key === dayKey(Date.now() - 86_400_000) ? tr("Yesterday") : day(at);
  return (
    <div role="separator" className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border/60" />
      <span className={cn(NUMERIC, "rounded-full bg-muted/60 px-2.5 py-0.5 font-medium first-letter:uppercase")}>{label}</span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

/** Messages on their way: bubbles one side then the other. */
function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={tr("Loading")}>
      {["w-2/5", "ml-auto w-1/3", "ml-auto w-1/4", "w-1/2", "ml-auto w-2/5"].map((w, i) => (
        <Skeleton key={i} className={cn("h-9 rounded-2xl", w)} />
      ))}
    </div>
  );
}

/**
 * The box to write, at the bottom: the text growing with its lines, Enter sending and Shift+Enter going to the next
 * line; `attach` on its left (the paper clip), `actions` before the send button.
 */
export function Composer({
  value,
  onChange,
  onSend,
  sending = false,
  label,
  maxLength,
  attach,
  actions,
  onPaste,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  label: string;
  maxLength: number;
  attach?: React.ReactNode;
  actions?: React.ReactNode;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 border-t p-3"
    >
      {/* The group dims itself around a disabled control: the send button, off while nothing is written, must not grey the whole bar. */}
      <InputGroup className="rounded-xl has-disabled:bg-transparent has-disabled:opacity-100 dark:has-disabled:bg-input/30">
        {attach && <InputGroupAddon className="self-end py-1">{attach}</InputGroupAddon>}
        <InputGroupTextarea
          value={value}
          rows={1}
          maxLength={maxLength}
          placeholder={said(label)}
          aria-label={said(label)}
          data-action="chat:input"
          className="max-h-32 min-h-9 resize-none py-2"
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <InputGroupAddon align="inline-end" className="self-end py-1">
          {actions}
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-sm"
            disabled={!value.trim() || sending}
            aria-label={tr("Send")}
            data-action="chat:send"
            className="size-7 rounded-lg disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100"
          >
            <Send />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

/** In place of the box to write, while the conversation is closed: why, with a lock, and the way to open it if any. */
export function ChatClosed({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t px-4 py-3 text-center text-sm text-muted-foreground" data-slot="chat-closed">
      <span className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0" />
        {children}
      </span>
      {action}
    </div>
  );
}
