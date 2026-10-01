/**
 * The administration (/admin): how every account uses the app. It opens with the admin token generated inside the
 * container (`cubix-api admin-token`), which POST /api/admin/login trades for an HttpOnly session cookie of one day.
 * Independent of the app's own sign-in; it never starts the app's data engine.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AppWindow, Globe, KeyRound, LayoutDashboard, LogOut, RotateCw, Server as ServerIcon, Users as UsersIcon, type LucideIcon } from "lucide-react";
import { applyTheme } from "../theme";
import { Logo, usePhone, WindowSidebar } from "../base";
import { Toasts } from "../Toasts";
import { admin, AdminError, LiveContext, navigate, onExpired, refreshAll, useLive, useRefreshed, useRoute } from "./api";
import { NUMERIC } from "./parts";
import { Overview } from "./overview";
import { Users } from "./users";
import { User } from "./user";
import { Requests } from "./requests";
import { Ips } from "./ips";
import { Server } from "./server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const VIEWS: [id: string, label: string, icon: LucideIcon][] = [
  ["overview", "Overview", LayoutDashboard],
  ["users", "Users", UsersIcon],
  ["requests", "Requests", Activity],
  ["ips", "IP addresses", Globe],
  ["server", "Server", ServerIcon],
];
const COMMAND = "cubix-api admin-token";

function AdminApp() {
  const [phase, setPhase] = useState<"checking" | "login" | "in" | "offline">("checking");
  const [notice, setNotice] = useState("");
  const check = () => {
    setPhase("checking");
    admin("/session").then(
      () => setPhase("in"),
      (error: AdminError) => {
        if (error.status === 0) return setPhase("offline");
        setNotice(error.status === 503 ? "Administration is off: no admin token has been generated yet." : "");
        setPhase("login");
      },
    );
  };
  useEffect(() => {
    onExpired((message) => {
      setNotice(/revoked|expired|required/i.test(message) ? "Your admin session has ended. Paste the token again." : message);
      setPhase("login");
    });
    check();
  }, []);
  return (
    <TooltipProvider delay={300}>
      {phase === "in" ? (
        <Shell
          onSignOut={async () => {
            await admin("/logout", { method: "POST" }).catch(() => {});
            setNotice("Signed out.");
            setPhase("login");
          }}
        />
      ) : phase === "login" ? (
        <TokenScreen notice={notice} onIn={() => setPhase("in")} />
      ) : phase === "offline" ? (
        <main className="flex h-svh items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">The server cannot be reached.</p>
            <Button variant="outline" onClick={check}>
              <RotateCw />
              Try again
            </Button>
          </div>
        </main>
      ) : (
        <main className="flex h-svh items-center justify-center p-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-72 w-full max-w-sm rounded-xl" />
        </main>
      )}
      <Toasts light={false} />
    </TooltipProvider>
  );
}

/** The admin token, pasted: one field and the command that generates it. */
function TokenScreen({ notice, onIn }: { notice: string; onIn: () => void }) {
  const [token, setToken] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const phone = usePhone();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!token.trim()) return setError("Paste the admin token.");
    setPending(true);
    setError("");
    try {
      await admin("/login", { method: "POST", body: { token: token.trim() } });
      setToken("");
      onIn();
    } catch (reason) {
      const status = (reason as AdminError).status;
      setError(
        status === 503
          ? "No admin token has been generated yet. Run the command above in the container."
          : status === 401
            ? "This token is wrong, or it has been replaced by a newer one."
            : status === 429
              ? "Too many attempts. Wait a minute, then try again."
              : (reason as Error).message,
      );
    } finally {
      setPending(false);
    }
  }
  const form = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6" data-slot="admin-login">
      <div className={cn("flex flex-col gap-1.5", !phone && "items-center text-center")}>
        <div className="mb-3 flex items-center gap-2.5">
          <Logo size={22} />
          <span className="text-lg font-semibold tracking-tight">cubix</span>
          <span className="text-lg text-muted-foreground">admin</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">How every account uses the app.</p>
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="admin-token">Admin token</FieldLabel>
        <Input
          id="admin-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cbx_admin_…"
          autoComplete="off"
          spellCheck={false}
          autoFocus={!phone}
          aria-invalid={!!error || undefined}
          className={cn(NUMERIC, phone && "h-12 text-base md:text-base")}
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            Generated inside the container with <Kbd className="font-sans">{COMMAND}</Kbd>
          </FieldDescription>
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending} className={cn("w-full", phone && "mt-auto h-12 text-base")} data-action="admin:login">
        <KeyRound />
        {pending ? "Checking…" : "Open administration"}
      </Button>
    </form>
  );
  if (phone) return <main className="flex h-svh flex-col overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)] *:flex-1">{form}</main>;
  return (
    <main className="flex h-svh items-center justify-center overflow-y-auto p-6">
      <Card className="w-full max-w-sm py-8">
        <CardContent className="px-8">{form}</CardContent>
      </Card>
    </main>
  );
}

