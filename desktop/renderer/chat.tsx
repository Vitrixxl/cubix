/**
 * The conversations' kit, the same in the community and in coaching: the list of conversations and its rows, the
 * header of the open one, its messages read as a transcript (the author and the time in the margin, split by day), and
 * the box to write.
 */
import React, { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, Lock, Send } from "lucide-react";
import { NUMERIC, ROW, SearchField, Surface, Tip, personColour, said, type Props } from "./base";
import { day, dayKey, span, time } from "./coaching/parts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { localFormat, tr } from "../../src/client/i18n";

/** The rows of a list inside its card. */
export const LIST = "flex flex-col gap-0.5 p-2";

/** A new message rising into place, unless motion is reduced. */
const FRESH = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150";

/** A line of the transcript: the margin (who, when) then what was said; on a phone the margin goes above. */
const TURN = "grid gap-x-[18px] gap-y-1 md:grid-cols-[110px_minmax(0,1fr)]";

const shortDay = localFormat({ day: "numeric", month: "short" });
const weekday = localFormat({ weekday: "short" });
/** When a conversation last moved: the time today, "Yesterday", the weekday this week, the date before. */
function stamp(at: number) {
  const key = dayKey(at);
  if (key === dayKey(Date.now())) return time(at);
  if (key === dayKey(Date.now() - 86_400_000)) return tr("Yesterday");
  if (Date.now() - at < 6 * 86_400_000) return weekday.format(at);
  return shortDay.format(at);
}

/**
 * The conversations beside the open one: a card the page's height, `head` on top (the title and its actions), then
 * the search when it has one, `top` (filters, invitations), and the rows.
 */
export function ConversationList({
  head,
  top,
  query,
  onQuery,
  children,
  className,
  ...rest
}: { head?: React.ReactNode; top?: React.ReactNode; query?: string; onQuery?: (query: string) => void } & Props & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Surface className={cn("w-[340px] shrink-0 gap-3 pt-3 max-md:w-full", className)} {...rest}>
      {head && <div className="flex shrink-0 items-center gap-1.5 px-4 pt-1">{head}</div>}
      {onQuery && (
        <div className="shrink-0 px-3">
          <SearchField value={query ?? ""} onChange={onQuery} placeholder="Search conversations" className="h-10 rounded-[14px]" />
        </div>
      )}
      {top}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </Surface>
  );
}

/**
 * A conversation in the list: the face, the name (brighter while unread) with a word after it, and under it the last
 * words, or what waits for the account there (`act`, in the accent); on the right when it last moved and the count
 * unread. The open one is raised.
 */
export function ConversationRow({
  to,
  active,
  face,
  name,
  tag,
  at,
  preview,
  act = false,
  unread,
}: {
  to: string;
  active: boolean;
  face: React.ReactNode;
  name: React.ReactNode;
  /** A word after the name: what the other is to the account, how many a group holds. */
  tag?: React.ReactNode;
  at?: number;
  preview: React.ReactNode;
  act?: boolean;
  unread: number;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, "relative grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 aria-[current=page]:bg-muted")}
    >
      {face}
      <span className="flex min-w-0 flex-col gap-px">
        <span className={cn("truncate text-[15px] font-bold", unread ? "text-foreground" : "text-foreground/75")}>
          {name}
          {tag != null && <span className={cn(NUMERIC, "ml-1.5 text-xs font-semibold text-muted-foreground")}>{tag}</span>}
        </span>
        <span className={cn("truncate text-[13px]", act ? "font-bold text-primary" : "text-muted-foreground")}>{preview}</span>
      </span>
      <span className={cn(NUMERIC, "flex flex-col items-end gap-0.5 text-[11px] font-semibold text-muted-foreground")}>
        {at != null && stamp(at)}
        {unread > 0 && (
          <b className="text-[13px] font-extrabold text-primary" aria-label={tr("{0} unread", { 0: unread })}>
            {unread}
          </b>
        )}
      </span>
    </Link>
  );
}

/** The open conversation in its card, beside the list; `children` may add a side panel. */
export function ChatPanel({ children, className }: Props) {
  return <Surface className={cn("min-w-0 flex-1 flex-row", className)}>{children}</Surface>;
}

/**
 * The open conversation's header: the way back on phones, the face, the name and one muted line (a click opens their
 * details when `onOpen` is given), the conversation's actions on the right.
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
        <span className="truncate text-lg leading-tight font-extrabold tracking-[-0.01em]">{title}</span>
        {sub && <span className={cn(NUMERIC, "truncate text-[13px] text-muted-foreground")}>{sub}</span>}
      </span>
    </>
  );
  const open = onOpen && (
    <button type="button" onClick={onOpen} data-action={action} className={cn(ROW, "flex min-w-0 items-center gap-3.5 px-1.5 py-1")}>
      {who}
    </button>
  );
  return (
    <header className="flex min-h-18 shrink-0 items-center gap-1.5 px-3 pt-2 pb-1 md:px-4">
      {back && (
        <Tip content={said(back.label)}>
          <Button variant="ghost" size="icon" aria-label={said(back.label)} onClick={back.onClick}>
            <ChevronLeft />
          </Button>
        </Tip>
      )}
      {open ? tip ? <Tip content={said(tip)}>{open}</Tip> : open : <div className="flex min-w-0 items-center gap-3.5 px-1.5">{who}</div>}
      {children && <span className="ml-auto flex shrink-0 items-center gap-1.5">{children}</span>}
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

/** How long apart two messages of one sender may be and still read as one turn. */
const GROUP_GAP = 5 * 60_000;

/** A turn: one sender's run of messages, or a message standing alone as a card (`event`). */
type Turn<T> = { day: boolean; mine: boolean; items: T[]; event?: React.ReactNode };

