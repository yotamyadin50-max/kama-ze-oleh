## SEO/GEO Review: כמה זה עולה

**Scope note before anything else:** this project is a Track B personal web game, not a local business or a native installable app. Rounds 4 (Google Business Profile/Local Pack) and 6 (App Store Optimization) in `seo-geo-agent.md` are written for a physical local business and a native app respectively; neither applies here (no address, no phone, no physical service area, no App Store/Google Play listing), so both are scoped out below rather than forced onto a project type they don't fit. Everything else in the checklist (technical/on-page, schema, E-E-A-T, GEO, llms.txt/validation, internal linking) applies and was audited and implemented for real.

### The single most important finding: this is a hash-routed SPA with exactly one crawlable URL

Checked the live rendered output directly (`document.title` and content per route), not just the source template. The site is one `index.html` shell; every "page" (`#/play`, `#/about`, `#/vs`, `#/daily`, `#/stats`) is a client-side hash route. Search engines do not treat a URL fragment (`#...`) as a separate page to crawl or index, so from Google's perspective **the entire site is one URL**: `https://yotamyadin50-max.github.io/kama-ze-oleh/`. This is a real, structural limitation, not something schema markup or meta tags can work around. Practical consequences:
- The sitemap below correctly lists exactly one real URL, not five or six invented ones. Listing hash-fragment "pages" as separate sitemap entries would be actively wrong, Google would just find the same document at every one of them.
- `document.title` still needed to change per route regardless (fixed, see Technical/On-Page below) for browser tab clarity, bookmarking, and history, even though it doesn't create separate indexed pages.
- The one real page's content (the homepage) is what has to carry the ranking weight for everything, since `/about`'s excellent, citable transparency content is currently only reachable at a fragment URL a crawler won't separately index. If deeper indexing of that content specifically becomes a priority later, the real fix is converting to path-based routing with a server (or the well-known GitHub Pages 404.html SPA-redirect trick), a real architecture change, not a metadata fix, flagged honestly rather than half-solved with fake sitemap entries.

### Critical: a real naming-collision competitor already exists

`_process/01-researcher-brief.md` (Key Facts, already gathered before this build) names a live, nearly-identical competitor: **"כמה זה עולה?"** at `guess-price-il.base44.app`, same core concept (guess real product prices), functionally the same name. This directly changes what `seo-geo-agent.md`'s own Branded Search Dominance section can honestly promise: that section is explicitly scoped to "a genuinely distinctive name with no real existing collision" and states plainly that a colliding name is a harder problem no deploy-stage technique fully overrides. **Stated honestly, not rounded up:** full identity-consistency technique (below) is still worth doing and genuinely helps, but a guaranteed #1 ranking for the bare phrase "כמה זה עולה" is not achievable here, there is a real, already-indexed competitor using essentially the same name. The realistic, honest goal is standing out on genuine differentiators once found (real Shufersal product photos per item, the country-comparison mode, the live VS Duel), not owning the exact-name search.

### Technical & On-Page SEO

| Page (hash route) | `document.title` | H1/H2 | Notes |
|---|---|---|---|
| `#/` (the one real indexed URL) | כמה זה עולה | "כמה זה עולה, באמת?" | Carries all ranking weight, see finding above |
| `#/play` | איך רוצים לשחק? · כמה זה עולה | "איך רוצים לשחק?" | Not separately indexed (hash route) |
| `#/about` | מאיפה המחירים באמת מגיעים · כמה זה עולה | "מאיפה המחירים באמת מגיעים" | Strongest E-E-A-T/GEO content on the site; not separately indexed |
| `#/vs` | VS: נגד יריב אמיתי · כמה זה עולה | "VS: נגד יריב אמיתי" | Not separately indexed |
| `#/daily` | האתגר היומי · כמה זה עולה | "האתגר היומי" | Not separately indexed |

