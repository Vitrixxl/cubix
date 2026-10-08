import type { PuzzleId } from '../../src/shared/puzzles';
import { MethodsGuide } from './Methods';
import { NotationContent } from '../renderer/notation';
import { GUIDES, GUIDE_FOOTER, GUIDE_LINKS, GUIDE_TEXT, type Guide, type Inline } from '../../src/client/lib/guides';
import { tr } from "../../src/client/i18n";
import { said } from "../renderer/base";

/**
 * A guide's text: its sections' headings, muted paragraphs and lists, links in the accent, folded questions; the
 * first paragraph, the lead, a step larger and brighter.
 */
const PROSE =
  "flex max-w-2xl flex-col text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_p]:mb-3 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_ol]:mb-3 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-5 [&_details]:border-b [&_details]:py-3 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-foreground [&_details_p]:mt-2 [&_details_p]:mb-0 [&>p:first-of-type]:text-base [&>p:first-of-type]:text-foreground/80";

/** A paragraph's pieces: its text, links and figures in bold. */
const inline = (parts: Inline[]) => parts.map((part, i) => typeof part === 'string' ? tr(part) : 'href' in part ? <a key={i} href={part.href}>{tr(part.text)}</a> : <strong key={i}>{part.strong}</strong>);

/** A guide's text (src/client/lib/guides.ts), then the interactive part of the methods and the notation guides. */
export function GuideContent({ page, puzzle = '333', method = '' }: { page: Guide; puzzle?: PuzzleId; method?: string }) {
  return <section className={PROSE} aria-label={tr("About Qbix")}>
    <header className="mb-4"><h1 className="text-2xl font-semibold tracking-tight text-balance">{said(GUIDES[page].heading)}</h1></header>
    {GUIDE_TEXT[page].map((block, i) =>
      'h' in block ? <h2 key={i}>{tr(block.h)}</h2>
      : 'p' in block ? <p key={i}>{inline(block.p)}</p>
      : 'ol' in block ? <ol key={i}>{block.ol.map(item => <li key={item}>{tr(item)}</li>)}</ol>
      : 'q' in block ? <details key={i}><summary>{tr(block.q)}</summary><p>{tr(block.a)}</p></details>
      : <div key={i} className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 [&_h2]:mt-2 [&_p_a]:mr-3">
        {block.cards.map(card => <section key={card.h}><h2>{tr(card.h)}</h2><p>{tr(card.p)}</p><p>{inline(card.links)}</p></section>)}
      </div>)}
    {page === 'methodsGuide' && <MethodsGuide puzzle={puzzle} method={method} />}
    {page === 'notationGuide' && <NotationContent guide />}
    <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-xs [&_a]:font-normal [&_a]:text-muted-foreground" aria-label={tr("Guides")}>{inline(GUIDE_LINKS)}</nav>
    <footer className="mt-3 text-xs [&_p]:text-xs"><p>{inline([GUIDE_FOOTER[0], " ", GUIDE_FOOTER[1]])}</p></footer>
  </section>;
}
