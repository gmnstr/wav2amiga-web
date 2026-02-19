# Repository Guidelines

## Project Structure & Module Organization
This pnpm workspace organizes runtime code under `packages/` and entry points under `apps/`. `packages/core` hosts shared conversion logic; `packages/resampler-zoh` provides the canonical ZOH resampler; `packages/node-io` wraps FFmpeg helpers. CLI and web shells live in `apps/cli` and `apps/web`, with compiled assets emitted into per-package `dist/` directories and workspace `out/`. Reference assets: golden outputs in `goldens/`, WAV fixtures in `testdata/`, shared scripts in `tools/`.

## Build, Test, and Development Commands
- `pnpm install` pins Node 20.17.0/PNPM 9.10.0 via Volta.
- `pnpm build` runs every TypeScript build.
- `pnpm lint` (add `--fix` before committing formatting adjustments).
- `pnpm test` executes Vitest suites plus ZOH golden comparison.
- `pnpm test:unit` narrows to core and resampler unit tests.
- `pnpm test:golden:zoh` and `pnpm test:cli:ffmpeg` rebuild and diff CLI outputs.
- `pnpm goldens:regen` updates fixtures after behavior is re-baselined.

## Coding Style & Naming Conventions
Code uses TypeScript ES modules with two-space indentation. Prefer named exports. Constants are UPPER_SNAKE_CASE, variables and functions camelCase. Co-locate tests in `__tests__`. ESLint with `eslint-config-prettier` governs formatting; prefix unused parameters with `_`. Run `pnpm lint` before sending reviews.

## Testing Guidelines
Vitest is the primary runner. Name specs `<module>.test.ts` beside their sources and stress edge-case sample conversions. Rerun golden suites whenever audio output changes and review diff artifacts. Refresh `goldens/` only after validating WAVs and documenting in the PR. For FFmpeg-based CLI paths, run `pnpm test:cli:ffmpeg` to confirm resampler parity.

## Commit & Pull Request Guidelines
Use Conventional-style subjects (`type: summary`, present tense, ≤72 chars). Keep each commit focused and include regenerated assets as needed. PRs must explain motivation, list validation commands (`pnpm test`, golden runs), link issues, and attach CLI logs or UI screenshots for user-facing changes. Flag breaking changes early for downstream consumers.

## Security & Configuration Tips
Respect Volta-managed toolchain versions; avoid global overrides. Do not commit secrets or FFmpeg paths with credentials. Treat `node_modules/` as ephemeral and rely on `pnpm install` to reproduce environments.
