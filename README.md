# Nourish

A self-hostable calorie and macro tracker with a fast daily diary, precise serving and weight controls, goal tracking, and 7-day, 30-day, and 6-month analytics.

Food search combines:

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for generic and branded foods
- [Open Food Facts](https://world.openfoodfacts.org/) for its open, community-maintained product database and images
- A small built-in USDA reference fallback for common staples

## Run with Docker Compose

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Diary data is stored in the named `nourish-data` volume and survives container restarts.

## Local development

Requires Node.js 22+ and pnpm.

```bash
corepack enable
pnpm install
pnpm run db:generate
pnpm run build
pnpm start
```

## Releases

Commits use the [Conventional Commits](https://www.conventionalcommits.org/) format. Merges to `main` run semantic-release, generate release notes and the changelog, create a GitHub release, and publish multi-architecture Docker images to GitHub Container Registry:

```text
ghcr.io/<owner>/<repository>:latest
ghcr.io/<owner>/<repository>:<version>
```

Use `fix:` for patch releases, `feat:` for minor releases, and a `BREAKING CHANGE:` footer for major releases.
