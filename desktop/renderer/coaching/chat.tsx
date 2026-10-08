/**
 * Conversations between coaches and students: the list, and one conversation with its messages and the box to write.
 * Pictures and videos go as messages of their own: picked with the clip, pasted, or dropped on the conversation. The
 * kit is chat.tsx, shared with the community.
 */
import { useEffect, useState } from "react";
import { CalendarPlus, ImageUp, MessagesSquare, Paperclip } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, gist, type Conversation, type Media } from "./client";
import { PersonDialog } from "./person";
import { url } from "./parts";
import { Empty, FOCUS, ListSkeleton } from "../base";
import { Bubble, ChatClosed, ChatHeader, ChatPanel, Composer, ConversationList, ConversationRow, LIST, MessageList } from "../chat";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { InputGroupButton } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function Messages({ id }: { id: number | null }) {
  useEffect(() => {
    void coaching.load("conversations");
  }, []);
  const phone = usePhone();
  const list = coaching.conversations;
  const current = list?.find((c) => c.id === id);
  // On a wide window the latest conversation opens when none is chosen; a phone shows the list first.
  useEffect(() => {
    if (!phone && !id && list?.length) go(url("messages/" + list[0]!.id), true);
  }, [id, list?.length, phone]);
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {(!phone || !id) && (
        <ConversationList>
          {!list ? (
            <ListSkeleton />
          ) : !list.length ? (
            <Empty icon={MessagesSquare} title="No conversation yet.">
              {tr("Book a session with a coach to write to them.")}
              <UiButton variant="outline" onClick={() => go(url("coaches"))}>
                {tr("Find a coach")}
              </UiButton>
            </Empty>
          ) : (
            <ul className={LIST} data-slot="conversations">
              {list.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    to={url("messages/" + c.id)}
                    active={c.id === id}
                    face={<Avatar name={c.with.username} src={c.with.avatar} size={40} />}
                    name={c.with.username}
                    tag={c.role === "student" ? tr("coach") : tr("student")}
                    at={c.lastMessage?.at}
                    preview={c.lastMessage ? (c.lastMessage.mine ? tr("You: {0}", { 0: said(gist(c.lastMessage.body, c.lastMessage.media)) }) : said(gist(c.lastMessage.body, c.lastMessage.media))) : tr("No message yet")}
                    unread={c.unread}
                  />
                </li>
              ))}
            </ul>
          )}
        </ConversationList>
      )}
      {(!phone || !!id) && (
        <ChatPanel>
          {current ? (
            <Chat conversation={current} back={phone ? url("messages") : undefined} />
          ) : (
            <Empty icon={MessagesSquare} title={list && id ? "This conversation does not exist." : "Your conversations open here."} />
          )}
        </ChatPanel>
      )}
    </div>
  );
}

/**
 * One conversation: its messages, newest at the bottom, split by day; read as long as it is on screen. Their name
 * opens the other party's file; the student also books the coach's slots from it. `head` off (beside a call) keeps to
 * the messages and the box.
 */
