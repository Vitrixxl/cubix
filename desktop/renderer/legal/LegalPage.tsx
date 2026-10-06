/**
 * The legal pages (/legal, /privacy, /terms): one document at a time, the other two a click away, in French or in
 * English. Written to HTML at build time in French (desktop/web.ts) so they read without JavaScript, then hydrated;
 * they then take English when the device's language is not French.
 */
import { useEffect, useState } from "react";
import { preferred } from "../../../src/client/i18n";
import { ArrowLeft } from "lucide-react";
import { Logo, Wordmark } from "../logo";
import { DOCUMENTS, type DocumentId, type DocumentLanguage } from "./documents";
import { IDENTITY, missing } from "./identity";
import { LEGAL_DOCUMENTS } from "./paths";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const NAV: Record<DocumentLanguage, Record<DocumentId, string>> = {
  fr: { legal: "Mentions légales", privacy: "Confidentialité", terms: "Conditions d'utilisation" },
  en: { legal: "Legal notice", privacy: "Privacy", terms: "Terms of use" },
};
const UPDATED: Record<DocumentLanguage, string> = { fr: "Dernière mise à jour :", en: "Last updated:" };
const BACK: Record<DocumentLanguage, string> = { fr: "Retour à Qbix", en: "Back to Qbix" };
const DRAFT: Record<DocumentLanguage, string> = {
  fr: "Certaines informations de cette page sont encore à compléter.",
  en: "Some details of this page are still to be filled in.",
};
const date = (iso: string, language: DocumentLanguage) => new Date(iso + "T12:00:00Z").toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

export function LegalPage({ id, initial = "fr" }: { id: DocumentId; initial?: DocumentLanguage }) {
  const [language, setLanguage] = useState<DocumentLanguage>(initial);
  // Written in French; a visitor whose language is not French reads it in English once the page is up.
  useEffect(() => {
    if (preferred() !== "fr") setLanguage("en");
  }, []);
  const doc = DOCUMENTS[id][language];
  const draft = Object.values(IDENTITY).some((v) => typeof v === "string" && missing(v)) || Object.values(IDENTITY.host).some(missing);
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground" lang={language}>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <a href="/" className="flex items-center gap-2 rounded-sm" aria-label="Qbix">
            <Logo size={20} />
            <Wordmark className="text-lg" />
          </a>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={language === "fr" ? "Documents légaux" : "Legal documents"}>
            {LEGAL_DOCUMENTS.map(({ id: d, path }) => (
              <a key={d} href={path} aria-current={d === id ? "page" : undefined} className="rounded-sm text-muted-foreground hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground">
                {NAV[language][d]}
              </a>
            ))}
          </nav>
          <ToggleGroup aria-label="Langue · Language" variant="outline" size="sm" spacing={1} value={[language]} onValueChange={(v: string[]) => v[0] && setLanguage(v[0] as DocumentLanguage)} className="ml-auto">
            <ToggleGroupItem value="fr" lang="fr" className="px-2.5">FR</ToggleGroupItem>
            <ToggleGroupItem value="en" lang="en" className="px-2.5">EN</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <article
          className={cn(
            "flex flex-col text-[15px] leading-relaxed text-muted-foreground",
            "[&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_li]:pl-1 [&_p]:mb-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mb-3 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5",
          )}
        >
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">{doc.title}</h1>
          <p className="mt-2 mb-8 text-sm">
            {UPDATED[language]} {date(IDENTITY.updated, language)}
          </p>
          {draft && <p className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">{DRAFT[language]}</p>}
          {doc.intro}
          {doc.sections.map((s) => (
            <section key={s.title} id={s.id} className="mt-6 scroll-mt-6">
              <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-3xl items-center px-5 py-6 text-sm">
          <a href="/timer" className="flex items-center gap-2 rounded-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {BACK[language]}
          </a>
        </div>
      </footer>
    </div>
  );
}
