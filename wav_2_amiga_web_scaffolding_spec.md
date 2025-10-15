# wav2amiga-web — Scaffolding Spec

Summary: scaffold a small pnpm monorepo (core + node-io + cli + web) with pinned
versions, deterministic resampling, and golden tests that are byte-stable across
Linux, macOS, and Windows. This spec defines folders, configs, scripts, CI, and
golden fixtures. Lines are kept ≤100 chars and filenames are stable.

---

## 0. Target versions and pinning

node: 20.17.0
pnpm: 9.10.0
typescript: 5.6.x (exact)
vitest: 2.0.x (exact)
ffmpeg-static: 5.2.x (exact)
libsamplerate-wasm: pinned package and wasm SHA256 (exact)

Pin via: packageManager field, engines, Volta, lockfile committed, and overrides if needed.

---

## 1. Repository layout

```
/                      root workspace
  packages/
    core/              pure TS business logic (no Node/browser APIs)
    node-io/           Node adapters: decode/resample (ffmpeg), fs I/O
  apps/
    cli/               yargs-based CLI; exposes `wav2amiga`
    web/               Vite app; browser demo
  goldens/             expected outputs + reports + manifest
    index.json         goldens manifest with SHA256s and tool versions
    cases/...          per-test folders containing inputs and expected outputs
  testdata/fixtures/   tiny mono WAVs for tests (≤10 KB each)
  tools/               scripts: regenerate-goldens, versions dump, helpers
  .github/workflows/   CI pipelines
  .devcontainer/       reproducible dev env (optional but recommended)
  .gitattributes       line ending and binary rules
  .gitignore           ignore rules
  package.json         root workspace config, pinned toolchain
  pnpm-lock.yaml       committed lockfile
  tsconfig.base.json   shared TS config
```

---

## 2. Root configuration files

package.json (root)
```
{
  "name": "wav2amiga-web",
  "private": true,
  "packageManager": "pnpm@9.10.0",
  "engines": { "node": "20.17.0" },
  "volta": { "node": "20.17.0", "pnpm": "9.10.0" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "pnpm -r --filter ./packages/* --filter ./apps/* run build",
    "lint": "pnpm -r exec eslint .",
    "test": "pnpm run test:unit && pnpm run test:golden:wasm",
    "test:unit": "pnpm -r --filter ./packages/core run test",
    "test:golden:wasm": "node tools/run-golden-tests.mjs --resampler wasm",
    "test:cli:ffmpeg": "node tools/run-golden-tests.mjs --resampler ffmpeg --structure-only",
    "versions:print": "node tools/versions.mjs",
    "goldens:regen": "node tools/regenerate-goldens.mjs"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "eslint": "9.11.0",
    "@eslint/js": "9.11.0",
    "eslint-config-prettier": "9.1.0",
    "prettier": "3.3.3"
  },
  "pnpm": { "overrides": {} }
}
```

.gitattributes
```
* text=auto eol=lf
*.md      text eol=lf
*.json    text eol=lf
*.yml     text eol=lf
*.yaml    text eol=lf
*.ts      text eol=lf
*.tsx     text eol=lf
*.8SVX    -text binary
*.8svx    -text binary
goldens/** -text binary
```

.gitignore
```
node_modules/
dist/
.out/
.DS_Store
coverage/
.vscode/
.env
```

.devcontainer/devcontainer.json (optional, improves parity)
```
{
  "name": "wav2amiga-web",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "features": {},
  "postCreateCommand": "corepack enable && pnpm -v && pnpm install",
  "customizations": { "vscode": { "extensions": [
    "ms-vscode.vscode-typescript-next", "dbaeumer.vscode-eslint"
  ]}}
}
```

.github/workflows/ci.yml
```
name: ci
on: [push, pull_request]
jobs:
  build-test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version: 20.17.0
          cache: 'pnpm'
      - run: pnpm -v
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test:unit
      - run: pnpm run test:golden:wasm
      - run: pnpm run test:cli:ffmpeg
      - run: pnpm run versions:print
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: versions-${{ matrix.os }}
          path: out/versions.json
```

---

## 3. Packages

packages/core/package.json
```
{
  "name": "@wav2amiga/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.0.5"
  }
}
```

packages/core/tsconfig.json
```
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmitOnError": true
  },
  "include": ["src"]
}
```

packages/node-io/package.json
```
{
  "name": "@wav2amiga/node-io",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "ffmpeg-static": "5.2.0",
    "execa": "9.3.0"
  },
  "devDependencies": {
    "typescript": "5.6.3"
  }
}
```

apps/cli/package.json
```
{
  "name": "wav2amiga",
  "version": "0.1.0",
  "type": "module",
  "bin": { "wav2amiga": "dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "yargs": "17.7.2",
    "@wav2amiga/core": "workspace:*",
    "@wav2amiga/node-io": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.6.3"
  }
}
```

apps/web/package.json
```
{
  "name": "@wav2amiga/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --strictPort"
  },
  "dependencies": {
    "@wav2amiga/core": "workspace:*"
  },
  "devDependencies": {
    "vite": "5.4.8",
    "typescript": "5.6.3"
  }
}
```

---

## 4. Deterministic resampling strategy

