# Dighaz Engineering Limited website

Website and API for Dighaz Engineering Limited (borehole drilling, hydrogeological surveys, pumps and solar water systems).

- `artifacts/borehole-kenya` is the website (React, Vite, Tailwind). It is hosted on Vercel; `vercel.json` has the settings.
- `artifacts/api-server` is the API (Express and Postgres). It is hosted on Render; `render.yaml` has the settings.
- `lib/` holds the database layer and the API client.

## Settings

Website (Vercel environment variables):
- `VITE_API_URL`: the address of the API, for example `https://dighaz-engineering-api.onrender.com`
- `VITE_APK_URL`: optional, the Android app download address (leave empty if there is no Android app)

API (Render environment variables): `DATABASE_URL`, `ADMIN_KEY` (the /admin password), `MEMBER_SECRET`, and optionally
`GOOGLE_CLIENT_ID`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`.

Never put passwords or keys in this repository.

## Commands

- `pnpm install --no-frozen-lockfile`
- `pnpm --filter @workspace/borehole-kenya run build` builds the website
- `pnpm --filter @workspace/api-server run build` builds the API
