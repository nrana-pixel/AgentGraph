# AgentGraph — landing site

Next.js 16 (App Router) marketing site for AgentGraph. Mirrors the dark
token system from `@agentgraph/web` so the brand is consistent end-to-end.

## Run

```bash
npm install
npm run dev     # http://localhost:3001
```

## Structure

```
app/
  layout.tsx       # html shell + Geist font preload
  page.tsx         # composes the section components
  globals.css      # design tokens (ported from web/app/globals.css)
components/
  Logo.tsx         # edge-atom mark
  Nav.tsx          # sticky nav
  Hero.tsx         # display hero + stat strip
  Showcase.tsx     # dashboard window preview
  Logos.tsx        # social-proof band
  Pillars.tsx      # Trace · Spend · Recommend
  How.tsx          # 4-step "how it works"
  Sdk.tsx          # tabbed code sample (client component)
  CTA.tsx
  Footer.tsx
```

## Notes

- Tokens (`--bg`, `--accent`, etc.) are the same vars used in the app —
  swap palette in one place to re-skin both surfaces.
- The Edge-Atom logo lives in `components/Logo.tsx`; the blue accent
  (`#3B43F5`) is hardcoded to match the brand.
- Only `Sdk.tsx` needs `"use client"` (tab state). Everything else
  ships as a server component.
