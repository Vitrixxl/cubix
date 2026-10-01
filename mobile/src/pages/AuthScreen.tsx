import { Eye, EyeOff, TriangleAlert } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
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
import { cn } from "@/lib/utils";
import { credentialErrors, PASSWORD_MIN } from "../../../src/client/lib/credentials";
import { api, authToken, local } from "../api";
import { Logo } from "../components/Logo";
import { useColors } from "../theme";

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
    <Label>{label}</Label>
    {children}
    {error ? <Text className="text-[13px] text-destructive">{error}</Text> : hint ? <Text className="text-[13px] text-muted-foreground">{hint}</Text> : null}
  </View>;
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
      setError(e instanceof ApiError ? e.message : "Can't reach Cubix. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const switchMode = (next: string) => { setMode(next as AuthMode); setError(""); setTried(false); };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingHorizontal: 24, paddingBottom: 24 }}>
      <View className="gap-8">
        <View className="gap-6">
          <View className="flex-row items-center gap-2.5"><Logo size={26} /><Text className="text-[22px] font-semibold tracking-tight">cubix</Text></View>
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold tracking-tight">{register ? "Create your account" : "Welcome back"}</Text>
            <Text className="text-sm text-muted-foreground">Time your solves, learn algorithms, race in duels.</Text>
          </View>
        </View>
        <Tabs value={mode} onValueChange={switchMode}>
          <TabsList className="h-11 w-full">
            <TabsTrigger value="login" className="h-9 flex-1" disabled={busy}><Text>Sign in</Text></TabsTrigger>
            <TabsTrigger value="register" className="h-9 flex-1" disabled={busy}><Text>Create account</Text></TabsTrigger>
          </TabsList>
        </Tabs>
        <View className="gap-5">
          <Field label="Username" error={usernameError} hint={register ? "3–24 letters, digits or underscores." : undefined}>
            <Input accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
              maxLength={24} editable={!busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()}
              placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary}
              className={cn("h-12 rounded-lg", usernameError && "border-destructive")} />
          </Field>
          <Field label="Password" error={passwordError} hint={register ? `${PASSWORD_MIN} characters or more.` : undefined}>
            <View>
              <Input ref={passwordRef} accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false}
                autoComplete={register ? "new-password" : "current-password"} textContentType={register ? "newPassword" : "password"} maxLength={128} editable={!busy}
                returnKeyType="go" onSubmitEditing={() => void submit()} placeholderTextColor={colors.mutedForeground + "88"} cursorColor={colors.primary}
                className={cn("h-12 rounded-lg pr-12", passwordError && "border-destructive")} />
              <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} onPress={() => setVisible(v => !v)} hitSlop={6}
                className="absolute top-0 right-0 bottom-0 w-12 items-center justify-center rounded-lg active:bg-muted/60">
                <Icon as={visible ? EyeOff : Eye} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
          </Field>
          {error ? <View accessibilityLiveRegion="polite" className="flex-row items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <Icon as={TriangleAlert} size={16} className="mt-0.5 text-destructive" />
            <Text className="flex-1 text-sm text-destructive">{error}</Text>
          </View> : null}
          {register ? <Text className="text-[13px] leading-[20px] text-muted-foreground">Times already saved on this phone are added to your new account.</Text> : null}
        </View>
      </View>
    </KeyboardAwareScrollView>
    <View className="gap-3 border-t border-border bg-background px-6 pt-4" style={{ paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 12) + 8 }}>
        <Button size="lg" className="h-12 rounded-lg" disabled={busy} onPress={() => void submit()}>
          <Text className="text-base">{busy ? (register ? "Creating account…" : "Signing in…") : register ? "Create account" : "Sign in"}</Text>
        </Button>
        {!keyboard && <><View className="flex-row items-center gap-3">
          <Separator className="flex-1" />
          <Text className="text-xs text-muted-foreground">or</Text>
          <Separator className="flex-1" />
        </View>
        <Button variant="outline" size="lg" className="h-12 rounded-lg" disabled accessibilityHint="Coming soon">
          <GoogleMark />
          <Text className="text-base">Continue with Google</Text>
          <Badge variant="secondary" className="ml-1"><Text>Soon</Text></Badge>
        </Button></>}
    </View>
  </KeyboardAvoidingView>;
}
