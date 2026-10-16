/**
 * The player's WCA ID (src/client/lib/wca.ts): a button beside the name opens their page in the WCA pages
 * (wca/page.tsx), their records beside the Qbix ones; a WCA ID not given yet is typed in a dialog first, the person
 * found shown before it is linked.
 */
import React, { useState } from "react";
import { toast } from "sonner";
import { store as s } from "../store";
import { call } from "../bridge";
import { go } from "../navigation";
import { tr } from "../../../src/client/i18n";
import { plural } from "../../../src/client/lib/format";
import { PROFILE_KEY, journeyProfile } from "../../../src/client/lib/journey";
import { wcaIdOf, wcaUrl, type WcaPerson } from "../../../src/client/lib/wca";
import { Modal, Tip, said } from "../ui";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A person's page in the app's WCA pages (wca/page.tsx), which links on to the WCA's own. */
export function WcaLink({ id }: { id: string }) {
  return (
    <UiButton variant="ghost" data-action="wca:page" onClick={() => go(wcaUrl("persons/" + id))} className="text-muted-foreground">
      WCA
    </UiButton>
  );
}

/** Links `id` to the player's profile (none: unlinks it), then opens their page. */
export async function linkWca(id?: string) {
  const profile = journeyProfile(s.journey);
  if (!profile) return;
  const { wcaId: _, ...rest } = profile;
  try {
    await s.updateJourney({ [PROFILE_KEY]: id ? { ...rest, wcaId: id } : rest });
    if (id) go(wcaUrl("persons/" + id));
  } catch (reason) {
    toast.error(said((reason as Error).message));
  }
}

/** The button beside the name: the player's WCA page, or the way to link their WCA ID. */
export function WcaButton() {
  const [open, setOpen] = useState(false),
    profile = journeyProfile(s.journey);
  if (!profile) return null;
  return (
    <>
      <Tip content="World Cube Association">
        <UiButton variant="ghost" size="sm" data-action="wca:open" aria-label={profile.wcaId ? `WCA ${profile.wcaId}` : tr("WCA ID")}
          onClick={() => (profile.wcaId ? go(wcaUrl("persons/" + profile.wcaId)) : setOpen(true))} className="ml-auto shrink-0 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground">
          WCA
        </UiButton>
      </Tip>
      <Modal open={open} onOpenChange={setOpen} title="WCA" className="sm:max-w-md">
        {open && <LinkForm />}
      </Modal>
    </>
  );
}

/** The WCA ID typed, the person it names found, then linked. */
function LinkForm() {
  const [text, setText] = useState(""),
    [found, setFound] = useState<WcaPerson | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    id = wcaIdOf(text);
  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      setFound(await call("wca", "persons/" + id));
    } catch (reason) {
      setError(said((reason as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void find(e)} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => (setText(e.target.value), setFound(null), setError(""))} placeholder="2009ZEMD01" autoFocus spellCheck={false}
          aria-label={tr("WCA ID")} aria-invalid={!!text.trim() && !id} className="uppercase" />
        <UiButton type="submit" variant="outline" disabled={!id || busy} data-action="wca:find-id">{tr("Find")}</UiButton>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {found && (
        <div className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{found.name}</p>
            <p className="truncate text-sm text-muted-foreground">{[found.countryName, plural(found.competitions, "competition")].join(" · ")}</p>
          </div>
          <UiButton type="button" data-action="wca:link" onClick={() => void linkWca(found.id)}>{tr("Link")}</UiButton>
        </div>
      )}
      <UiButton type="button" variant="ghost" className="self-start text-muted-foreground" data-action="wca:browse" onClick={() => go(wcaUrl("persons"))}>{tr("Search people")}</UiButton>
    </form>
  );
}
