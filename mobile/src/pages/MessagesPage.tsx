import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { fmtDate, fmtSolve } from "../../../src/client/lib/format";
import { contextLabel } from "../../../src/shared/puzzles";
import type { ChatMessageDto, FriendDto, SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { chatConnectionAtom, chatPeerAtom, chatVersionAtom, userAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { AlgText } from "../components/AlgText";
import { IconBack } from "../components/icons";
import { Avatar, Btn, Empty, FormError, H1, Input, MiniBtn, Muted } from "../components/ui";
import { AccountForm } from "./AccountPage";

export function SharedTimeCard({ solve }: { solve: SolveDto }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return <View style={[styles.sharedCard, { backgroundColor: t.surface }]}>
    <Text style={[styles.eyebrow, { color: t.readableMuted }]}>{contextLabel(solve)}{solve.case_id ? ` · ${solve.case_id}` : ""}</Text>
    <Text style={{ fontFamily: FONT.mono, fontSize: 20, fontWeight: "600", color: t.text }}>{fmtSolve(solve.time_ms, solve.penalty)}</Text>
    <Muted size={12}>{fmtDate(solve.created_at)}</Muted>
    {solve.scramble && <Pressable onPress={() => setOpen(v => !v)}><Text style={{ color: t.text, fontSize: 12, fontWeight: "600" }}>{open ? "▾" : "▸"} Scramble</Text>{open && <AlgText alg={solve.scramble} size={12} style={{ marginTop: 4 }} selectable />}</Pressable>}
  </View>;
}

export function MessagesPage({ solveId }: { solveId?: number }) {
  const t = useTheme();
  const { navSpace, pagePadding, phone } = useLayout();
  const user = useAtomValue(userAtom);
  const version = useAtomValue(chatVersionAtom);
  const connection = useAtomValue(chatConnectionAtom);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [peerId, setPeerId] = useAtom(chatPeerAtom);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [attachment, setAttachment] = useState<SolveDto | null>(null);
  useEffect(() => {
    if (!user || user.isGuest) return;
    let active = true;
    api.friends().then(list => { if (active) { setFriends(list); setLoading(false); } }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [user?.id, user?.isGuest, version, retry]);
  useEffect(() => {
    setAttachment(null);
    if (!solveId || !user || user.isGuest) return;
    let active = true;
    api.sharedSolve(solveId).then(s => { if (active) setAttachment(s); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [solveId, user?.id, user?.isGuest]);
  if (!user || user.isGuest) return <View style={[styles.page, { maxWidth: 560, paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}><ScrollView contentContainerStyle={{ gap: 22, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"><H1 size={26}>Messages</H1><Muted>Sign in to chat with friends.</Muted><AccountForm /></ScrollView></View>;
  const accepted = friends.filter(f => f.status === "accepted");
  const peer = accepted.find(f => f.userId === peerId);
  const act = async (action: () => Promise<unknown>) => { setError(""); try { await action(); setRetry(v => v + 1); } catch (e) { setError((e as Error).message); } };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18, paddingBottom: navSpace }]}>
    <View style={styles.toolbar}>
      <H1 size={20} style={{ flex: 1 }}>Messages</H1>
      <Text style={{ color: connection === "online" ? t.good : t.readableMuted, fontSize: 12, fontWeight: "500" }}>{connection === "online" ? "Connected" : "Reconnecting…"}</Text>
    </View>
    {error ? <FormError style={{ marginTop: 8 }}>{error} <MiniBtn label="Retry" onPress={() => { setError(""); setRetry(v => v + 1); }} /></FormError> : null}
    <View style={[styles.layout, !phone && { flexDirection: "row", gap: 16 }]}>
      {(!phone || !peer) && <ScrollView horizontal={phone} showsHorizontalScrollIndicator={false} style={phone ? { flexGrow: 0 } : { width: 220 }} contentContainerStyle={phone ? { gap: 6 } : { gap: 2 }}>
        {loading ? <Muted size={13} style={{ padding: 8 }}>Loading…</Muted> : accepted.length === 0 ? <Muted size={13} style={{ padding: 8 }}>Add friends to start a conversation.</Muted> : accepted.map(f => <Pressable key={f.id} onPress={() => setPeerId(f.userId)} style={({ pressed }) => [styles.thread, phone && { paddingHorizontal: 10, paddingVertical: 6 }, { backgroundColor: peerId === f.userId ? t.surface3 : pressed ? t.hover : "transparent" }]}><Avatar username={f.username} /><Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{f.username}</Text></Pressable>)}
      </ScrollView>}
      {peer ? <Conversation key={peer.userId} peer={peer} onBack={() => setPeerId("")} userId={user.id} attachment={attachment} clearAttachment={() => setAttachment(null)} onRemove={() => void act(async () => { await api.removeFriend(peer.id); setPeerId(""); })} />
        : <View style={styles.chatEmpty}><Muted style={{ textAlign: "center" }}>{attachment ? "Choose a friend to send this time." : "Choose a friend to open a conversation."}</Muted>{attachment && <><SharedTimeCard solve={attachment} /><MiniBtn label="Cancel" onPress={() => setAttachment(null)} /></>}</View>}
    </View>
  </KeyboardAvoidingView>;
}

function Conversation({ peer, userId, attachment, clearAttachment, onRemove, onBack }: { peer: FriendDto; userId: string; attachment: SolveDto | null; clearAttachment: () => void; onRemove: () => void; onBack: () => void }) {
  const t = useTheme();
  const version = useAtomValue(chatVersionAtom);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const viewport = useRef<ScrollView>(null);
  const stickToBottom = useRef(true);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const contentHeight = useRef(0);
  const restoreOffset = useRef<number | null>(null);
  const sortMessages = (rows: ChatMessageDto[]) => rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const merge = (rows: ChatMessageDto[]) => setMessages(previous => sortMessages([...new Map([...previous.filter(m => m.id > 0), ...rows].map(m => [m.id, m])).values()]));
  useEffect(() => {
    let active = true;
    api.messages(peer.userId).then(rows => {
      if (!active) return;
      setMessages(previous => {
        // If a long disconnection skipped a page, restart from a contiguous latest page.
        if (previous.length && rows.length && previous.at(-1)!.id < rows[0].id) return rows;
        return sortMessages([...new Map([...previous.filter(m => m.id > 0), ...rows].map(m => [m.id, m])).values()]);
      });
      if (loading) setHasOlder(rows.length === 50);
      setLoading(false);
    }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [peer.userId, version, retry]);
  const onContentSizeChange = (_w: number, h: number) => {
    if (restoreOffset.current !== null) { viewport.current?.scrollTo({ y: restoreOffset.current + h - contentHeight.current, animated: false }); restoreOffset.current = null; }
    else if (stickToBottom.current) viewport.current?.scrollToEnd({ animated: false });
    contentHeight.current = h;
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    stickToBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
    restoreOffset.current = null;
    lastOffset.current = contentOffset.y;
  };
  const lastOffset = useRef(0);
  const loadOlder = async () => {
    if (!messages.length) return;
    setOlderBusy(true); stickToBottom.current = false;
    try {
      const rows = await api.messages(peer.userId, messages[0].id);
      restoreOffset.current = lastOffset.current;
      merge(rows); setHasOlder(rows.length === 50);
    } catch (e) { setError((e as Error).message); }
    finally { setOlderBusy(false); }
  };
  const send = async () => {
    if (sending || (!text.trim() && !attachment)) return;
    const key = JSON.stringify([peer.userId, text, attachment?.id]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setSending(true); setError("");
    try {
      const message = await api.sendMessage(peer.userId, { text, solveId: attachment?.id, clientId: pending.current.id });
      stickToBottom.current = true;
      merge([message]); setText(current => current === text ? "" : current); clearAttachment(); pending.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };
  return <View style={{ flex: 1, minHeight: 0 }} accessibilityLabel={`Conversation with ${peer.username}`}>
    <View style={[styles.conversationHeader, { borderBottomColor: t.line }]}>
      <Btn variant="ghost" iconOnly icon={<IconBack size={16} color={t.text2} />} accessibilityLabel="Back to conversations" onPress={onBack} />
      <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>{peer.username}</Text>
      {confirmRemove ? <View style={{ flexDirection: "row" }}><MiniBtn danger label="Confirm" onPress={onRemove} /><MiniBtn label="Cancel" onPress={() => setConfirmRemove(false)} /></View> : <MiniBtn label="Remove friend" onPress={() => setConfirmRemove(true)} />}
    </View>
    <ScrollView ref={viewport} onScroll={onScroll} onContentSizeChange={onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 12, paddingHorizontal: 4 }} keyboardShouldPersistTaps="handled">
      {hasOlder && <MiniBtn label={olderBusy ? "Loading…" : "Load older messages"} disabled={olderBusy} onPress={() => void loadOlder()} style={{ alignSelf: "center" }} />}
      {loading ? <Muted>Loading…</Muted> : messages.length === 0 && <Muted style={{ alignSelf: "center" }}>No messages yet.</Muted>}
      {messages.map(message => { const own = message.senderId === userId; return <View key={message.id} style={[styles.message, { backgroundColor: own ? t.accentSoft : t.surface2, alignSelf: own ? "flex-end" : "flex-start" }]}>
        {message.solve && <SharedTimeCard solve={message.solve} />}
        {!!message.text && <Text selectable style={{ color: t.text, fontSize: 14, fontWeight: "500", lineHeight: 20 }}>{message.text}</Text>}
        <Text style={{ color: t.readableMuted, fontSize: 10, marginTop: 4 }}>{message.id < 0 ? "Sending…" : new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</Text>
      </View>; })}
    </ScrollView>
    {error ? <FormError>{error} <MiniBtn label="Retry" onPress={() => { setError(""); setRetry(v => v + 1); }} /></FormError> : null}
    <View style={[styles.composer, { borderTopColor: t.line }]}>
      {attachment && <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><SharedTimeCard solve={attachment} /><MiniBtn label="Remove" disabled={sending} onPress={clearAttachment} /></View>}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <Input accessibilityLabel={`Message ${peer.username}`} placeholder="Write a message…" value={text} onChangeText={setText} maxLength={2000} multiline style={{ flex: 1, maxHeight: 120 }} blurOnSubmit={false} />
        <Btn variant="primary" disabled={sending || (!text.trim() && !attachment)} label={sending ? "…" : "Send"} onPress={() => void send()} />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  layout: { flex: 1, minHeight: 0, marginTop: 12, gap: 8 },
  thread: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  chatEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  conversationHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4, paddingBottom: 10, borderBottomWidth: 1 },
  message: { maxWidth: "92%", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  sharedCard: { gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" },
  composer: { gap: 8, paddingTop: 10, borderTopWidth: 1 },
});
