/**
 * Conversations between coaches and students: the list, and one conversation with its messages and the box to write.
 * Pictures and videos go as messages of their own: picked with the clip, pasted, or dropped on the conversation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ImageUp, LoaderCircle, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, NUMERIC, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, gist, type Conversation, type Media } from "./client";
import { PersonDialog } from "./person";
import { Nothing, PANEL, ROWS, RowLink, RowsSkeleton, Count, day, relative, time, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
    <div className="flex min-h-0 flex-1 gap-4">
      {showList && (
        <div className={cn(PANEL, "shrink-0", phone ? "flex-1" : "w-72")}>
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
            <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")} data-slot="conversations">
              {list.map((c) => (
                <li key={c.id}>
                  <ConversationRow c={c} active={c.id === id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showChat && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col text-sm">
          {current ? (
            <Chat conversation={current} back={phone ? url("messages") : undefined} />
          ) : list && id ? (
            <Nothing>This conversation does not exist.</Nothing>
          ) : (
            <Nothing className="max-md:hidden">{list?.length ? "Pick a conversation." : ""}</Nothing>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  return (
    <RowLink to={url("messages/" + c.id)} active={active}>
      <Avatar name={c.with.username} src={c.with.avatar} size={36} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{c.with.username}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{c.role === "student" ? "coach" : "student"}</span>
          {c.lastMessage && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{relative(c.lastMessage.at)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
            {c.lastMessage ? (c.lastMessage.mine ? "You: " : "") + gist(c.lastMessage.body, c.lastMessage.media) : "No message yet"}
          </span>
          <Count n={c.unread} />
        </span>
      </span>
    </RowLink>
  );
}

/**
 * One conversation, floating on the page: its messages, newest at the bottom, split by day; read as long as it is on
 * screen. Their name opens the other party's file; the student also books the coach's slots from it.
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
  const end = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [uploads, setUploads] = useState<{ key: number; name: string }[]>([]),
    [dragging, setDragging] = useState(false),
    [file, setFile] = useState(false);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, uploads.length, c.id]);
  // A picture or a video taking its height later keeps the newest message in view, unless the reader went up.
  const stick = () => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 480) end.current?.scrollIntoView({ block: "end" });
  };
  /** Sends the pictures and videos one after the other, each shown as on its way until it lands. */
  async function attach(files: File[]) {
    for (const file of files) {
      const key = Math.random();
      setUploads((list) => [...list, { key, name: file.name }]);
      try {
        await coaching.sendMedia(c.id, file);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setUploads((list) => list.filter((u) => u.key !== key));
      }
    }
  }
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
    <div
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}
      data-slot="chat"
      data-conversation={c.id}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void attach([...e.dataTransfer.files]);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/60 bg-background/80 text-sm font-medium">
          <ImageUp className="size-6 text-primary" />
          Drop to send to {c.with.username}
        </div>
      )}
      {head && (
        <div className="flex min-h-14 shrink-0 items-center gap-3 px-4 pt-1">
          {back && (
            <UiButton variant="ghost" size="icon-sm" aria-label="Every conversation" onClick={() => go(back)}>
              <ChevronLeft />
            </UiButton>
          )}
          <Tip content={c.role === "student" ? "Coach file" : "Student file"}>
            <button
              type="button"
              onClick={() => setFile(true)}
              className="-ml-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              data-action="chat:profile"
            >
              <Avatar name={c.with.username} src={c.with.avatar} size={32} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{c.with.username}</span>
                <span className="text-xs text-muted-foreground">{c.role === "student" ? "Your coach" : "Your student"}</span>
              </span>
            </button>
          </Tip>
          <PersonDialog id={c.role === "student" ? c.coachId : c.studentId} name={c.with.username} open={file} onOpenChange={setFile} inChat />
          <span className="flex-1" />
          {c.role === "student" && (
            <UiButton variant="outline" size="sm" onClick={() => go(url(`coach/${c.coachId}/book`))} data-action="chat:book">
              <CalendarPlus />
              Book
            </UiButton>
          )}
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite" data-slot="messages">
        {!messages ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-9 w-1/2 rounded-xl" />
            <Skeleton className="h-9 w-3/5 rounded-xl" />
          </div>
        ) : !messages.length && !uploads.length ? (
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
                    {m.media && <MediaView media={m.media} onSize={stick} />}
                    {m.body && <p className={cn("rounded-xl px-3 py-2 break-words whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.body}</p>}
                    <span className={cn(NUMERIC, "px-1 text-[10px] text-muted-foreground")}>{time(m.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            {uploads.map((u) => (
              <div key={u.key} className="flex max-w-[78%] items-center gap-2 self-end rounded-xl bg-primary/15 px-3 py-2 text-xs text-muted-foreground" data-slot="upload">
                <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
                <span className="truncate">Sending {u.name}</span>
              </div>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>
      {c.open === false ? (
        // Messages open once a session is booked: before that, the way to book.
        <div className="flex shrink-0 items-center gap-3 m-3 mt-1 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground" data-slot="chat-closed">
          <span className="flex-1">{c.role === "student" ? `Book a session with ${c.with.username} to write to them.` : `${c.with.username} can write once they book a session.`}</span>
          {c.role === "student" && (
            <UiButton size="sm" onClick={() => go(url(`coach/${c.coachId}/book`))}>
              <CalendarPlus />
              Book
            </UiButton>
          )}
        </div>
      ) : (
        <form onSubmit={send} className="shrink-0 p-3 pt-1">
          <input
            ref={picker}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void attach(files);
            }}
            data-action="chat:file"
          />
          {/* The group dims itself around a disabled control: the send button, off while nothing is written, must not grey the whole bar. */}
          <InputGroup className="min-h-12 rounded-xl border-foreground/15 bg-card shadow-xs has-disabled:bg-card has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30">
            {/* Both buttons sit the same 8px from the edges of the box. */}
            <InputGroupAddon align="inline-start" className="ml-0! self-end py-2 pl-2">
              <Tip content="Send a picture or a video">
                <InputGroupButton type="button" size="icon-sm" className="size-8 text-muted-foreground hover:text-foreground" aria-label="Send a picture or a video" onClick={() => picker.current?.click()} data-action="chat:attach">
                  <Paperclip />
                </InputGroupButton>
              </Tip>
            </InputGroupAddon>
            <InputGroupTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (!files.length) return;
                e.preventDefault();
                void attach(files);
              }}
              maxLength={2000}
              rows={1}
              placeholder={"Message " + c.with.username}
              aria-label={"Message " + c.with.username}
              data-action="chat:input"
              className="max-h-32 min-h-12 resize-none py-3.5 text-sm placeholder:text-muted-foreground"
            />
            <InputGroupAddon align="inline-end" className="mr-0! self-end py-2 pr-2">
              <InputGroupButton type="submit" variant="default" size="icon-sm" className="size-8 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled={!text.trim() || sending} aria-label="Send" data-action="chat:send">
                <Send />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      )}
    </div>
  );
}

/** A picture (opened large on a click) or a video (played in place), fetched with the account's token. */
function MediaView({ media, onSize }: { media: Media; onSize: () => void }) {
  const [src, setSrc] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    coaching.mediaUrl(media.id).then(
      (url) => live && setSrc(url),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [media.id]);
  const video = media.type.startsWith("video/"),
    label = media.name || (video ? "Video" : "Photo");
  if (failed) return <span className="rounded-xl bg-muted px-3 py-2 text-muted-foreground">{label} is unavailable</span>;
  if (!src) return <Skeleton className="h-48 w-64 rounded-xl" aria-label={"Loading " + label} />;
  if (video) return <video src={src} controls preload="metadata" onLoadedMetadata={onSize} className="max-h-72 max-w-full rounded-xl bg-black" aria-label={label} data-slot="message-video" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={"Open " + label} className="overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <img src={src} alt={label} onLoad={onSize} className="max-h-72 max-w-full object-contain" data-slot="message-image" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] p-2 sm:max-w-[92vw]">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <img src={src} alt={label} className="max-h-[86vh] max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
