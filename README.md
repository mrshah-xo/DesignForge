# DesignForge — Logo to DESIGN.md

Upload a logo → the system analyzes its colors and design language → you describe who will use the app → it runs automatic audience research (with a review gate) → checks logo/scene fit → builds a color-theory palette → delivers **DESIGN.md**, design tokens, a live component preview and a full export package.

## Pipeline

1. **Upload logo** — pixel-extracted palette + VLM naming (colors, style tags, mood, trust signals)
2. **Logo analysis** — review the color signature and style interpretation
3. **Who will use it** — category, audience, platform, monetization, trust need (saved to DB)
4. **Research review** — automatic web research on the audience's domain + trust psychology; you review and approve before anything is generated
5. **Logo fit report** — match score, issues and suggestions if the logo clashes with the domain
6. **Design system** — tokens (palette scale, typography, radius, shadows, buttons), DESIGN.md, live preview with domain-aware copy; visual + spec editing
7. **Export** — full package (.zip): DESIGN.md, tokens.json, metadata.json, logo file

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Prisma ORM + PostgreSQL (Prisma Postgres)
- z-ai-web-dev-sdk (VLM logo analysis, LLM design/research, web search)

## Local development

```bash
cp .env.example .env          # fill in your Prisma Postgres credentials
bun install
bun run db:push               # sync schema to the cloud database
bun run dev                   # http://localhost:3000
```

The dev server expects Z.AI credentials at `/etc/.z-ai-config`.

## Data

All projects, analyses, audience profiles, research reports and design specs are stored in PostgreSQL, so data survives across deployments and machines. `scripts/migrate-sqlite-to-pg.ts` is a one-off utility that migrates a legacy local SQLite database (`db/custom.db`) into the cloud database:

```bash
bun scripts/migrate-sqlite-to-pg.ts --sqlite db/custom.db
```

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. In **Vercel → Project → Settings → Environment Variables**, set:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the **pooled** Prisma Postgres URL (`pooled.db.prisma.io`) — best for serverless |
   | `DATABASE_URL_POOLED` | same pooled URL (reference) |
   | `POSTGRES_URL` / `PRISMA_DATABASE_URL` | direct URL (reference) |

3. Apply the schema to the database once (from your machine or a CI step):

   ```bash
   bun run db:push
   ```

4. Deploy. No other configuration is needed — the app reads only `DATABASE_URL` at runtime.

> Secrets never live in the repo: `.env` is git-ignored; use `.env.example` as the template.

## API overview

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/projects` | list projects |
| POST | `/api/projects` | create project (multipart logo upload) |
| GET | `/api/projects/:id` | full project state |
| POST | `/api/projects/:id/analyze` | run logo analysis |
| PUT | `/api/projects/:id/audience` | save audience profile |
| POST | `/api/projects/:id/research` | run automatic research |
| POST | `/api/projects/:id/research/approve` | approve research |
| POST | `/api/projects/:id/design` | generate design (async job) |
| GET | `/api/projects/:id/design?jobId=` | poll design job |
| PUT | `/api/projects/:id/design` | update tokens (visual/spec editor) |
| GET | `/api/projects/:id/export` | download full package (.zip) |