default CLI: ffmpeg decode only, resample with libsamplerate-wasm in-core
alt CLI: ffmpeg decode + resample (soxr) for speed (`--resampler ffmpeg`)
web: libsamplerate-wasm primary, OfflineAudioContext fallback (preview only)

default golden path uses `--resampler wasm` to guarantee cross-OS identity.

---

## 5. Golden tests

layout
```
goldens/
  index.json
  cases/
    single_c2_sine/
      input.wav
      output.8SVX
      report.json
    stacked_kit_uniform/
      kick.wav
      snare.wav
      hat.wav
      output.8SVX
      report.json
```

index.json schema
```
{
  "version": 1,
  "toolchain": {
    "node": "20.17.0",
    "pnpm": "9.10.0",
    "ffmpeg": "ffmpeg version ...",
    "wasm": { "package": "libsamplerate-wasm@X.Y.Z", "sha256": "..." }
  },
  "cases": [
    {
      "id": "single_c2_sine",
      "mode": "single",
      "note": "C-2",
      "inputs": ["cases/single_c2_sine/input.wav"],
      "expect": {
        "output": { "path": "cases/single_c2_sine/output.8SVX", "sha256": "..." },
        "report": { "path": "cases/single_c2_sine/report.json", "sha256": "..." }
      }
    }
  ]
}
```

report.json schema (per case)
```
{
  "mode": "stacked|stacked-equal|single",
  "outputFile": "kit_00_05_0A.8SVX",
  "segments": [
    {
      "label": "kick.wav",
      "note": "C-2",
      "targetHz": 8287,
      "startByte": 0,
      "startOffsetHex": "00",
      "lengthBytes": 5120,
      "paddedLengthBytes": 5376
    }
  ],
  "versions": {
    "node": "20.17.0",
    "pnpm": "9.10.0",
    "ffmpeg": "ffmpeg version ...",
    "wasmSha256": "...",
    "git": "<commit>"
  }
}
```

regeneration guard
- tools/regenerate-goldens.mjs refuses to run unless current versions match index.json
- on regeneration: writes outputs, computes SHA256, updates index.json
- CODEOWNERS requires review for goldens/

---

## 6. Core tests (vitest) outline

quantization
- mapTo8Bit edges: −32768, −32767, −256, −1, 0, 255, 256, 32767

alignment
- lengths: 1, 255, 256, 257, 511, 512, 513, 65535
- assert (len + 0xFF) & ~0xFF, no extra padding on multiples of 0x100

stacking
- stacked offsets strictly increase; hex uppercase, zero-padded (2 chars)
- stacked-equal uses uniform slot size = max(align256(len_i)); increment = slot>>8

filenames
- stacked: basename_00_05_0A.8SVX
- stacked-equal: basename_05.8SVX

note table
- PAL periods to targetHz = floor/round policy defined in core and tested
- invalid notes rejected

mono gate
- non-mono inputs rejected (core accepts mono PCM16 only)

---

## 7. CLI test harness

node tools/run-golden-tests.mjs
- reads goldens/index.json
- for each case:
  - runs CLI with `--resampler wasm` unless `--structure-only`
  - compares output bytes to expected SHA256 (or structure only)
  - validates report fields: offsets, lengths, increment, filename
- writes out/versions.json with tool versions for traceability

node tools/versions.mjs
- prints and writes out/versions.json (Node, pnpm, ffmpeg -version, wasm SHA, git)

---

## 8. CLI flags (initial set)

--mode single|stacked|stacked-equal (required)
--note <NOTE> (required for single; optional with manifest for stacked modes)
--manifest <path> (JSON file of { filepath, note } entries for stacked modes)
--out-dir <dir> (default ./out)
--emit-report (writes _report.json)
--resampler wasm|ffmpeg (default wasm for goldens; may default ffmpeg for normal runs)
--force (overwrite outputs)
--verbose

error messages are concise and include filename and reason.

---

## 9. Resampler details

wasm
- libsamplerate (SINC_BEST_QUALITY)
- identical binary used in Node and web; store SHA256
- resample from source PCM16 to target PAL rate

ffmpeg
- decode: `-i <file> -ac 1 -f s16le -`
- if resampling: `-af aresample=resampler=soxr:precision=33:dither_method=none -ar <Hz> -ac 1 -sample_fmt s16`

policy
- core mapping, alignment, stacking are independent of resampler
- golden tests use wasm path for identity across OS

---

## 10. Web app notes

vite + @wav2amiga/core
- drag-drop mono WAV, select mode and notes, convert in-browser
- display offsets (start>>8) hex and slot increment for stacked-equal
- OfflineAudioContext only as last-resort fallback; banner shows preview-only

---

## 11. Acceptance checklist (scaffolding)

[ ] repo builds on clean clone: pnpm install, pnpm build
[ ] core unit tests pass on all OS
[ ] golden wasm tests pass byte-for-byte on all OS
[ ] ffmpeg structural tests pass on all OS
[ ] CI matrix linux/macos/windows green
[ ] versions.json artifacts uploaded in CI
[ ] gitattributes prevents CRLF and treats goldens as binary
[ ] regenerate-goldens refuses to run on mismatched toolchain
[ ] cli produces `.8SVX` uppercase names and uppercase hex offsets

---

## 12. Future (out of scope for scaffolding)

- package publishing and release pipelines
- web e2e tests
- signed macOS binaries for CLI
- docs site and screenshots

