/**
 * The mobile mockups while they are drawn: one address per page of the app, read from parts/ at each request, and
 * reloaded in the browser as soon as a part changes.
 *
 *   bun docs/maquettes/serve.ts      → http://127.0.0.1:8787
 *   bun docs/maquettes/serve.ts --build   → docs/maquettes-mobile.html, every page in one file
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir, parts = join(dir, "parts");
const PLANNED: [id: string, label: string][] = [
  ["timer", "01 · Timer"], ["session", "02 · Session"], ["stats", "03 · Statistics"], ["analysis", "04 · Analysis"],
  ["replay", "05 · Solve replay"], ["assisted", "06 · Assisted solve"], ["learn", "07 · Courses"], ["course", "08 · Course step"],
  ["training", "09 · Training setup"], ["practice", "10 · Training session"], ["algorithms", "11 · Algorithms"], ["set", "12 · A set"],
  ["case", "13 · A case"], ["duel", "14 · Duel"], ["tournaments", "15 · Tournaments"], ["match", "16 · Battle"], ["daily", "17 · Daily"],
  ["profile", "18 · Profile"], ["achievements", "19 · Achievements"], ["settings", "20 · Settings"], ["welcome", "21 · Welcome"],
  ["messages", "22 · Messages"], ["people", "23 · Community"], ["coaching", "24 · Coaching"],
];
const files = () => readdirSync(parts).filter((f) => f.endsWith(".html")).sort();
/** Every finished section of the parts, by id. */
function sections() {
  const found = new Map<string, string>();
  for (const f of files()) {
    // A part's own <style> blocks go with each of its sections.
    const text = readFileSync(join(parts, f), "utf8"), chunks = text.split(/(?=<section class="page")/).filter((c) => c.startsWith("<section"));
    const prelude = (text.match(/<style>[\s\S]*?<\/style>/g) ?? []).join("\n");
    for (const chunk of chunks) {
      const id = /^<section class="page" id="([^"]+)"/.exec(chunk)?.[1], end = chunk.lastIndexOf("</section>");
      if (id && end >= 0) found.set(id, prelude + chunk.slice(0, end + "</section>".length));
    }
  }
  return found;
}
const version = () => Math.max(0, ...files().map((f) => statSync(join(parts, f)).mtimeMs), statSync(join(dir, "head.html")).mtimeMs, statSync(join(dir, "tail.html")).mtimeMs);
function page(body: string, live: boolean, intro = true) {
  const done = sections();
  const links = PLANNED.map(([id, label]) => ({ href: live ? `/p/${id}` : `#${id}`, label, done: done.has(id) }));
  const reload = live ? `<script>let v=${version()};setInterval(async()=>{const n=+(await (await fetch("/__v")).text());if(n!==v)location.reload()},1500)</script>` : "";
  const head = readFileSync(join(dir, "head.html"), "utf8");
  return (intro ? head : head.replace(/<header class="doc-head">[\s\S]*?<\/header>/, "")) + body + `<script>window.PAGES=${JSON.stringify(links)}</script>` + reload + readFileSync(join(dir, "tail.html"), "utf8");
}
function index() {
  const done = sections();
  const rows = PLANNED.map(([id, label]) => `<a class="li ${done.has(id) ? "on" : ""}" href="/p/${id}" style="text-decoration:none;color:inherit"><span class="dot ${done.has(id) ? "ok" : "faint"}"></span><span class="h3 grow">${label}</span><span class="s">${done.has(id) ? "prête" : "en cours…"}</span></a>`);
  return `<section class="page" id="index" style="padding-top:0"><div class="page-head"><h2>Pages <small>${done.size} / ${PLANNED.length} prêtes · <a class="pri" href="/all">tout voir</a></small></h2><p>La liste se met à jour toute seule pendant que les agents dessinent.</p></div><div class="card" style="max-width:640px">${rows.join("")}</div></section>`;
}

if (process.argv.includes("--build")) {
  const all = [...sections().values()].join("\n");
  writeFileSync(join(dir, "../maquettes-mobile.html"), page(all, false));
  console.log("docs/maquettes-mobile.html");
  process.exit(0);
}
const root = join(dir, "../..");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 8787),
  fetch(req) {
    const path = new URL(req.url).pathname, html = (s: string) => new Response(s, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "/__v") return new Response(String(version()));
    if (path.startsWith("/desktop/assets/fonts/")) return new Response(Bun.file(join(root, path)));
    if (path === "/all") return html(page([...sections().values()].join("\n"), true));
    const id = /^\/p\/([a-z]+)$/.exec(path)?.[1];
    if (id) {
      const s = sections().get(id);
      if (s) return html(page(s, true, false));
      return html(page(s ?? `<section class="page"><div class="page-head"><h2>${PLANNED.find(([p]) => p === id)?.[1] ?? id}</h2><p>Pas encore dessinée : la page se recharge toute seule dès qu'elle arrive.</p></div></section>`, true, false));
    }
    return html(page(index(), true));
  },
});
console.log(`http://${server.hostname}:${server.port}`);
