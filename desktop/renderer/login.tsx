/**
 * The login page, for the pages of an account (`ACCOUNT_PAGES`): the rest of the app is used without one, on this device.
 * Sign in or create an account with a username and a password (the
 * API's rules: username 3–24, password 10 or more); Google is a placeholder for now. Times this device already holds
 * outside any account join the account either way (see `importGuest` in src/client/local/client.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, HardDrive } from "lucide-react";
import { store as s } from "./store";
import { Tip, usePhone } from "./ui";
import { credentialErrors } from "../../src/client/lib/credentials";
import { Logo, Wordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { legalPath } from "./legal/paths";
import { go } from "./navigation";

type Mode = "login" | "register";

/** Google's "G", in the text colour: the button is a placeholder, not a brand banner. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.7 14.54 2.75 12 2.75 6.92 2.75 2.8 6.9 2.8 12s4.12 9.25 9.2 9.25c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51z" />
    </svg>
  );
}

export function LoginPage() {
  const phone = usePhone();
  const [mode, setMode] = useState<Mode>("login"),
    // After an ended session the account is known: only its password is asked again.
    [username, setUsername] = useState<string>(s.expired ? (s.user.username ?? "") : ""),
    [password, setPassword] = useState(""),
    [shown, setShown] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<{ field: "username" | "password" | ""; message: string } | null>(null);
  const user = useRef<HTMLInputElement>(null);
  const expired = s.expired;
  const secret = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!phone) (username ? secret : user).current?.focus();
  }, [phone]);
  const register = mode === "register";
  // Back where the visitor came from in the app, else to the timer.
  const leave = () => ((history.state?.idx ?? 0) > 0 ? go(-1) : go("/timer", true));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const name = username.trim();
    // The API's rules, said before asking it.
    const [invalid] = credentialErrors(register, name, password);
    if (invalid) return setError(invalid);
    setError(null);
    setPending(true);
    try {
      await s.authenticate(mode, name, password);
    } catch (reason) {
      const message = (reason as Error)?.message || "Something went wrong. Please try again.";
      // The API names the field it refuses; the rest (wrong credentials, rate limit, offline) stays under the form.
      setError({ field: /username/i.test(message) && register ? "username" : /password/i.test(message) && register ? "password" : "", message });
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  const fields = (
    <FieldGroup className="gap-4 max-md:gap-5">
      <Field data-invalid={error?.field === "username" || undefined}>
        <FieldLabel htmlFor="login-username">{tr("Username")}</FieldLabel>
        <Input
          ref={user}
          id="login-username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          aria-invalid={error?.field === "username" || undefined}
          className="max-md:h-12 max-md:text-base"
        />
        {error?.field === "username" ? (
          <FieldError>{said(error.message)}</FieldError>
        ) : (
          register && <FieldDescription>{tr("3–24 letters, digits or underscores.")}</FieldDescription>
        )}
      </Field>
      <Field data-invalid={error?.field === "password" || undefined}>
        <FieldLabel htmlFor="login-password">{tr("Password")}</FieldLabel>
        <InputGroup className="max-md:h-12">
          <InputGroupInput
            ref={secret}
            id="login-password"
            name="password"
            type={shown ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
            maxLength={128}
            aria-invalid={error?.field === "password" || undefined}
            className="max-md:text-base"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size={phone ? "icon-sm" : "icon-xs"}
              aria-label={shown ? tr("Hide password") : tr("Show password")}
              aria-pressed={shown}
              data-action="login:reveal"
              onClick={() => setShown(!shown)}
            >
              {shown ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error?.field === "password" ? (
          <FieldError>{said(error.message)}</FieldError>
        ) : (
          register && <FieldDescription>{tr("10 characters or more.")}</FieldDescription>
        )}
      </Field>
      {error && !error.field && <FieldError>{said(error.message)}</FieldError>}
    </FieldGroup>
  );
  const actions = (
    <div className="flex flex-col gap-4">
      <Button type="submit" size="lg" disabled={pending} data-action="login:submit" className="w-full max-md:h-12 max-md:text-base">
        {pending ? (register ? tr("Creating account…") : tr("Signing in…")) : register ? tr("Create account") : tr("Sign in")}
      </Button>
      {register && <Consent />}
      <FieldSeparator className="md:[&_[data-slot=field-separator-content]]:bg-card">{tr("or")}</FieldSeparator>
      <Tip content={tr("Coming soon")}>
        <span className="flex w-full" tabIndex={0}>
          <Button type="button" variant="outline" size="lg" disabled aria-describedby="google-soon" className="w-full max-md:h-12 max-md:text-base">
            <GoogleMark />
            {tr("Continue with Google")}
            <Badge id="google-soon" variant="secondary" className="ml-1">
              {tr("Soon")}
            </Badge>
          </Button>
        </span>
      </Tip>
      {!expired && (
        <Button type="button" variant="ghost" data-action="login:guest" onClick={leave} className="w-full text-muted-foreground max-md:h-12 max-md:text-base">
          {tr("Continue without an account")}
        </Button>
      )}
      {s.localData && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" data-slot="login-kept">
          <HardDrive className="size-3.5" />
          {tr("Your times on this device will be kept.")}</p>
      )}
    </div>
  );
  const head = (
    <div className="flex flex-col items-start gap-1.5 md:items-center md:text-center">
      <div className="mb-3 flex items-center gap-2.5">
        <Logo size={phone ? 24 : 22} />
        <Wordmark className="text-2xl md:text-xl" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-xl">{register ? tr("Create your account") : tr("Welcome back")}</h1>
      <p className="text-sm text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</p>
    </div>
  );
  const tabs = (
    <Tabs
      value={mode}
      onValueChange={(v: Mode) => {
        setMode(v);
        setError(null);
      }}
    >
      <TabsList className="w-full max-md:h-11!">
        <TabsTrigger value="login" data-action="login:mode:login">
          {tr("Sign in")}</TabsTrigger>
        <TabsTrigger value="register" data-action="login:mode:register">
          {tr("Create account")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  const notice = expired && (
    <Alert role="status" data-slot="login-expired">
      <AlertDescription>{tr("Your session has ended. Sign in again.")}</AlertDescription>
    </Alert>
  );

  if (phone)
    return (
      <form
        onSubmit={submit}
        noValidate
        className="login flex h-svh flex-col gap-6 overflow-y-auto bg-background px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        {head}
        {tabs}
        {notice}
        {fields}
        <div className="mt-auto">{actions}</div>
      </form>
    );
  return (
    <main className="login flex h-svh items-center justify-center overflow-y-auto bg-background p-6">
      <Card className="w-full max-w-sm py-8">
        <CardContent className="px-8">
          <form onSubmit={submit} noValidate className="flex flex-col gap-6">
            {head}
            {tabs}
            {notice}
            {fields}
            {actions}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

/** Creating an account accepts the terms of use; the privacy policy says what is kept. One sentence, its links in place. */
function Consent() {
  const links: Record<string, [string, string]> = { terms: [legalPath("terms"), tr("terms of use")], privacy: [legalPath("privacy"), tr("privacy policy")] };
  return (
    <p className="text-center text-xs text-muted-foreground" data-slot="consent">
      {tr("By creating an account, you accept the {terms} and the {privacy}.")
        .split(/(\{terms\}|\{privacy\})/)
        .map((part, i) => {
          const link = links[part.slice(1, -1)];
          return link ? (
            <a key={i} href={link[0]} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              {link[1]}
            </a>
          ) : (
            part
          );
        })}
    </p>
  );
}
