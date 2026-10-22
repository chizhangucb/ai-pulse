# Site

This site's own things: name, copy, brand, pages, and which modules are enabled. The steps are in [Make it your field](../docs/customize.md).

| File | Contents |
|---|---|
| `site.ts` | Site name, industry word, brief times and time zone, home and About page copy, share image text, wording on items and briefs, public interface categories, filing numbers |
| `models.ts` | Named models and the default for each step (a step without one uses the model configured in `.env`) |
| `brand/` | Icons, logo (`Logo.tsx`), the wordmark on share images and posters (`wordmark.svg`, `wordmark-dark.svg`, optional), masthead lettering for the briefs (`nameplates/`), About page QR codes (`contact/`, optional) |
| `pages/` | Terms of use and privacy notice (templates; rewrite them for your situation before launch) |
| `public/` | Fixed files published at the site root with placeholders such as the site name and address filled: `robots.txt`, `manifest.webmanifest`, `openapi-v1.json`, and an optional `.well-known/security.txt` |
| `changelog.json` | The changelog |
| `modules/` | Which modules are enabled: three lists, `index.ts`, `server.ts` and `web.ts`, naming the modules to use from `modules/<name>/` at the repository root, all empty by default; see "Modules" in [Architecture](../docs/architecture.md#modules) |
