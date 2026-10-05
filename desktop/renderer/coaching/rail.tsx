/**
 * The coaching sections, a second sidebar beside the app's in the same row (app.tsx): from no width it grows to its own
 * while the coaching page is shown, its sections pushing out from under the first sidebar, and folds back on leaving.
 */
import { Link } from "react-router";
import { store as s } from "../store";
import { coaching } from "./client";
import { url } from "./parts";
import { badge, sections } from "./sections";
import { cn } from "@/lib/utils";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function CoachingSidebar({ open }: { open: boolean }) {
  const view = s.coachingView.split("/")[0];
  return (
    // In step with the app's sidebar, which folds to its icons on this page.
    <div
      inert={!open}
      className={cn("relative h-svh shrink-0 overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear", open ? "w-56 border-r border-sidebar-border" : "w-0")}
    >
      <nav aria-label="Coaching" data-slot="coaching-nav" className="absolute inset-y-0 right-0 flex w-56 flex-col gap-2 pt-4 pb-4">
        {/* Level with the sidebar's own header. */}
        <h2 className="flex h-9 shrink-0 items-center px-4 text-base font-semibold tracking-tight">Coaching</h2>
        {sections().map((group, i) => (
          <SidebarGroup key={i} className="py-0">
            {coaching.isCoach && <SidebarGroupLabel>{i === 0 ? "Your coaching" : "Get coached"}</SidebarGroupLabel>}
            <SidebarMenu className="gap-0.5">
              {group.map(([id, label, I]) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    render={<Link to={url(id)} />}
                    data-action={"coaching:" + id}
                    isActive={view === id}
                    aria-current={view === id ? "page" : undefined}
                    className="h-9 text-muted-foreground data-active:text-foreground"
                  >
                    <I />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  {!!badge(id) && <SidebarMenuBadge className="bg-primary text-primary-foreground peer-data-[size=default]/menu-button:top-2">{badge(id)}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </nav>
    </div>
  );
}
