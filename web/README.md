# NISHIKI CRAFT — Landing Page

Next.js (App Router) + Geist (Vercel UI). The hero shows vermilion nishikigoi
(錦鯉) rendered as swimming ASCII art, inspired by
[stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks) (MIT).

## Develop

```sh
cd web
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Before shipping — fill these in

- **Discord invite** — `app/site.ts` → `discordUrl` (currently a placeholder).
- **Logo** — replace `public/logo.svg` with the real NISHIKI CRAFT logo.
  Keep the file name (or update the `src` in `app/page.tsx`).

## Deploy (Vercel)

Import the `nishiki_hp` repo into Vercel and set **Root Directory → `web`**.
Framework preset: Next.js (auto-detected). No other config needed.

The existing static pages (`/docs/privacy-policy`, `/docs/support`) stay on
GitHub Pages; the footer links point at those paths.
