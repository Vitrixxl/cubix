import { lazy, Suspense, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SyncStatus } from "../../../src/client/local/client";
import { local, syncStatusChanged } from "../api";
import { useTheme } from "../theme";
import { Sheet } from "./Sheet";
import { Muted } from "./ui";
const AccountForm = lazy(() => import("../pages/AccountPage").then(m => ({ default: m.AccountForm })));

/** `offset`: distance from the window bottom, clearing the navigation bar. */
export function SyncIndicator({ hidden, offset }: { hidden: boolean; offset: number }) {
  const t = useTheme();
  const [status, setStatus] = useState<SyncStatus>(local.status);
  const [signIn, setSignIn] = useState(false);
  useEffect(() => syncStatusChanged.on(status => { setStatus(status); if (status.state === "synced" || status.state === "syncing") setSignIn(false); }), []);
  if (hidden || (status.state !== "error" && status.state !== "signin")) return null;
  const label = status.state === "signin" ? "Sign in again" : "Couldn't save · Retry";
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => status.state === "signin" ? setSignIn(true) : void local.retry()} style={[styles.indicator, { bottom: offset, backgroundColor: t.danger }, t.shadow]}>
      <View style={styles.badge}><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>!</Text></View>
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
    <Sheet open={signIn} title="Sign in" onClose={() => setSignIn(false)}><Suspense fallback={<Muted>Loading…</Muted>}><AccountForm initialMode="login" /></Suspense></Sheet>
  </>;
}

const styles = StyleSheet.create({
  indicator: { position: "absolute", alignSelf: "center", zIndex: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  badge: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff3", alignItems: "center", justifyContent: "center" },
});
