# English search visibility

Cubix targets the primary intent **“Rubik’s cube timer”**, with “online cube timer”,
“speedcubing timer”, “spacebar cube timer” and “mobile cube timer” described naturally
on the timer page. The app remains the first screen; readable reference content is
below it. There are no crawler-only pages or user-agent-specific responses.

## Public pages

| URL | Purpose |
| --- | --- |
| `/` | Free online cube timer, actual controls, supported puzzles, statistics and FAQ |
| `/algorithms/` | Algorithm library: F2L, OLL, PLL and the link to practice |
| `/training/` | Case selection and timed algorithm practice |
| `/guides/how-to-use-a-cube-timer/` | Desktop/touch instructions, saved data and practice modes |
| `/guides/ao5-ao12/` | Worked examples for averages, +2 and DNF |

Every public page has build-rendered English content, a unique title and description,
real HTML links, social sharing metadata and (when the origin is configured) a canonical
URL and JSON-LD. The same content remains available after React mounts. The two guides
work without JavaScript and do not load the app bundle. The sitemap contains only these
five pages, with no invented modification dates. Account, message, community and admin
pages have `noindex` metadata/headers. API routes are excluded in robots.txt.

`/timer/` and `/index.html` permanently redirect to `/`; known tools without their trailing
slash, or with `/index.html`, redirect to their canonical paths. Unknown paths remain
real 404s. The service worker caches canonical documents, so it does not cache redirected
HTML responses or turn unknown pages into successful timer pages.

## Production setup

Set the official public origin in `.env` before the production build:

```dotenv
CUBIX_PUBLIC_URL=https://YOUR-OFFICIAL-DOMAIN
```

Use the real HTTPS origin, without a path, query, fragment or credentials. Never deploy
with the `cubix.example` / `cubix.test` origins used in verification. An unset variable
omits canonical URLs and absolute sharing URLs and produces an empty sitemap rather
than guessing a domain. Docker Compose passes the origin as a frontend build argument:

```sh
docker compose up -d --build
```

For a standalone build, export `CUBIX_PUBLIC_URL` before `bun run build`.
Changing the domain requires rebuilding. The runtime does not trust a request's Host or
forwarded headers to generate canonical URLs. Ensure that the public reverse proxy
redirects HTTP and alternate hostnames to the same HTTPS origin, preserves real 404s,
and does not require authentication or a bot challenge for public content and assets.
Development robots.txt disallows crawling of the development server.

## Search Console and Bing

After the official domain is deployed:

1. Verify domain ownership in Google Search Console (DNS domain verification covers all
   protocols and subdomains) and in Bing Webmaster Tools. This needs the owner's account
   and DNS access; a source-code change alone cannot grant it.
2. Submit `https://YOUR-OFFICIAL-DOMAIN/sitemap.xml` in both tools. The robots.txt also
   advertises this sitemap. Do not use the retired sitemap ping endpoints.
3. Inspect `/`, `/algorithms/` and `/training/` with Google's live URL inspection. Confirm
   the declared canonical, successful fetch, rendered content and lack of `noindex`.
4. Request indexing of the primary pages. Check indexing reports after the next crawls.
5. Track non-branded English queries, impressions, clicks and CTR. Compare trends over
   several weeks rather than treating a single search position as a stable measure.
6. Use PageSpeed Insights / Core Web Vitals field data when enough visits are available.
   Review mobile loading, layout shifts and interaction responsiveness with 3D enabled.

The build generates Brotli and gzip copies of text assets. Rust serves the encoding the
browser supports. Build-hashed JS/CSS can be cached for a year; HTML, named workers and
the service worker revalidate. Secondary pages load through dynamic imports. PWA
pre-caching still downloads the full offline shell in the background, so initial entry
bundle size alone is not a measure of total network traffic.

`public/og-image.svg` is the editable 1200×630 sharing artwork; `public/og-image.png` is
the raster version used by social metadata. Keep both in sync when updating branding.

## Checks

```sh
bun run typecheck
bun run build:api
bun test tests/seo.test.tsx tests/seo-http.test.ts tests/navigation.test.ts tests/service-worker.test.ts
CUBIX_PUBLIC_URL=https://YOUR-OFFICIAL-DOMAIN bun run build
```

Verify the production HTML with JavaScript disabled, open every public URL directly,
check back/forward navigation, and test offline tool/guide navigation after the service
worker is ready. Validate redirects and compression against the real Rust server.

These changes improve crawlability, relevance and delivery; they do not guarantee a
particular ranking. Helpful content, product quality, real independent mentions and
consistent maintenance remain important. Do not add fake ratings, artificial link
schemes, keyword stuffing or near-duplicate doorway pages.

## References

- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: helpful, reliable content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: software application structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)

The WebApplication schema describes actual capabilities and the free price. No reviews
or aggregate ratings are asserted; eligible rich-result display is not promised.
