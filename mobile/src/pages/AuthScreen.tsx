import { useSetAtom } from "jotai";
import { GraduationCap, Shapes, Timer } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../../src/client/api-client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api, authToken, local } from "../api";
import { useLayout } from "../hooks/useLayout";
import { storage } from "../platform/storage";
import { Logo } from "../components/Logo";
import { guestModeAtom } from "../state";
import { useColors } from "../theme";
import { said, tr } from "../../../src/client/i18n";

/** A labelled field with its hint or its error under it. */
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <View className="gap-2">
    <Label>{said(label)}</Label>
    {children}
    {error ? <Text className="text-sm text-destructive">{said(error)}</Text> : hint ? <Text className="text-sm text-muted-foreground">{said(hint)}</Text> : null}
  </View>;
}

/**
 * Whether this phone holds times or learned cases outside any account (or a former server guest's token, whose data is
 * being brought here): signing in or creating an account imports them (the web's engine, desktop/engine/core.ts).
 */
function localData() {
  if (!local.current().isGuest) return false;
  if (authToken.get()) return true;
  try {
    const guest = JSON.parse(storage.getItem("cubix.local.v1:workspace:guest") ?? "null");
    return Object.values(guest?.solves ?? {}).some((solve: any) => !solve.deleted) || Object.values(guest?.learned ?? {}).some(Boolean);
  } catch { return false; }
}

const PROMISES = [
  { icon: Shapes, title: "Your puzzles and methods", text: "What you can solve today" },
  { icon: GraduationCap, title: "Learn the others", text: "A new puzzle starts with its course" },
  { icon: Timer, title: "Then time and train", text: "Everything opens once it is solved" },
];

/**
 * The welcome (direction A): the welcome words and their three promises on top, then signing in, then going on without
 * an account (this device only). Google sign-in is on the web only for now (desktop/renderer/login.tsx); a dev or
 * test server also takes a bare username here. Times already kept on this device are added to the account. On a
 * tablet the welcome takes the top (the promises side by side) and the form a card at the bottom; on a wide screen
 * they share the screen side by side.
 */
export function AuthScreen({ initialUsername = "" }: { initialUsername?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tablet, wide } = useLayout();
  const setGuest = useSetAtom(guestModeAtom);
  const [username, setUsername] = useState(initialUsername);
  const [dev, setDev] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Shown while no session is open: a known account means its session ended (an expired token).
  const [expired] = useState(() => !local.current().isGuest), [kept] = useState(localData);
  useEffect(() => { api.authConfig().then(c => setDev(c.dev), () => {}); }, []);
  const submit = async () => {
    const name = username.trim().toLowerCase();
    if (busy || !name) return;
    setBusy(true); setError("");
    try {
      // A guest account from an older version still on the server: bring its times home first, so the account
      // receives them with the rest of this device's times.
      if (authToken.get() && local.current().isGuest) await local.restore().catch(() => {});
      await api.devLogin(name);
      setGuest(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Can't reach Qbix. Check your connection and try again."));
    } finally { setBusy(false); }
  };
  const brand = <View className="flex-row items-center gap-2.5"><Logo size={26} /><Text accessibilityLabel={tr("Qbix")} className="text-2xl font-extrabold tracking-[-0.03em]">Qbix</Text></View>;
  const form = <>
    {expired ? <Alert>{tr("Your session has ended. Sign in again.")}</Alert> : null}
    {dev ? <>
      <Field label={tr("Dev sign-in")}>
        <Input accessibilityLabel={tr("Username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          maxLength={24} editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()}
          placeholder="dev" placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary} className="h-12 rounded-xl border-0 bg-muted" />
      </Field>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button size="lg" className="h-13 rounded-2xl" disabled={busy || !username.trim()} onPress={() => void submit()}>
        <Text className="text-base font-extrabold">{busy ? tr("Signing in…") : tr("Sign in")}</Text>
      </Button>
    </> : <Text className="text-center text-sm text-muted-foreground">{tr("To sign in, open Qbix on the web.")}</Text>}
    {!expired && <View className="items-center gap-0.5">
      <Button variant="ghost" className="h-11 w-full" disabled={busy} onPress={() => setGuest(true)}>
        <Text className="text-[15px] font-bold">{tr("Continue without an account")}</Text>
      </Button>
      <Text className="text-xs text-muted-foreground">{kept ? tr("Your times on this device will be kept.") : tr("Your times stay on this device.")}</Text>
    </View>}
  </>;
  const scroll = { bottomOffset: 24, style: { flex: 1 }, keyboardShouldPersistTaps: "handled", showsVerticalScrollIndicator: false } as const;
  if (tablet) return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <KeyboardAwareScrollView {...scroll}
      contentContainerStyle={{ flexGrow: 1, flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", paddingTop: insets.top + 24, paddingHorizontal: 28, paddingBottom: Math.max(insets.bottom, 12) + 16, gap: 28 }}>
      <View className={cn("gap-5", wide && "min-w-0 flex-1")}>
        {brand}
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-[56px] leading-[60px] font-extrabold tracking-[-0.04em]">{expired ? tr("Welcome back") : tr("Welcome to Qbix")}</Text>
          <Text className="text-base text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</Text>
        </View>
        {!expired && <View className="flex-row gap-3">
          {PROMISES.map((p, i) => <View key={p.title} className="min-w-0 flex-1 gap-2 rounded-3xl bg-card p-4">
            <View className="size-10 items-center justify-center rounded-xl bg-primary/15"><Icon as={p.icon} size={20} className="text-primary" /></View>
            <Text className="text-base font-bold"><Text className="text-base font-bold text-primary">{i + 1}</Text> {tr(p.title)}</Text>
            <Text className="text-xs text-muted-foreground">{tr(p.text)}</Text>
          </View>)}
        </View>}
      </View>
      {/* The form as a card: under the welcome in portrait, beside it on a wide screen. */}
      <View className={cn("gap-3.5 rounded-3xl bg-card p-6", wide ? "w-[440px]" : "mt-auto w-full max-w-[720px] self-center")}>{form}</View>
    </KeyboardAwareScrollView>
  </KeyboardAvoidingView>;
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <KeyboardAwareScrollView {...scroll}
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 14 }}>
      {brand}
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-[28px] leading-tight font-extrabold tracking-[-0.04em]">{expired ? tr("Welcome back") : tr("Welcome to Qbix")}</Text>
        <Text className="text-sm text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</Text>
      </View>
      {!expired && <View className="gap-2">
        {PROMISES.map((p, i) => <View key={p.title} className="flex-row items-center gap-3">
          <View className="size-9 items-center justify-center rounded-xl bg-primary/15"><Icon as={p.icon} size={18} className="text-primary" /></View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-bold"><Text className="text-sm font-bold text-primary">{i + 1}</Text> {tr(p.title)}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{tr(p.text)}</Text>
          </View>
        </View>)}
      </View>}
      {form}
    </KeyboardAwareScrollView>
  </KeyboardAvoidingView>;
}