/**
 * The messages as a transcript, newest at the bottom: split by day, each sender's run of messages one turn with their
 * name (in their colour, "You" in the accent) and its time in the margin. A message `event`
 * returns something for (a battle, a tournament) stands as a turn of its own. `them` names the other party when the
 * messages do not carry their sender. `bubble` draws a message inside its turn; `children` come after (the ones on
 * their way). The newest stays in view as messages arrive and pictures take their height.
 */
export function MessageList<T extends Said>({
  messages,
  me,
  them,
  event,
  bubble,
  empty,
  children,
}: {
  messages: T[] | undefined;
  me: string;
  them?: string;
  event?: (m: T) => React.ReactNode;
  bubble: (m: T) => React.ReactNode;
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
  const turns: Turn<T>[] = [];
  messages?.forEach((m, i) => {
    const previous = messages[i - 1],
      newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt),
      ev = event?.(m),
      last = turns[turns.length - 1],
      mine = m.senderId === me;
    if (ev) return void turns.push({ day: newDay, mine, items: [m], event: ev });
    if (!newDay && last && !last.event && previous!.senderId === m.senderId && m.createdAt - previous!.createdAt < GROUP_GAP) last.items.push(m);
    else turns.push({ day: newDay, mine, items: [m] });
  });
  const fresh = (m: T) => initial.current !== undefined && messages!.indexOf(m) >= initial.current;
  return (
    <div ref={scroller} onLoad={stick} onLoadedMetadata={stick} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 md:pr-7 md:pl-3" aria-live="polite" data-slot="messages">
      {!messages ? (
        <ChatSkeleton />
      ) : !messages.length && !extra ? (
        empty
      ) : (
        <div className="flex flex-col gap-1">
          {turns.map((t) => {
            const first = t.items[0]!,
              name = t.mine ? tr("You") : (first.sender?.username ?? them ?? "");
            return (
              <React.Fragment key={first.id}>
                {t.day && <DayDivider at={first.createdAt} />}
                <div className={cn(TURN, "py-1.5")} data-mine={t.mine || undefined}>
                  <div className="flex min-w-0 items-baseline gap-2 md:flex-col md:items-end md:gap-0 md:pt-0.5 md:text-right">
                    <span className={cn("max-w-full truncate text-[13px] font-extrabold", t.mine ? "text-primary" : personColour(name))}>{name}</span>
                    <time className={cn(NUMERIC, "text-[11px] font-semibold text-muted-foreground")}>{time(first.createdAt)}</time>
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    {t.items.map((m) => (
                      <div key={m.id} className={cn("flex max-w-full min-w-0 flex-col items-start gap-1.5", t.event && "w-full", fresh(m) && FRESH)} data-message={m.id}>
                        {t.event ?? bubble(m)}
                      </div>
                    ))}
                  </div>
                </div>
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

/** A message's words, as written; its day and time show on hover. */
export function Bubble({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <Tip content={<span className={NUMERIC}>{span(at)}</span>} side="right">
      <p className="max-w-full text-[15px] leading-normal break-words whitespace-pre-wrap">{children}</p>
    </Tip>
  );
}

/** The day the messages under it were written, in the margin, then a hairline: Today, Yesterday, then the date. */
function DayDivider({ at }: { at: number }) {
  const key = dayKey(at),
    label = key === dayKey(Date.now()) ? tr("Today") : key === dayKey(Date.now() - 86_400_000) ? tr("Yesterday") : day(at);
  return (
    <div role="separator" className={cn(TURN, "my-2 grid-cols-[auto_1fr] items-center text-xs font-bold text-muted-foreground")}>
      <span className={cn(NUMERIC, "first-letter:uppercase md:text-right")}>{label}</span>
      <span aria-hidden="true" className="h-px bg-muted" />
    </div>
  );
}

/** Messages on their way: a name in the margin, a line of words. */
function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={tr("Loading")}>
      {["w-2/5", "w-3/5", "w-1/4", "w-1/2", "w-2/5"].map((w, i) => (
        <div key={i} className={TURN}>
          <Skeleton className="h-4 w-16 md:ml-auto" />
          <Skeleton className={cn("h-5", w)} />
        </div>
      ))}
    </div>
  );
}

/**
 * The box to write, at the bottom: `attach` on its left, the text growing with its lines (Enter sends, Shift+Enter
 * goes to the next line), `actions` inside it on the right, then the send button.
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
      className="flex shrink-0 items-end gap-2 px-3 pt-1 pb-3 md:px-4 md:pb-4"
    >
      {attach}
      <InputGroup className="min-h-10 flex-1 rounded-[14px] bg-background dark:bg-background">
        <InputGroupTextarea
          value={value}
          rows={1}
          maxLength={maxLength}
          placeholder={said(label)}
          aria-label={said(label)}
          data-action="chat:input"
          className="max-h-32 min-h-9 resize-none py-2 text-[15px]"
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {actions && (
          <InputGroupAddon align="inline-end" className="self-end py-1">
            {actions}
          </InputGroupAddon>
        )}
      </InputGroup>
      <Button type="submit" size="icon" disabled={!value.trim() || sending} aria-label={tr("Send")} data-action="chat:send">
        <Send />
      </Button>
    </form>
  );
}

/** In place of the box to write, while the conversation is closed: why, with a lock, and the way to open it if any. */
export function ChatClosed({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="m-3 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[14px] bg-muted px-4 py-3 text-center text-sm text-muted-foreground md:m-4 md:mt-1" data-slot="chat-closed">
      <span className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0" />
        {children}
      </span>
      {action}
    </div>
  );
}
