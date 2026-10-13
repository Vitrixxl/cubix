import { useSetAtom } from "jotai";
import { GraduationCap, Shapes, Timer } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
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
import { API_ORIGIN, api, authToken, local } from "../api";
import { legalPath } from "../../../src/client/lib/legal";
import { LauncherCube } from "../components/LauncherCube";
import { useLayout } from "../hooks/useLayout";
import { storage } from "../platform/storage";
import { Logo } from "../components/Logo";
import { guestModeAtom } from "../state";
import { useColors } from "../theme";
import { language, said, tr } from "../../../src/client/i18n";
import { loadGsi } from "../../../src/client/lib/googleSignIn";

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

/** Google's callback, set at its single `initialize`: the screen shown now. */
let onGoogle = (_credential: string) => {};
let initialized = "";
/**
 * Google's sign-in (web only), in the app's look: Google draws its button in a frame it styles itself (light, blue or
 * black), so ours is drawn in the accent and Google's lies over it, invisible, taking the tap.
 */
function GoogleButton({ id, busy, onCredential, onError }: { id: string; busy: boolean; onCredential: (credential: string) => void; onError: (message: string) => void }) {
  const box = useRef<View>(null);
  onGoogle = onCredential;
  useEffect(() => {
    let live = true;
    loadGsi().then(gsi => {
      // React Native for the web's View is the page's element.
      const element = box.current as unknown as HTMLElement | null;
      if (!live || !element) return;
      if (initialized !== id) gsi.initialize({ client_id: id, callback: ({ credential }) => onGoogle(credential) });
      initialized = id;
      gsi.renderButton(element, { size: "large", shape: "pill", "text": "continue_with", width: Math.min(400, element.clientWidth), locale: language() });
    }, (reason: Error) => live && onError(reason.message));
    return () => { live = false; };
  }, [id]);
  return <View className={cn("h-12 w-full", busy && "opacity-60")}>
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" className="h-12 flex-row items-center justify-center gap-3 rounded-full bg-primary px-5">
      <View className="size-7 items-center justify-center rounded-full bg-white"><GoogleMark size={16} /></View>
      <Text className="text-base font-extrabold text-primary-foreground">{busy ? tr("Signing in…") : tr("Continue with Google")}</Text>
    </View>
    <View ref={box} className="absolute inset-0 items-center justify-center overflow-hidden opacity-0" />
  </View>;
}

/** Google's "G", in its four colours. */
const GoogleMark = ({ size }: { size: number }) => <Svg width={size} height={size} viewBox="0 0 48 48">
  <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</Svg>;

const PROMISES = [
  { icon: Shapes, title: "Your puzzles and methods", text: "What you can solve today" },
  { icon: GraduationCap, title: "Learn the others", text: "A new puzzle starts with its course" },
  { icon: Timer, title: "Then time and train", text: "Everything opens once it is solved" },
];

/**
 * The welcome (direction A): the welcome words and their three promises on top, then signing in, then going on without
 * an account (this device only). On the web, Google's button (as desktop/renderer/login.tsx); not yet in the Android
 * app, which sends to the web. A dev or test server also takes a bare username here. Times already kept on this device are added to the account. On a
 * tablet the welcome takes the top (the promises side by side) and the form a card at the bottom; on a wide screen
 * they share the screen side by side.
 */
