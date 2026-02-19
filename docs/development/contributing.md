# Contributing

## Prerequisites

- Node.js `20.19.5` (see `.nvmrc`)
- pnpm `9.10.0`
- Git

## Setup

```bash
git clone https://github.com/gmnstr/wav2amiga-web.git
cd wav2amiga-web
pnpm install
pnpm build
```

## Repository Structure

- `packages/core`: conversion pipeline, mapping, and format output
- `packages/resampler-zoh`: deterministic ZOH resampler
- `packages/node-io`: FFmpeg-backed decoding for CLI workflows
- `apps/cli`: command-line tool
- `apps/web`: browser UI and worker

## Validation Commands

Run these before opening a pull request:

```bash
pnpm lint
pnpm test:unit
pnpm test:golden:byteequal
pnpm test
```

Optional checks:

```bash
node tools/check-toolchain.mjs
node tools/check-goldens.mjs --resampler zoh
node tools/detect-text-binary.mjs
```

## Code and Test Expectations

- Keep business logic in TypeScript packages under `packages/`
- Add or update tests for behavior changes
- If golden outputs change intentionally, include rationale in the PR description
- Keep public docs in `README.md` and `docs/` aligned with behavior

## Pull Requests

- Use clear, scoped commit messages (`feat`, `fix`, `docs`, `test`, `ci`, `chore`)
- Include a short summary of what changed and why
- Ensure all required CI checks pass before merge
