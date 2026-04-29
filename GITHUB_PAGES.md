# GitHub Pages Deployment

Free, automatic deployment to **https://aiknowledge.younesblg.com** via GitHub Actions.

## 1. One-time GitHub setup

1. Push this repo to GitHub (`main` branch).
2. Go to **Settings → Pages** → **Source: GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`

   (Values are in the project `.env` file.)

## 2. Custom domain (aiknowledge.younesblg.com)

At your DNS provider for `younesblg.com`, add a **CNAME** record:

| Type  | Name         | Value                          |
|-------|--------------|--------------------------------|
| CNAME | aiknowledge  | `<your-github-username>.github.io` |

Then in **Settings → Pages → Custom domain**, enter `aiknowledge.younesblg.com` and enable **Enforce HTTPS** (after the cert is issued, ~10 min).

The repo already contains `public/CNAME`, which Pages reads automatically.

## 3. How it deploys

Every push to `main` triggers `.github/workflows/pages.yml`:

1. Installs deps with Bun
2. Runs `vite build` → outputs to `dist/`
3. Copies `index.html` → `404.html` (SPA deep-link fallback)
4. Writes `CNAME` and `.nojekyll`
5. Uploads & deploys via official `actions/deploy-pages@v4`

## 4. SPA routing

GitHub Pages has no server-side fallback. We work around it by serving `404.html` (a copy of `index.html`) for unknown paths, so React Router takes over. Refreshes on `/docs`, `/quizzes/:id`, etc. work correctly.

## 5. Notes

- `VITE_*` vars are baked into the bundle at build time. Update the secrets and re-run the workflow to change them.
- Backend (Lovable Cloud / Supabase Edge Functions) is unaffected — it stays managed by Lovable.
- The existing VPS workflow (`.github/workflows/deploy.yml`) is preserved and independent. Disable it in **Actions → Workflows** if you only want Pages.
- Base path is `/` (custom domain at root). No `vite.config.ts` change needed.
