# Robiner Portfolio

Responsive portfolio with projects, skills, gallery, certificates, Spotify and an AI assistant.

**Stack:** HTML, CSS, plain JavaScript, Node.js and Vercel. No runtime npm dependencies.

## Run locally

Use Node.js 22.9 or newer. Open this folder in VS Code, then run:

```powershell
npm run dev
```

Open the URL printed in the terminal. For a phone on the same Wi-Fi, use the printed **Phone / LAN** URL. Keep the server running.

## Main files

- `site/` — website, assets and chat API.
- `server.mjs` — local server.
- `site/assets/data.js` — profile, projects, skills and photo mappings.
- `site/assets/portfolio.js` — page layout and interactions.
- `site/assets/styles.css` — appearance and responsive sizing.
- `originals/` — retained source photos and resume; `tests/` — automated checks.

## Deploy

In Vercel, set the project root to `site/`. Add `XKIRO_API_KEY` and `XKIRO_MODEL` as environment variables for the AI assistant. Locally, use `site/.env.example` as the template for `site/.env.local`.

Keep `.env.local` private and retain the included license notices when sharing the code.
