import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { api } from "../api";
import { chatVersionAtom, userAtom } from "../state";
import type { FriendDto } from "../../shared/types";

export function useFriendActions() {
  const user = useAtomValue(userAtom);
  const version = useAtomValue(chatVersionAtom);
  const bump = useSetAtom(chatVersionAtom);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user || user.isGuest) return;
    let active = true;
    api.friends().then(list => { if (active) { setFriends(list); setError(""); } })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.isGuest, version]);
  const act = async (userId: string, action: () => Promise<unknown>) => {
    setBusy(userId); setError("");
    try { await action(); setFriends(await api.friends()); bump(v => v + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  return { friends, loading, busy, error, act, ownId: user?.id, retry: () => bump(v => v + 1) };
}

export function FriendActions({ userId, username, state }: { userId: string; username: string; state: ReturnType<typeof useFriendActions> }) {
  if (userId === state.ownId) return null;
  const friend = state.friends.find(f => f.userId === userId);
  const disabled = state.loading || state.busy !== null || !!state.error;
  if (friend?.status === "accepted") return <span className="chip">Friends</span>;
  return <div className="friend-actions">
    {!friend ? <button className="btn small" disabled={disabled} aria-label={`Add ${username} as a friend`} onClick={() => void state.act(userId, () => api.addFriend(username))}>{state.busy === userId ? "Adding…" : "Add friend"}</button>
      : <>
        {friend.incoming ? <button className="btn small" disabled={disabled} onClick={() => void state.act(userId, () => api.acceptFriend(friend.id))}>Accept</button> : <span className="muted">Request sent</span>}
        <button className="mini-btn" disabled={disabled} onClick={() => void state.act(userId, () => api.removeFriend(friend.id))}>{friend.incoming ? "Decline" : "Cancel"}</button>
      </>}
  </div>;
}