Before this pass, `document.title` never changed across routes (verified live, always "כמה זה עולה" regardless of screen). Fixed: added a route-title map in `script.js`'s `setChrome()`, verified live across all routes. `og:image`/Twitter Card meta tags and alt text on product images were already in place from earlier this session. Added `<link rel="canonical">` pointing to the one real URL, correct given the single-URL finding above.

### Schema Markup (implemented, live)

Chose `WebApplication` (with `applicationCategory: "GameApplication"`) over `Game`/`VideoGame`, since this is the game's own site providing the interactive experience, not a page describing/reviewing a game elsewhere; `WebApplication` is Google's documented type for a browser-run interactive app. No `LocalBusiness` subtype: there's no physical business here, using one would be a real category-mismatch, the same category-alignment principle the agent file itself applies (Round 4) just correctly concluding "not applicable" here instead of forcing a wrong type.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://yotamyadin50-max.github.io/kama-ze-oleh/#website",
      "url": "https://yotamyadin50-max.github.io/kama-ze-oleh/",
      "name": "כמה זה עולה",
      "description": "נחשו מחירים אמיתיים ממדפי הסופר ומחירי Big Mac מכל העולם. שני מסלולי משחק, כל מחיר אמיתי ומאומת.",
      "inLanguage": "he",
      "isAccessibleForFree": true,
      "publisher": { "@id": "https://github.com/yotamyadin50-max/kama-ze-oleh#organization" }
    },
    {
      "@type": "WebApplication",
      "@id": "https://yotamyadin50-max.github.io/kama-ze-oleh/#webapp",
      "name": "כמה זה עולה",
      "url": "https://yotamyadin50-max.github.io/kama-ze-oleh/",
      "applicationCategory": "GameApplication",
      "operatingSystem": "Any (runs in any modern web browser)",
      "inLanguage": "he",
      "description": "משחק ניחוש מחירים מבוסס מחירים אמיתיים: ניחוש מחיר מוצר סופרמרקט אמיתי מתמונה, והשוואת מחירי אותו מוצר בין מדינות. מבוסס תקנות שקיפות מחירים ישראליות, Big Mac Index, ו-Numbeo.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "ILS" }
    },
    {
      "@type": "Organization",
      "@id": "https://github.com/yotamyadin50-max/kama-ze-oleh#organization",
      "name": "כמה זה עולה",
      "url": "https://yotamyadin50-max.github.io/kama-ze-oleh/",
      "sameAs": ["https://github.com/yotamyadin50-max/kama-ze-oleh"]
    }
  ]
}
```

- Validation: parsed successfully with `JSON.parse` against the live rendered page (not the template), all three `@type` values confirmed present in the actual DOM (`WebSite`, `WebApplication`, `Organization`). Not run through Google's Rich Results Test itself (no live web access in this role, and that tool requires an external network call this role doesn't make); recommend the user run the live URL through `search.google.com/test/rich-results` once, a two-minute manual check, since validity confers eligibility only, never a guaranteed rich-result display, stated plainly rather than promised.
- `sameAs`: exactly one real, verified, owned entry (the GitHub repo). No social profiles exist for this project; none were invented.

### E-E-A-T Audit

- **Experience:** genuinely strong. The About page states directly what was actually done (fetched Shufersal's live category pages, sourced real per-product photos from Shufersal's own CDN), including honest admissions of what was NOT achieved (two categories excluded for lacking a real image, cat litter/frozen meat came in under target). This kind of specific, checkable "here's exactly what we did and where it fell short" is real Experience signal, not a stock claim.
- **Expertise:** the regulatory citation (תקנות קידום התחרות בענף המזון, תשע"ה-2014) is named exactly, with a real source link (nevo.co.il) on the About page. Real, specific, checkable.
- **Authoritativeness:** the site cites real external, independent sources for every non-Shufersal price (Big Mac Index/The Economist, Numbeo, Deutsche Bank/Apple), each linked. This is the site's strongest E-E-A-T asset, real outside validation baked into the product itself, not bolted on as a testimonial.
- **Trustworthiness:** no dead links found in spot checks; every price displays its own source and check-date inline. One honest gap worth naming for completeness: the bulk-sourced majority of the catalog (everything beyond the original 21 hand-picked items) was pulled from live category pages but not manually cross-checked item-by-item against a second source, and the About page already says so plainly rather than overselling it. That's the correct call, stating it here confirms it, not flagging it as something to fix.

### GEO Readiness

- The About page already has real, specific, sourced statistics (the exact regulation number and year, named data sources with links) rather than vague claims, this is exactly what Round 2's Cite Sources/Statistics Addition tactics ask for, already present by construction of how this project was built (real data, honestly disclosed), not added retroactively for this audit.
- Not yet present: an explicit answer-first lead sentence and Q&A-style subheadings on the About page. Recommendation for a future content pass (not implemented in this session, a copy change to already-reviewed honesty language is a real edit risk to make casually): open with a one-sentence direct answer ("כל מחיר באתר הזה אמיתי, ממקור מאומת אחד מתוך רשימה קבועה") before the current narrative explanation, and consider one FAQ-style heading ("האם המחירים מתעדכנים בזמן אמת?") since the honest "no, refreshed periodically" answer is already written in prose form and would work well restructured as a direct Q&A pair.
- Platform-aware note: given the single-URL structural limit above, Perplexity's freshness-reward behavior and ChatGPT Search's reliance on a crawlable sitemap both point the same direction as the top finding, the one real page and its `llms.txt` are doing all the GEO work this site can currently do; there's no second or third page to optimize separately yet.

### Google Business Profile & Local Pack

Not applicable. No physical business, no address, no service area, no GBP listing exists or should exist for a personal web game. Scoped out honestly rather than forcing a local-business framework onto a project that isn't one.

### Internal Linking Map

Small-site nav-level linking already covers every real route via the bottom tab bar and drawer (Play/VS/Daily/Stats always reachable, About/Settings via the drawer), so there are no orphan routes in the traditional sense. The real, honest caveat is the finding above: since these are hash routes, "internal linking" here helps a human user and a JS-executing AI crawler navigate, but does not pass traditional link-equity signal between separately-indexed pages, because there's only one indexed page for signal to flow between. `BreadcrumbList` schema was not added: with a single real URL and a flat (not hierarchical) route structure, there is no real breadcrumb hierarchy to mark up honestly.

### llms.txt & Freshness

File shipped at `/llms.txt` (site root), live and verified reachable (HTTP 200). Content: a one-line honest summary, grouped real links to Play/Daily/About/GitHub, plus an explicit technical note explaining the hash-routing/single-URL limitation to any AI reader, the same honesty this file states above rather than a cleaner-looking but misleading link list.

**Update-cadence recommendation for the user:** this is genuinely updatable content (product prices and the catalog itself), not a static brochure site, so a real cadence is worth stating rather than treating this as a one-time deliverable. The About page already discloses that prices are refreshed periodically, not live; recommend picking an actual real cadence (for example, monthly) and updating `sitemap.xml`'s `<lastmod>` and the catalog together when it happens, since a sitemap `lastmod` that never changes after today stops being a real freshness signal.

### For the loop

`[2026-08-14] | seo-geo | O-output/27-kama-ze-oleh | A hash-routed client-side SPA (no server, no History API routing) collapses to exactly one crawlable/indexable URL regardless of how many distinct in-app screens it has; sitemap.xml, canonical tags, and per-route content strategy must all be built around that one real URL, not the app's internal route list, or they become actively misleading rather than just incomplete | Generalizes to every other Track B build in this system using the same hash-router pattern (this system's own website-workflow default for a game/app-style build, not just this project) — worth a standing note in `site-planner-agent.md` or `seo-geo-agent.md` itself: a build meant for real public search reach should default to path-based routing (History API + a host that supports SPA fallback, or GitHub Pages' 404.html redirect trick) from the start if any individual screen's content (an About/methodology page especially) is meant to be separately findable, since retrofitting routing after real traffic/indexing exists is a much bigger cost than choosing it at Site Planner's original architecture decision.