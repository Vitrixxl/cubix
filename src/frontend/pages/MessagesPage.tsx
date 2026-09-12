import { contextLabel } from "../../shared/puzzles";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { sendChatMessage } from "../lib/chatTransport";
import { api } from "../api";
import { chatConnectionAtom, chatPeerAtom, chatVersionAtom, routeAtom, userAtom } from "../state";
import type { ChatMessageDto, FriendDto, SolveDto } from "../../shared/types";
import { fmtDate, fmtSolve } from "../lib/format";
import { AlgText } from "../components/AlgorithmList";
import { IconBack } from "../components/icons";
import { AccountForm } from "./AccountPage";

export function SharedTimeCard({ solve }: { solve: SolveDto }) {
  return <div className="shared-time-card">
    <span className="eyebrow">{contextLabel(solve)}{solve.case_id ? ` · ${solve.case_id}` : ""}</span>
    <strong>{fmtSolve(solve.time_ms, solve.penalty)}</strong>
    <span className="muted">{fmtDate(solve.created_at)}</span>
    {solve.scramble && <details><summary>Scramble</summary><p><AlgText alg={solve.scramble} /></p></details>}
  </div>;
}

export function MessagesPage({ solveId }: { solveId?: number }) {
  const user = useAtomValue(userAtom);
  const version = useAtomValue(chatVersionAtom);
  const connection = useAtomValue(chatConnectionAtom);
  const setRoute = useSetAtom(routeAtom);
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
  if (!user || user.isGuest) return <div className="page account-page"><div className="page-scroll"><h1>Messages</h1><p className="muted">Sign in to chat with friends.</p><AccountForm /></div></div>;
  const accepted = friends.filter(f => f.status === "accepted");
  const peer = accepted.find(f => f.userId === peerId);
  const act = async (action: () => Promise<unknown>) => {
    setError("");
    try { await action(); setRetry(v => v + 1); }
    catch (e) { setError((e as Error).message); }
  };
  return <div className={`page messages-page ${peer ? "has-conversation" : ""}`}>
    <div className="toolbar">
      <button className="btn small ghost" onClick={() => setRoute({ page: "community" })}><IconBack /> Friends</button>
      <h1>Messages</h1>
      <span className={`chat-status ${connection}`} role="status">{connection === "online" ? "Connected" : "Reconnecting…"}</span>
    </div>
    {error && <p className="form-error" role="alert">{error} <button className="mini-btn" onClick={() => { setError(""); setRetry(v => v + 1); }}>Retry</button></p>}
    <div className="chat-layout">
      <aside className="friends-panel" aria-label="Conversations">
        {loading ? <p className="muted">Loading…</p> : accepted.length === 0 ? <p className="muted">Add friends to start a conversation.</p> : accepted.map(f => <button key={f.id} className={`friend-thread ${peerId === f.userId ? "selected" : ""}`} onClick={() => setPeerId(f.userId)}><span className="avatar"><span className="avatar-initials">{f.username.slice(0, 2).toUpperCase()}</span></span><strong>{f.username}</strong></button>)}
      </aside>
      {peer ? <Conversation key={peer.userId} peer={peer} onBack={() => setPeerId("")} userId={user.id} attachment={attachment} clearAttachment={() => setAttachment(null)} onRemove={() => void act(async () => { await api.removeFriend(peer.id); setPeerId(""); })} /> : <section className="chat-empty"><p className="muted">{attachment ? "Choose a friend to send this time." : "Choose a friend to open a conversation."}</p>{attachment && <><SharedTimeCard solve={attachment} /><button className="mini-btn" onClick={() => setAttachment(null)}>Cancel</button></>}</section>}
    </div>
  </div>;
}

