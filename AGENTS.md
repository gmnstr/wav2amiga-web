# Repository Guidelines

## Project Structure & Module Organization
This pnpm workspace keeps runtime code in `packages/` and entrypoints in `apps/`. Place reusable conversion logic in `packages/core`, resampling engines in `packages/resampler-zoh` or `packages/resampler-wasm`, and FFmpeg-backed helpers in `packages/node-io`. The CLI and web UI live in `apps/cli` and `apps/web`; their compiled assets land in per-package `dist/` folders and the workspace-level `out/`. Golden reference outputs sit in `goldens/`, WAV fixtures in `testdata/`, and shared automation (e.g. `tools/run-golden-tests.mjs`, `tools/create-test-wav.mjs`) in `tools/`.

## Build, Test & Development Commands
- `pnpm install` aligns your workspace with Node 20.17.0/PNPM 9.10.0 (Volta pins these versions).
- `pnpm build` compiles every package and app via their TypeScript configs.
- `pnpm lint` runs the shared ESLint config; add `--fix` before committing formatting tweaks.
- `pnpm test` executes Vitest unit suites and the ZOH golden comparisons.
- `pnpm test:unit` targets core/resampler unit tests for faster feedback.
- `pnpm test:golden:zoh` (or `pnpm test:cli:ffmpeg`) rebuilds targets and replays CLI outputs against `goldens/`.
- `pnpm goldens:regen` refreshes fixtures once new behavior is locked.

## Coding Style & Naming Conventions
Use TypeScript ES modules with two-space indentation. Prefer named exports and keep constants uppercase with underscores (e.g. `ALIGN`), while functions and variables stay in camelCase. Tests mirror their subjects in `__tests__` directories. ESLint plus `eslint-config-prettier` enforce formatting and the `no-unused-vars` rule; prefix intentionally ignored parameters with `_`. Run `pnpm lint` before opening a review.

## Testing Guidelines
Vitest drives unit coverage; place specs beside sources as `<module>.test.ts` and focus on edge-case sample conversions. When changes alter output, rerun the golden suite and inspect diffs before committing. Update `goldens/` only after validating new WAVs with `pnpm goldens:regen` and documenting rationale in the PR. For CLI FFmpeg paths, call `pnpm test:cli:ffmpeg` to confirm optional resampler parity.

## Commit & Pull Request Guidelines
Follow the existing Conventional-style subject lines (`type: summary`, present tense, max ~72 chars). Each commit should encapsulate one logical change and include regenerated artifacts when necessary. Pull requests must describe motivation, list validation commands (`pnpm test`, golden runs), and link tracking issues. Attach CLI output snippets or screenshots for user-facing tweaks (web UI, CLI logs). Label breaking changes early so downstream consumers can react.