export function Chat({ conversation: c, back, head = true }: { conversation: Conversation; back?: string; head?: boolean }) {
  const navigate = useNavigate();
  const book = () => void navigate(url(`coach/${c.coachId}/book`), { state: { conversationId: c.id } });
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
  const [uploads, setUploads] = useState<{ key: number; name: string }[]>([]),
    [dragging, setDragging] = useState(false),
    [file, setFile] = useState(false);
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
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
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
          {tr("Drop to send to")} {c.with.username}
        </div>
      )}
      {head && (
        <ChatHeader
          back={back ? { label: "Every conversation", onClick: () => go(back) } : undefined}
          face={<Avatar name={c.with.username} src={c.with.avatar} size={32} />}
          title={c.with.username}
          sub={c.role === "student" ? tr("Your coach") : tr("Your student")}
          onOpen={() => setFile(true)}
          tip={c.role === "student" ? "Coach file" : "Student file"}
          action="chat:profile"
        />
      )}
      {head && <PersonDialog id={c.role === "student" ? c.coachId : c.studentId} name={c.with.username} open={file} onOpenChange={setFile} inChat />}
      <MessageList
        key={c.id}
        messages={messages}
        me={s.user.id}
        bubble={(m, mine, last) => (
          <>
            {m.media && <MediaView media={m.media} />}
            {m.body && (
              <Bubble mine={mine} last={last} at={m.createdAt}>
                {m.body}
              </Bubble>
            )}
          </>
        )}
        empty={
          <Empty icon={MessagesSquare} title={tr("Say hello to {0}.", { 0: c.with.username })}>
            {tr("Messages, pictures and videos you send show here.")}
          </Empty>
        }
      >
        {uploads.map((u) => (
          <div key={u.key} className="flex max-w-[70%] flex-col items-end gap-1 self-end" data-slot="upload" aria-label={tr("Sending {0}", { 0: u.name })}>
            <Skeleton className="h-40 w-56 rounded-2xl" />
            <span className="truncate px-1 text-xs text-muted-foreground">
              {tr("Sending")} {u.name}
            </span>
          </div>
        ))}
      </MessageList>
      {c.open === false ? (
        // Messages open once a session is booked: before that, the way to book.
        <ChatClosed
          action={
            c.role === "student" && (
              <UiButton size="sm" onClick={book} data-action="chat:book">
                <CalendarPlus />
                {tr("Book")}
              </UiButton>
            )
          }
        >
          {c.role === "student" ? tr("Book a session with {0} to write to them.", { 0: c.with.username }) : tr("{0} can write once they book a session.", { 0: c.with.username })}
        </ChatClosed>
      ) : (
        <Write c={c} attach={attach} book={head && c.role === "student" ? book : undefined} />
      )}
    </div>
  );
}

/** The box to write, its clip sending pictures and videos; the student's way to book beside Send. */
function Write({ c, attach, book }: { c: Conversation; attach: (files: File[]) => Promise<void>; book?: () => void }) {
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [picker, setPicker] = useState<HTMLInputElement | null>(null);
  async function send() {
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
  return (
    <>
      <input
        ref={setPicker}
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
      <Composer
        value={text}
        onChange={setText}
        onSend={() => void send()}
        sending={sending}
        label={tr("Message {0}", { 0: c.with.username })}
        maxLength={2000}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (!files.length) return;
          e.preventDefault();
          void attach(files);
        }}
        attach={
          <Tip content={tr("Send a picture or a video")}>
            <InputGroupButton type="button" size="icon-sm" className="size-7 rounded-lg text-muted-foreground hover:text-foreground" aria-label={tr("Send a picture or a video")} onClick={() => picker?.click()} data-action="chat:attach">
              <Paperclip />
            </InputGroupButton>
          </Tip>
        }
        actions={
          book && (
            <InputGroupButton type="button" size="sm" className="h-7 rounded-lg text-muted-foreground hover:text-foreground" onClick={book} data-action="chat:book">
              <CalendarPlus />
              {tr("Book")}
            </InputGroupButton>
          )
        }
      />
    </>
  );
}

/** A picture (opened large on a click) or a video (played in place), fetched with the account's token. */
function MediaView({ media }: { media: Media }) {
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
  if (failed) return <span className="rounded-2xl bg-muted px-3 py-1.5 text-muted-foreground">{tr("{0} is unavailable", { 0: said(label) })}</span>;
  if (!src) return <Skeleton className="h-48 w-64 rounded-2xl" aria-label={tr("Loading {0}", { 0: label })} />;
  if (video) return <video src={src} controls preload="metadata" className="max-h-72 max-w-full rounded-2xl bg-muted" aria-label={said(label)} data-slot="message-video" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={tr("Open {0}", { 0: label })} className={cn("overflow-hidden rounded-2xl", FOCUS)}>
        <img src={src} alt={said(label)} className="max-h-72 max-w-full object-contain" data-slot="message-image" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] p-2 sm:max-w-[92vw]">
          <DialogTitle className="sr-only">{said(label)}</DialogTitle>
          <img src={src} alt={said(label)} className="max-h-[86vh] max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
