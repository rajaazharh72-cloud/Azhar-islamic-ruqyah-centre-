# Azhar Islamic Ruqyah Centre

A bilingual (English / اردو) single-page website for a Muslim spiritual healer performing
**Ruqyah Shar'iyyah** strictly according to the Qur'an and the Sunnah of the Prophet
Muhammad ﷺ.

Static site — **no build step, no framework, no dependencies to install.** Plain semantic
HTML, modern CSS, and vanilla JavaScript. It runs by opening `index.html`, and deploys to any
static host as-is.

**Live:** https://azhar-islamic-ruqyah-centre.vercel.app

---

## Deploying to Vercel

The repository is import-ready. In Vercel → **Add New… → Project → Import** this repo, and use:

| Setting | Value |
|---|---|
| **Framework Preset** | Other |
| **Root Directory** | `./` |
| **Build Command** | *(none — leave empty / disabled)* |
| **Install Command** | *(none — leave empty / disabled)* |
| **Output Directory** | *(none — repository root is served)* |

There is nothing to build: Vercel serves the files directly. `vercel.json` layers on clean
URLs, security headers (HSTS, CSP, `nosniff`, frame and referrer policy), and sensible caching
(long-lived, revalidating for `assets/`; always-fresh for the HTML). `.vercelignore` keeps the
dev tooling (`scripts/`, `design/`, `tools/`) out of the public deployment.

HTTPS/SSL is automatic and free on Vercel for both the default `*.vercel.app` domain and any
custom domain you connect.

### Connecting a custom domain

1. Vercel → Project → **Settings → Domains** → add `yourdomain.com` **and** `www.yourdomain.com`.
2. Set the apex (`yourdomain.com`) as **Primary**; Vercel then auto-redirects `www` → apex.
3. At your registrar, create the DNS records Vercel shows — typically:

   | Type | Name | Value |
   |---|---|---|
   | `A` | `@` | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

   (Use the exact values from your Vercel dashboard — they are authoritative.)
4. **Then update the origin site-wide**: find-replace
   `https://azhar-islamic-ruqyah-centre.vercel.app` → `https://yourdomain.com` in
   `index.html` (canonical, Open Graph, Twitter, JSON-LD), `robots.txt` and `sitemap.xml`, and
   redeploy. SSL is issued automatically once DNS resolves.

---

## Content you must replace before launch

Search the project for `PLACEHOLDER` and `PHONE_NUMBER_HERE`. All of these are intentional:

| What | Where |
|---|---|
| WhatsApp + phone number | `wa.me/PHONE_NUMBER_HERE` and `tel:` links, JSON-LD `telephone` — digits only, e.g. `447700900123` |
| Availability hours | Contact section, JSON-LD |
| Fees / sadaqah policy | FAQ answer |
| Testimonials | Four cards, each tagged with an orange **PLACEHOLDER** flag — replace only with real, permission-given testimony, kept anonymous |
| Address / service area | JSON-LD `address` and `areaServed` |

The site never promises a cure, never sells amulets, and states plainly that using or
contracting with jinn is sorcery and forbidden. Please keep that posture in anything you add.

---

## Structure

```
index.html                 Every section, all content, SEO meta, JSON-LD, icon sprite
assets/css/base.css        Design tokens, reset, typography, layout, motion, RTL
assets/css/components.css  Navbar, hero, tiles, verses, accordions, footer, language switch
assets/js/i18n.js          The English/Urdu dictionary and the runtime that swaps languages
assets/js/main.js          Nav, scroll reveal, tilt, symptom checklist, language switch
assets/js/hero.js          Three.js "Shifa" calligraphy hero (lazy-loaded, reduced-motion aware)
assets/img/                Logo variants, favicons, Open Graph card
vercel.json                Headers, caching, clean URLs
robots.txt · sitemap.xml   SEO
design/                    Master logo artwork (not deployed — see .vercelignore)
scripts/                   Local preview + share tooling (not deployed)
```

### The language toggle

The site is bilingual from **one DOM** — there is no second copy of the page. Every
translatable element carries `data-i18n="key"` (or `data-i18n-attr="attr:key"`). The Urdu
dictionary lives in `assets/js/i18n.js`; the English is snapshotted from the markup itself, so
the two can never drift. An inline `<head>` script sets the language before first paint, so
there is no flash of the wrong language. Choice persists in `localStorage`, and `?lang=en` /
`?lang=ur` force a language by URL.

Qur'anic Arabic and the adhkar are identical in both languages and are never translated — only
the translation beneath each verse swaps (English ↔ Urdu), so a verse never shows three
languages at once. Urdu renders in Noto Nastaliq Urdu with RTL layout throughout.

### The 3D hero

`hero.js` imports Three.js from a pinned CDN and assembles ~7,600 golden particles into the
word **شِفَاء** (*shifa*, healing). It is loaded only when `prefers-reduced-motion` is off,
WebGL is available, and the connection is not save-data/2G — otherwise a static, glowing
fallback stands in. No layout shift either way.

---

## Accessibility & performance

- Full keyboard navigation, visible focus rings, skip link, semantic landmarks, one `<h1>`
- `prefers-reduced-motion` honoured throughout (3D scene, reveals, all animation)
- WCAG AA contrast, verified with alpha compositing against the page's gradient
- `lang` and `dir` on every Arabic and Urdu run
- Lazy-loaded 3D and below-the-fold images, no layout shift, no render-blocking JS
- The symptom self-check runs entirely in the browser — nothing stored, nothing transmitted,
  no analytics, no cookies

---

## Local preview

Browsers block ES-module loading over `file://`, so the 3D hero needs a real origin. On
Windows (this project ships without Node/Python), a dependency-free PowerShell server is
included:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Then open the printed `http://localhost:<port>/`. Opening `index.html` directly also works,
but shows the static hero fallback instead of the 3D scene.

To share a temporary public link for review, `scripts\share.cmd` opens a Cloudflare tunnel.
For anything durable, deploy to Vercel (above) — that URL is permanent.