function Nav({ view }: { view: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu className="gap-0.5" aria-label="Views">
      {VIEWS.map(([id, label, I]) => (
        <SidebarMenuItem key={id}>
          <SidebarMenuButton
            isActive={view === id}
            aria-current={view === id ? "page" : undefined}
            tooltip={label}
            data-action={"admin:nav:" + id}
            className="h-9 text-muted-foreground data-active:text-foreground"
            render={
              <a
                href={id === "overview" ? "/admin" : "/admin/" + id}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  setOpenMobile(false);
                  navigate(id === "overview" ? "/admin" : "/admin/" + id);
                }}
              />
            }
          >
            <I />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { view, id } = useRoute();
  const phone = usePhone();
  const live = useLive(true);
  const refreshed = useRefreshed();
  useEffect(() => {
    document.title = (VIEWS.find(([v]) => v === view)?.[1] ?? "Account") + " · Qbix admin";
  }, [view]);
  const body =
    view === "users" && id ? (
      <User key={id} id={id} phone={phone} />
    ) : view === "users" ? (
      <Users phone={phone} />
    ) : view === "requests" ? (
      <Requests phone={phone} />
    ) : view === "ips" ? (
      <Ips phone={phone} />
    ) : view === "server" ? (
      <Server />
    ) : (
      <Overview phone={phone} />
    );
  return (
    <LiveContext.Provider value={live}>
      <WindowSidebar
        className="h-svh min-h-0 overflow-hidden"
        style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
      >
        <Sidebar collapsible="icon" className="border-sidebar-border">
          <SidebarHeader className="pt-4">
            <div className="flex h-8 items-center gap-2.5 px-2">
              <Logo size={16} />
              <span className="text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                cubix <span className="font-normal text-muted-foreground">admin</span>
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <Nav view={view} />
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="pb-4">
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Open the app" className="h-9 text-muted-foreground" render={<a href="/" />}>
                  <AppWindow />
                  <span>Open the app</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Sign out" className="h-9 text-muted-foreground" onClick={onSignOut} data-action="admin:logout">
                  <LogOut />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 md:px-6 xl:px-8">
            {phone && (
              <>
                <SidebarTrigger variant="outline" size="icon" aria-label="Views" data-action="admin:menu" />
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Logo size={14} /> admin
                </span>
              </>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" data-slot="live" data-connected={live.connected || undefined}>
              <span className={cn("size-1.5 rounded-full", live.connected ? "bg-success" : "bg-muted-foreground/50")} aria-hidden="true" />
              {live.connected ? "Live" : "Reconnecting…"}
            </span>
            <span className={cn(NUMERIC, "text-xs text-muted-foreground max-sm:hidden")} data-slot="refreshed">
              {refreshed ? "Updated " + new Date(refreshed).toLocaleTimeString("en-GB") : ""}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Refresh" onClick={refreshAll} data-action="admin:refresh">
              <RotateCw />
            </Button>
            {!phone && (
              <Button variant="outline" size="sm" onClick={onSignOut} data-action="admin:logout:header">
                <LogOut />
                Sign out
              </Button>
            )}
          </header>
          <div data-admin-scroll className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 pb-10 md:px-6 xl:px-8">{body}</div>
          </div>
        </SidebarInset>
      </WindowSidebar>
    </LiveContext.Provider>
  );
}

applyTheme("t3-code", false);
document.title = "Qbix admin";
createRoot(document.getElementById("root")!).render(<AdminApp />);
