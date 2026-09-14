import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { FriendDto } from "../../../src/shared/types";
import { api } from "../api";
import { chatVersionAtom, userAtom } from "../state";
import { Btn, Chip, MiniBtn, Muted } from "./ui";

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
  if (friend?.status === "accepted") return <Chip label="Friends" />;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
    {!friend ? <Btn small disabled={disabled} accessibilityLabel={`Add ${username} as a friend`} label={state.busy === userId ? "Adding…" : "Add friend"} onPress={() => void state.act(userId, () => api.addFriend(username))} />
      : <>
        {friend.incoming ? <Btn small disabled={disabled} label="Accept" onPress={() => void state.act(userId, () => api.acceptFriend(friend.id))} /> : <Muted size={13}>Request sent</Muted>}
        <MiniBtn disabled={disabled} label={friend.incoming ? "Decline" : "Cancel"} onPress={() => void state.act(userId, () => api.removeFriend(friend.id))} />
      </>}
  </View>;
}
