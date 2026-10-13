/** Google Identity Services, shared by the web's sign-in dialog (desktop/renderer/login.tsx) and the phone app on the web. */
/** What Google's script puts on `window.google` that the sign-in uses. */
export type Gsi = {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
};
/** Google's script, one tag for the page, loaded the first time a sign-in shows. */
let gsi: Promise<Gsi> | undefined;
export function loadGsi() {
  return (gsi ??= new Promise<Gsi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve((window as any).google.accounts.id);
    script.onerror = () => ((gsi = undefined), script.remove(), reject(new Error("Google sign-in did not load. Check your connection.")));
    document.head.append(script);
  }));
}
