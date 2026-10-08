import { Eye, EyeOff, HardDrive } from "lucide-react-native";
import { useRef, useState } from "react";
import { Linking, Pressable, Text as RNText, TextInput, View } from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { ApiError } from "../../../src/client/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { credentialErrors, PASSWORD_MIN } from "../../../src/client/lib/credentials";
import { legalPath } from "../../../src/client/lib/legal";
import { API_ORIGIN, api, authToken, local } from "../api";
import { storage } from "../platform/storage";
import { Logo } from "../components/Logo";
import { useColors } from "../theme";
import { said, tr } from "../../../src/client/i18n";

export type AuthMode = "login" | "register";

/** Google's four-colour G, for the sign-in button to come. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </Svg>;
}

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

/** Creating an account accepts the terms of use; the privacy policy says what is kept. One sentence, its links in place. */
function Consent() {
  const links: Record<string, [string, string]> = { terms: [legalPath("terms"), tr("terms of use")], privacy: [legalPath("privacy"), tr("privacy policy")] };
  return <Text className="text-center text-xs text-muted-foreground">
    {tr("By creating an account, you accept the {terms} and the {privacy}.").split(/(\{terms\}|\{privacy\})/).map((part, i) => {
      const link = links[part.slice(1, -1)];
      return link ? <RNText key={i} accessibilityRole="link" onPress={() => void Linking.openURL(API_ORIGIN + link[0])} className="text-foreground underline">{link[1]}</RNText> : part;
    })}
  </Text>;
}

/**
 * The app needs an account: signing in or creating one comes first. Times already kept on this device (a guest's,
 * from before accounts were required) are added to the account either way. Google sign-in is announced, not yet
 * available.
 */
export function AuthScreen({ initialMode = "login", initialUsername = "" }: { initialMode?: AuthMode; initialUsername?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  // With the keyboard up, the foot keeps only the submit button, right above it.
  const keyboard = useKeyboardState(state => state.isVisible);
  const register = mode === "register";
  // Shown while no session is open: a known account means its session ended (an expired token); only its password is asked again.
  const [expired] = useState(() => !local.current().isGuest), [kept] = useState(localData);
  // The server's rules, said before asking it; each field shows its most pressing error once the form was tried.
  const errors = tried ? credentialErrors(register, username.trim(), password) : [];
  const usernameError = errors.find(e => e.field === "username")?.message ?? "";
  const passwordError = errors.find(e => e.field === "password")?.message ?? "";
  const submit = async () => {
    if (busy) return;
    setTried(true); setError("");
    const name = username.trim();
    if (credentialErrors(register, name, password).length) return;
    setBusy(true);
    try {
      // A guest account from an older version still on the server: bring its times home first, so the new account
      // receives them with the rest of this device's times.
      if (authToken.get() && local.current().isGuest) await local.restore().catch(() => {});
      if (register) await api.register(name, password); else await api.login(name, password);
      setPassword("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr("Can't reach Qbix. Check your connection and try again."));
    } finally { setBusy(false); }
  };
  const switchMode = (next: string) => { setMode(next as AuthMode); setError(""); setTried(false); };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingHorizontal: 24, paddingBottom: 24 }}>
      <View className="gap-8">
        <View className="gap-6">
          <View className="flex-row items-center gap-2.5"><Logo size={26} /><Text accessibilityLabel={tr("Qbix")} className="text-2xl tracking-tight"><Text className="text-2xl font-extrabold">Q</Text><Text className="text-2xl font-medium">bix</Text></Text></View>
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold tracking-tight">{register ? tr("Create your account") : tr("Welcome back")}</Text>
            <Text className="text-sm text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</Text>
          </View>
        </View>
        <Tabs value={mode} onValueChange={switchMode}>
          <TabsList className="h-11 w-full">
            <TabsTrigger value="login" className="h-9 flex-1" disabled={busy}><Text>{tr("Sign in")}</Text></TabsTrigger>
            <TabsTrigger value="register" className="h-9 flex-1" disabled={busy}><Text>{tr("Create account")}</Text></TabsTrigger>
          </TabsList>
        </Tabs>
        {expired ? <Alert>{tr("Your session has ended. Sign in again.")}</Alert> : null}
        <View className="gap-5">
          <Field label={tr("Username")} error={usernameError} hint={register ? tr("3–24 letters, digits or underscores.") : undefined}>
            <Input accessibilityLabel={tr("Username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
              maxLength={24} editable={!busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()}
              placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary}
              className={cn("h-12 rounded-lg", usernameError && "border-destructive")} />
          </Field>
          <Field label={tr("Password")} error={passwordError} hint={register ? tr("{0} characters or more.", { 0: PASSWORD_MIN }) : undefined}>
            <View>
              <Input ref={passwordRef} accessibilityLabel={tr("Password")} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false}
                autoComplete={register ? "new-password" : "current-password"} textContentType={register ? "newPassword" : "password"} maxLength={128} editable={!busy}
                returnKeyType="go" onSubmitEditing={() => void submit()} placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary}
                className={cn("h-12 rounded-lg pr-12", passwordError && "border-destructive")} />
              <Pressable accessibilityRole="button" accessibilityLabel={visible ? tr("Hide password") : tr("Show password")} onPress={() => setVisible(v => !v)} hitSlop={6}
                className="absolute top-0 right-0 bottom-0 w-12 items-center justify-center rounded-lg active:bg-muted/50">
                <Icon as={visible ? EyeOff : Eye} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
          </Field>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
        </View>
      </View>
    </KeyboardAwareScrollView>
    <View className="gap-3 border-t border-border bg-background px-6 pt-4" style={{ paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 12) + 8 }}>
        <Button size="lg" className="h-12 rounded-lg" disabled={busy} onPress={() => void submit()}>
          <Text className="text-base">{busy ? (register ? tr("Creating account…") : tr("Signing in…")) : register ? tr("Create account") : tr("Sign in")}</Text>
        </Button>
        {register && !keyboard && <Consent />}
        {!keyboard && <><View className="flex-row items-center gap-3">
          <Separator className="flex-1" />
          <Text className="text-xs text-muted-foreground">{tr("or")}</Text>
          <Separator className="flex-1" />
        </View>
        <Button variant="outline" size="lg" className="h-12 rounded-lg" disabled accessibilityHint={tr("Coming soon")}>
          <GoogleMark />
          <Text className="text-base">{tr("Continue with Google")}</Text>
          <Badge variant="secondary" className="ml-1"><Text>{tr("Soon")}</Text></Badge>
        </Button>
        {kept && <View className="flex-row items-center justify-center gap-1.5">
          <Icon as={HardDrive} size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{tr("Your times on this device will be kept.")}</Text>
        </View>}</>}
    </View>
  </KeyboardAvoidingView>;
}
