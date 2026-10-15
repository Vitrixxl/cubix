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
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
      initialFocus={() => document.getElementById("login-username") ?? document.querySelector<HTMLElement>(".login")}
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

  return (
    <div tabIndex={-1} className="login flex flex-1 flex-col gap-6 outline-none">
      <div className="flex flex-col items-start gap-2">
        <Brand size={30} className="mb-3 text-[24px]" />
        <h2 className="text-2xl font-extrabold tracking-[-0.03em]">{tr("Welcome to Qbix")}</h2>
        {expired && <p role="status" className="text-sm text-muted-foreground" data-slot="login-expired">{tr("Your session has ended. Sign in again.")}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {settings?.google && <GoogleButton id={settings.google} busy={pending} onError={setError} />}
        {/* A guest uses the app on this device; after an ended session, that signs the account out here. */}
        <Button type="button" variant="secondary" data-action="login:guest" onClick={() => (expired ? void s.action("guest") : s.closeOverlay())} className="w-full">
          {tr("Without an account")}
        </Button>
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

/**
 * Continue with Google, in the app's look: Google draws its own button (light, blue or black), so ours is the app's
 * button with Google's "G" on white, and Google's button lies over it, transparent, taking the click (as on the phone).
 */
function GoogleButton({ id, busy, onError }: { id: string; busy: boolean; onError: (message: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    loadGsi().then((google) => {
      if (!live || !box.current) return;
      if (initialized !== id) google.initialize({ client_id: id, callback: ({ credential }) => onCredential(credential) });
      initialized = id;
      google.renderButton(box.current, { size: "large", shape: "rectangular", "text": "continue_with", width: Math.min(400, box.current.clientWidth), locale: language() });
    }, (reason: Error) => live && onError(reason.message));
    return () => { live = false; };
  }, [id]);
  return (
    <div className={cn("group relative w-full rounded-[12px]", busy && "pointer-events-none opacity-60")} data-slot="login-google" aria-busy={busy || undefined}>
      <div aria-hidden className={cn(buttonVariants(), "w-full group-hover:bg-primary/85")}>
        <span className="grid size-6 place-items-center rounded-full bg-white"><GoogleMark /></span>
        {busy ? tr("Signing in…") : tr("Continue with Google")}
      </div>
      {/* Its frame is a light page, which a dark color-scheme would paint opaque white. */}
      <div ref={box} className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-0 [color-scheme:light]" />
    </div>
  );
}

/** Google's "G", in its four colours. */
const GoogleMark = () => (
  <svg width={16} height={16} viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

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