export function AuthScreen({ initialUsername = "" }: { initialUsername?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tablet, wide, width, height } = useLayout();
  const setGuest = useSetAtom(guestModeAtom);
  const [username, setUsername] = useState(initialUsername);
  const [dev, setDev] = useState(false), [google, setGoogle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Shown while no session is open: a known account means its session ended (an expired token).
  const [expired] = useState(() => !local.current().isGuest), [kept] = useState(localData);
  useEffect(() => { api.authConfig().then(c => { setDev(c.dev); setGoogle(Platform.OS === "web" ? c.google : null); }, () => {}); }, []);
  const signIn = async (open: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // A guest account from an older version still on the server: bring its times home first, so the account
      // receives them with the rest of this device's times.
      if (authToken.get() && local.current().isGuest) await local.restore().catch(() => {});
      await open();
      setGuest(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Can't reach Qbix. Check your connection and try again."));
    } finally { setBusy(false); }
  };
  const submit = () => { const name = username.trim().toLowerCase(); if (name) void signIn(() => api.devLogin(name)); };
  const brand = <View className="flex-row items-center gap-2.5"><Logo size={26} /><Text accessibilityLabel={tr("Qbix")} className="text-2xl font-extrabold tracking-[-0.03em]">Qbix</Text></View>;
  const form = <>
    {expired ? <Alert>{tr("Your session has ended. Sign in again.")}</Alert> : null}
    {google ? <GoogleButton id={google} busy={busy} onCredential={credential => void signIn(() => api.google(credential))} onError={setError} /> : null}
    {error ? <Alert variant="destructive">{said(error)}</Alert> : null}
    {dev ? <>
      <Field label={tr("Dev sign-in")}>
        <Input accessibilityLabel={tr("Username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          maxLength={24} editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()}
          placeholder="dev" placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary} className="h-12 rounded-xl border-0 bg-muted" />
      </Field>
      <Button size="lg" className="h-13 rounded-2xl" disabled={busy || !username.trim()} onPress={() => void submit()}>
        <Text className="text-base font-extrabold">{busy ? tr("Signing in…") : tr("Sign in")}</Text>
      </Button>
    </> : !google && <Text className="text-center text-sm text-muted-foreground">{tr("To sign in, open Qbix on the web.")}</Text>}
    {!expired && <>
      <View className="flex-row items-center gap-3" importantForAccessibility="no-hide-descendants">
        <View className="h-px flex-1 bg-border" /><Text className="text-xs font-semibold text-muted-foreground">{tr("or")}</Text><View className="h-px flex-1 bg-border" />
      </View>
      <View className="items-center gap-1.5">
        <Button variant="secondary" className="h-12 w-full rounded-full" accessibilityLabel={tr("Continue without an account")} disabled={busy} onPress={() => setGuest(true)}>
          <Text className="text-[15px] font-bold">{tr("Without an account")}</Text>
        </Button>
        <Text className="text-xs text-muted-foreground">{kept ? tr("Your times on this device will be kept.") : tr("Your times stay on this device.")}</Text>
      </View>
    </>}
    {google ? <Consent /> : null}
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
  // A phone: the self-solving cube of the launcher, the welcome under it (its words say what the
  // tablet's promises do), then the ways in on a panel rising from the bottom, under the thumb.
  const cube = Math.round(Math.min(width * 0.68, height * 0.34, 300));
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <KeyboardAwareScrollView {...scroll} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12 }}>
      <View className="px-5">{brand}</View>
      <View className="min-h-0 flex-1 items-center justify-center py-3" importantForAccessibility="no-hide-descendants">
        <LauncherCube size={cube} finish={false} />
      </View>
      <View className="gap-1.5 px-5 pb-5">
        <Text accessibilityRole="header" className="text-[34px] leading-[38px] font-extrabold tracking-[-0.045em]">{expired ? tr("Welcome back") : tr("Welcome to Qbix")}</Text>
        <Text className="text-[15px] leading-[21px] text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</Text>
      </View>
      <View className="gap-3.5 rounded-t-[28px] border-t border-border bg-card px-5 pt-5" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10 }}>{form}</View>
    </KeyboardAwareScrollView>
  </KeyboardAvoidingView>;
}

/** Signing in accepts the terms and the privacy policy, each a link to the website. */
function Consent() {
  const links: Record<string, [string, string]> = { terms: [legalPath("terms"), tr("terms of use")], privacy: [legalPath("privacy"), tr("privacy policy")] };
  return <Text className="text-center text-xs leading-[18px] text-muted-foreground">
    {tr("By continuing, you accept the {terms} and the {privacy}.").split(/(\{terms\}|\{privacy\})/).map((part, i) => {
      const link = links[part.slice(1, -1)];
      return link ? <Text key={i} accessibilityRole="link" onPress={() => void Linking.openURL(API_ORIGIN + link[0])} className="text-xs text-foreground underline">{link[1]}</Text> : part;
    })}
  </Text>;
}
