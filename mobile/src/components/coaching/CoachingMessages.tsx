import { getDefaultStore, useAtomValue } from "jotai";
import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import { CalendarPlus, MessagesSquare, Paperclip } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AppState, Image, Modal, Pressable, View } from "react-native";
import { gist, type Conversation, type Media, type Message, type Upload } from "../../../../src/client/lib/coaching";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { coaching, useCoaching } from "../../lib/social";
import { routeAtom } from "../../state";
import { Empty, ListSkeleton, Surface } from "../layout";
import { toastAtom } from "../Toast";
import { Bubble, ChatClosed, ChatHeader, Composer, ConversationList, ConversationRow, Face, MessageList } from "../chat/kit";
import { useCoachingNav } from "./parts";
import { PersonDialog } from "./person";
import { tr } from "../../../../src/client/i18n";

/**
 * Conversations between coaches and students (the web's coaching/chat.tsx on a phone): the list, or one conversation
 * with its messages and the box to write. Pictures and videos go as messages of their own, picked with the clip. The
 * coaching page mounts it at "messages" and "messages/<id>", and a coach's student at "students/<id>".
 */
export function CoachingMessages({ conversationId }: { conversationId?: number }) {
  useCoaching();
  const nav = useCoachingNav();
  useEffect(() => { void coaching.load("conversations"); }, []);
  const list = coaching.conversations, current = list?.find(c => c.id === conversationId);
  // Back to where the conversation was opened from: the messages, or the coach's students.
  const route = useAtomValue(routeAtom) as { view?: string }, section = route.view?.split("/")[0] || "messages";
  if (conversationId == null) return <ConversationList>
    {!list ? <ListSkeleton className="px-2" />
      : !list.length ? <Empty icon={MessagesSquare} title={tr("No conversation yet.")} className="py-10">{tr("Book a session with a coach to write to them.")}<Button variant="outline" className="h-11 rounded-lg" onPress={() => nav.go("coaches")}><Text>{tr("Find a coach")}</Text></Button>
      </Empty>
        : list.map(c => <ConversationRow key={c.id} onPress={() => nav.go("messages/" + c.id)} name={c.with.username} tag={c.role === "student" ? "coach" : "student"}
          face={<Face name={c.with.username} src={c.with.avatar} size={40} />} at={c.lastMessage?.at} unread={c.unread}
          preview={c.lastMessage ? (c.lastMessage.mine ? tr("You: {0}", { 0: preview(c.lastMessage) }) : preview(c.lastMessage)) : tr("No message yet")} />)}
  </ConversationList>;
  return <Surface className="min-h-0 flex-1">
    {current ? <Chat conversation={current} back={() => nav.back(section)} />
      : <Empty icon={MessagesSquare} title={list ? tr("This conversation does not exist.") : tr("Your conversations open here.")} />}
  </Surface>;
}

/** A last message in the list: its words, or what it holds ("Photo"), translated. */
const preview = (m: { body: string; media?: string | null }) => m.body || tr(gist("", m.media));
const fail = (error: unknown) => getDefaultStore().set(toastAtom, { title: (error as Error).message });

/** A picture or a video of the phone's library, read into what `sendMedia` takes. */
async function uploadOf(a: ImagePicker.ImagePickerAsset): Promise<Upload> {
  const blob = await (await fetch(a.uri)).blob(), video = a.type === "video" || !!a.mimeType?.startsWith("video/");
  const type = blob.type || a.mimeType || (video ? "video/mp4" : "image/jpeg");
  // A Blob's type is a getter: an own property stands over it.
  return Object.defineProperties(blob, { type: { value: type }, name: { value: a.fileName || a.uri.split("/").pop() || (video ? "Video" : "Photo") } }) as Upload;
}

/**
 * One conversation: its messages, newest at the bottom, split by day; read as long as it is on screen. Their name
 * opens the other party's file; the student also books the coach's slots from it.
 */
