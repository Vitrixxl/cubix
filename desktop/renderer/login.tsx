/**
 * The sign-in dialog, over the page in view (`s.askSignIn`, or the address /login): the pages of an account
 * (`ACCOUNT_PAGES`) ask for it, the rest of the app is used without one, on this device.
 * Sign in with Google (Google Identity Services, its button drawn by Google in a frame); the account is created the
 * first time. Dev and test servers also take a bare username (`dev` of /api/auth/config). Times this device already
 * holds outside any account join the account either way (see `importGuest` in src/client/local/client.ts).
 */
import { useEffect, useRef, useState } from "react";
import { HardDrive } from "lucide-react";
import { store as s } from "./store";
import { call } from "./bridge";
import { Modal } from "./ui";
import { Brand } from "./logo";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { language, tr } from "../../src/client/i18n";
import { said } from "./base";
import { legalPath } from "./legal/paths";
import { go } from "./navigation";
import { loadGsi } from "../../src/client/lib/googleSignIn";

type AuthConfig = { google: string | null; dev: boolean };
/** Asked once a page; asked again after a failure (offline). */
let config: Promise<AuthConfig> | undefined;
const authConfig = () => (config ??= (call("authConfig") as Promise<AuthConfig>).catch((e) => ((config = undefined), Promise.reject(e))));
/** Google's callback, set at its single `initialize`: the dialog open now. */
let onCredential = (_credential: string) => {};
let initialized = "";

/** Open while the overlay is "signin"; an ended session keeps it open until signed in again. */
export function SignInDialog() {
  return (
    <Modal open={s.overlay === "signin" || s.expired} onOpenChange={(open) => !open && s.closeOverlay()} dismissible={!s.expired}
      initialFocus={() => document.getElementById("login-username")}
      title={tr("Sign in")} hideHeader tall="full">
      <SignIn />
    </Modal>
  );
}

function SignIn() {
  const [settings, setSettings] = useState<AuthConfig | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [username, setUsername] = useState("");
  const button = useRef<HTMLDivElement>(null);
  const expired = s.expired;

  async function signIn(method: "google" | "devLogin", value: string) {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      // Signed in, the dialog closes on the page in view, or the one that asked for an account.
      const next = s.signInNext;
      await s.authenticate(method, value);
      if (next) go(next);
    } catch (reason) {
      setError((reason as Error)?.message || "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }
  onCredential = (credential) => void signIn("google", credential);

  useEffect(() => {
    authConfig().then(setSettings, (reason: Error) => setError(reason.message));
  }, []);
  // Google draws its button in a frame, in the app's look and language, again when the look changes.
  useEffect(() => {
    const id = settings?.google;
    if (!id) return;
    let live = true;
    loadGsi().then((google) => {
      if (!live || !button.current) return;
      if (initialized !== id) google.initialize({ client_id: id, callback: ({ credential }) => onCredential(credential) });
      initialized = id;
      google.renderButton(button.current, {
        theme: s.light ? "outline" : "filled_black", size: "large", shape: "rectangular", "text": "continue_with",
        width: Math.min(400, button.current.clientWidth), locale: language(),
      });
    }, (reason: Error) => live && setError(reason.message));
    return () => { live = false; };
  }, [settings, s.light]);

  return (
    <div className="login flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <Brand size={30} className="mb-3 text-[24px]" />
        <h2 className="text-2xl font-extrabold tracking-[-0.03em]">{tr("Welcome to Qbix")}</h2>
        <p className="text-sm text-muted-foreground">{tr("Time your solves, learn algorithms, race in duels.")}</p>
      </div>
      {expired && (
        <Alert role="status" data-slot="login-expired">
          <AlertDescription>{tr("Your session has ended. Sign in again.")}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3">
        {settings?.google && <div ref={button} className="flex h-10 w-full justify-center" data-slot="login-google" aria-busy={pending || undefined} />}
        {error && <FieldError>{said(error)}</FieldError>}
      </div>
      {settings?.dev && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) void signIn("devLogin", username.trim());
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="login-username">{tr("Dev sign-in")}</FieldLabel>
            <Input id="login-username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dev" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={24} />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending || !username.trim()} data-action="login:dev">
            {tr("Sign in")}
          </Button>
        </form>
      )}
      <div className="mt-auto flex flex-col gap-4">
        {!expired && (
          <Button type="button" variant="ghost" data-action="login:guest" onClick={s.closeOverlay} className="w-full text-muted-foreground">
            {tr("Continue without an account")}
          </Button>
        )}
        {s.localData && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" data-slot="login-kept">
            <HardDrive className="size-3.5" />
            {tr("Your times on this device will be kept.")}</p>
        )}
        <Consent />
      </div>
    </div>
  );
}

/** Signing in accepts the terms of use; the privacy policy says what is kept. One sentence, its links in place. */
function Consent() {
  const links: Record<string, [string, string]> = { terms: [legalPath("terms"), tr("terms of use")], privacy: [legalPath("privacy"), tr("privacy policy")] };
  return (
    <p className="text-center text-xs text-muted-foreground" data-slot="consent">
      {tr("By continuing, you accept the {terms} and the {privacy}.")
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