function Conversation({ peer, userId, attachment, clearAttachment, onRemove, onBack }: {
  peer: FriendDto; userId: string; attachment: SolveDto | null; clearAttachment: () => void; onRemove: () => void; onBack: () => void;
}) {
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
  const bottom = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const merge = (rows: ChatMessageDto[]) => setMessages(previous => [...new Map([...previous.filter(m => m.id > 0), ...rows].map(m => [m.id, m])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id));
  useEffect(() => {
    let active = true;
    api.messages(peer.userId).then(rows => {
      if (!active) return;
      setMessages(previous => {
        // If a long disconnection skipped a page, restart from a contiguous latest page.
        if (previous.length && rows.length && previous.at(-1)!.id < rows[0].id) return rows;
        return [...new Map([...previous.filter(m => m.id > 0), ...rows].map(m => [m.id, m])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
      });
      if (loading) setHasOlder(rows.length === 50);
      setLoading(false);
    }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [peer.userId, version, retry]);
  useEffect(() => { if (stickToBottom.current) bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages, attachment]);
  const loadOlder = async () => {
    if (!messages.length) return;
    setOlderBusy(true);
    const el = viewport.current;
    const oldHeight = el?.scrollHeight ?? 0;
    const oldTop = el?.scrollTop ?? 0;
    stickToBottom.current = false;
    try {
      const rows = await api.messages(peer.userId, messages[0].id);
      merge(rows); setHasOlder(rows.length === 50);
      requestAnimationFrame(() => { if (el) el.scrollTop = oldTop + el.scrollHeight - oldHeight; });
    } catch (e) { setError((e as Error).message); }
    finally { setOlderBusy(false); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || (!text.trim() && !attachment)) return;
    const key = JSON.stringify([peer.userId, text, attachment?.id]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setSending(true); setError("");
    try {
      const message = await sendChatMessage(peer.userId, { text, solveId: attachment?.id, clientId: pending.current.id });
      stickToBottom.current = true;
      merge([message]); setText(""); clearAttachment(); pending.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };
  return <section className="conversation" aria-label={`Conversation with ${peer.username}`}>
    <header className="conversation-header"><button className="btn icon conversation-back" aria-label="Back to conversations" onClick={onBack}><IconBack /></button><h2>{peer.username}</h2>{confirmRemove ? <span><button className="mini-btn danger" onClick={onRemove}>Confirm</button><button className="mini-btn" onClick={() => setConfirmRemove(false)}>Cancel</button></span> : <button className="mini-btn" onClick={() => setConfirmRemove(true)}>Remove friend</button>}</header>
    <div className="chat-messages" role="log" aria-label="Messages" aria-live="polite" ref={viewport} onScroll={() => { const el = viewport.current; if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {hasOlder && <button className="mini-btn load-older" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? "Loading…" : "Load older messages"}</button>}
      {loading ? <p className="muted">Loading…</p> : messages.length === 0 && <p className="muted conversation-start">No messages yet.</p>}
      {messages.map(message => <article className={`chat-message ${message.senderId === userId ? "own" : ""}`} key={message.id}>{message.solve && <SharedTimeCard solve={message.solve} />}{message.text && <p>{message.text}</p>}<time dateTime={message.createdAt}>{message.id < 0 ? "Sending…" : new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time></article>)}
      <div ref={bottom} />
    </div>
    {error && <p className="form-error" role="alert">{error} <button className="mini-btn" onClick={() => { setError(""); setRetry(v => v + 1); }}>Retry</button></p>}
    <form className="chat-composer" onSubmit={send}>
      {attachment && <div className="chat-attachment"><SharedTimeCard solve={attachment} /><button className="mini-btn" disabled={sending} onClick={clearAttachment} type="button">Remove</button></div>}
      <div className="composer-row"><textarea className="input" aria-label={`Message ${peer.username}`} placeholder="Write a message…" value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={1} disabled={sending} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button className="btn primary" disabled={sending || (!text.trim() && !attachment)}>{sending ? "…" : "Send"}</button></div>
    </form>
  </section>;
}