export function Chat({ conversation: c, back, head = true }: { conversation: Conversation; back?: () => void; head?: boolean }) {
  const nav = useCoachingNav(), book = () => nav.go(`coach/${c.coachId}/book`), messages = coaching.messages.get(c.id);
  const [uploads, setUploads] = useState<{ key: number; name: string }[]>([]), [file, setFile] = useState(false);
  useEffect(() => {
    void coaching.load(`messages:${c.id}`);
    coaching.open = c.id;
    const visible = AppState.addEventListener("change", state => { if (state === "active") coaching.read(c.id); });
    return () => {
      if (coaching.open === c.id) coaching.open = null;
      visible.remove();
    };
  }, [c.id]);
  useEffect(() => { if (messages && c.unread) coaching.read(c.id); }, [messages, c.unread]);
  /** Sends the pictures and videos one after the other, each shown as on its way until it lands. */
  async function attach() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, quality: 1 });
    if (picked.canceled) return;
    for (const asset of picked.assets) {
      const key = Math.random(), name = asset.fileName || (asset.type === "video" ? "Video" : "Photo");
      setUploads(list => [...list, { key, name }]);
      try {
        await coaching.sendMedia(c.id, await uploadOf(asset));
      } catch (error) {
        fail(error);
      } finally {
        setUploads(list => list.filter(u => u.key !== key));
      }
    }
  }
  const student = c.role === "student";
  return <View className="min-h-0 flex-1">
    {/* Beside a call, the call says who it is with. */}
    {head ? <ChatHeader back={back && { label: tr("Every conversation"), onPress: back }} face={<Face name={c.with.username} src={c.with.avatar} size={32} />}
      title={c.with.username} sub={student ? tr("Your coach") : tr("Your student")} onOpen={() => setFile(true)} openLabel={student ? tr("Coach file") : tr("Student file")} /> : null}
    <PersonDialog id={student ? c.coachId : c.studentId} name={c.with.username} open={file} onClose={() => setFile(false)} inChat />
    <MessageList<Message> key={c.id} messages={messages} me={coaching.host.account().id}
      bubble={(m, mine, last) => <>
        {m.media ? <MediaView media={m.media} /> : null}
        {m.body ? <Bubble mine={mine} last={last}>{m.body}</Bubble> : null}
      </>}
      empty={<Empty icon={MessagesSquare} title={tr("Say hello to {0}.", { 0: c.with.username })}>{tr("Messages, pictures and videos you send show here.")}</Empty>}>
      {uploads.map(u => <View key={u.key} accessibilityLabel={tr("Sending {0}", { 0: u.name })} className="max-w-[70%] items-end gap-1 self-end">
        <Skeleton className="h-40 w-56 rounded-2xl" />
        <Text numberOfLines={1} className="px-1 text-xs text-muted-foreground">{tr("Sending {0}", { 0: u.name })}</Text>
      </View>)}
    </MessageList>
    {c.open === false
      // Messages open once a session is booked: before that, the way to book.
      ? <ChatClosed action={student ? <Button size="sm" className="h-10 rounded-lg px-3" onPress={book}><Icon as={CalendarPlus} size={15} /><Text>{tr("Book")}</Text></Button> : undefined}>
        {student ? tr("Book a session with {0} to write to them.", { 0: c.with.username }) : tr("{0} can write once they book a session.", { 0: c.with.username })}
      </ChatClosed>
      : <Write c={c} attach={() => void attach()} book={student ? book : undefined} />}
  </View>;
}

/** The box to write, its clip sending pictures and videos; the student's way to book beside Send. */
function Write({ c, attach, book }: { c: Conversation; attach: () => void; book?: () => void }) {
  const [text, setText] = useState(""), [sending, setSending] = useState(false);
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await coaching.send(c.id, body);
      setText("");
    } catch (error) {
      fail(error);
    } finally {
      setSending(false);
    }
  }
  return <Composer value={text} onChange={setText} onSend={() => void send()} sending={sending} label={tr("Message {0}", { 0: c.with.username })} maxLength={2000}
    attach={<Pressable accessibilityRole="button" accessibilityLabel={tr("Send a picture or a video")} onPress={attach} className="size-10 items-center justify-center rounded-lg active:bg-muted">
      <Icon as={Paperclip} size={18} className="text-muted-foreground" />
    </Pressable>}
    actions={book ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Book")} onPress={book} className="h-10 flex-row items-center gap-1.5 rounded-lg px-2 active:bg-muted">
      <Icon as={CalendarPlus} size={16} className="text-muted-foreground" />
      <Text className="text-sm font-medium text-muted-foreground">{tr("Book")}</Text>
    </Pressable> : undefined} />;
}

type Source = { uri: string; headers: Record<string, string> };
/** The largest a picture or a video takes in a conversation. */
const WIDTH = 256, HEIGHT = 288;

/** A picture (opened large on a tap) or a video (played in place), fetched with the account's token. */
function MediaView({ media }: { media: Media }) {
  const [source, setSource] = useState<Source | null>(null), [size, setSize] = useState<{ width: number; height: number } | null>(null),
    [failed, setFailed] = useState(false), [open, setOpen] = useState(false);
  const video = media.type.startsWith("video/"), label = media.name || (video ? tr("Video") : tr("Photo"));
  useEffect(() => {
    let live = true;
    coaching.mediaSource(media.id).then(async s => {
      if (!live) return;
      setSource(s);
      if (video) return;
      const { width, height } = await Image.getSizeWithHeaders(s.uri, s.headers);
      const scale = Math.min(1, WIDTH / width, HEIGHT / height);
      if (live) setSize({ width: width * scale, height: height * scale });
    }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [media.id, video]);
  if (failed) return <View className="rounded-2xl bg-muted px-3 py-1.5"><Text className="text-muted-foreground">{tr("{0} is unavailable", { 0: label })}</Text></View>;
  if (!source || (!video && !size)) return <Skeleton className="h-48 w-64 rounded-2xl" accessibilityLabel={tr("Loading {0}", { 0: label })} />;
  if (video) return <VideoMessage source={source} label={label} />;
  return <>
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={tr("Open {0}", { 0: label })} onPress={() => setOpen(true)} className="overflow-hidden rounded-2xl">
      <Image source={source} style={size!} accessibilityLabel={label} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={() => setOpen(false)} className="flex-1 items-center justify-center bg-black/90 p-2">
        <Image source={source} resizeMode="contain" className="size-full" accessibilityLabel={label} />
      </Pressable>
    </Modal>
  </>;
}

function VideoMessage({ source, label }: { source: Source; label: string }) {
  const player = useVideoPlayer(source);
  return <View className="overflow-hidden rounded-2xl bg-muted" style={{ width: WIDTH, height: WIDTH * 0.75 }}>
    <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} accessibilityLabel={label} style={{ flex: 1 }} />
  </View>;
}
