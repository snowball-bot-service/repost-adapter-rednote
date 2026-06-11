# repost-adapter-PROVIDER_NAME

PROVIDER_NAME repost adapter for Snowball Bot v3.

Clone this repo, follow the checklist below, and you'll have a working adapter ready to publish.

## Quick Start

```bash
# 1. Use this template (click "Use this template" on GitHub)
#    Or clone manually:
git clone https://github.com/snowball-bot/repost-adapter-starter.git my-adapter
cd my-adapter
rm -rf .git
git init

# 2. Install dependencies
pnpm install

# 3. Verify everything works
pnpm test
pnpm build
```

## Checklist: customize your adapter

Use your editor's global search to find every `TODO` and `REPLACE_ME`:

- [ ] `package.json` — set `name`, `description`, `author`, `keywords`
- [ ] `src/index.ts` — set `manifest.name`, `manifest.platform`, `manifest.whitelistHosts`
- [ ] `src/index.ts` — implement the `handle` function (the actual logic)
- [ ] `test/adapter.test.ts` — update expectations to match your manifest
- [ ] `LICENSE` — change copyright holder
- [ ] `README.md` — replace this file with your own

## Project structure

```
src/index.ts        — your adapter logic
test/               — unit tests with a mock context
.github/workflows/  — CI and release automation
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Build in watch mode |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint source files |
| `pnpm typecheck` | Type-check without emitting |

## Publishing

1. Set `NPM_TOKEN` in your repo secrets (Settings → Secrets → Actions)
2. Update `version` in `package.json`
3. Create and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow will publish to npm automatically.

## Local development with mock host

You can test your adapter without setting up the core project:

```bash
# Copy env template and fill in any credentials your adapter needs
cp .env.example .env
# Edit .env

# Run the playground (edit `dev/playground.ts` to set test URLs)
pnpm dev:play
```

The mock host in `dev/harness.ts` simulates what the real core does:
it builds an `AdapterContext`, calls `initState`, and triggers your
`onRepostRequest` handler. Use it to quickly iterate before integrating
with a real core deployment.

## Contract reference

See [`@snowball-bot/repost-adapter`](https://www.npmjs.com/package/@snowball-bot/repost-adapter) for the full API reference.

## License

MIT
