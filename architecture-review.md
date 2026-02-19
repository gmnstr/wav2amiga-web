# Wav2Amiga-Web Architecture Review

## Context

This review evaluates the current architecture of the wav2amiga-web monorepo as of 2025-xx-xx. The inspection covered runtime packages under `packages/`, applications in `apps/`, shared tooling in `tools/`, and published documentation in `docs/`. Findings focus on architectural cohesion, layering, dependency design, and long-term maintainability.

## Strengths

- **Clear package boundaries.** Runtime concerns are split cleanly across `@wav2amiga/core`, resampler engines, and platform adapters such as `@wav2amiga/node-io`, matching the documented intent (`docs/architecture.md`). Each package builds to plain TypeScript output with minimal dependency fan-out.
- **Determinism as a first-class concern.** Core primitives (`packages/core/src/index.ts:11` and `packages/core/src/index.ts:157`) operate on typed arrays without platform dependencies, and both CLI and web paths enforce 0x100 alignment and zero-copy transfers for reproducibility.
- **Robust verification harness.** Golden tests (`tools/run-golden-tests.mjs`) and parity checks in the web app (`apps/web/src/__tests__/parity.test.ts`) demonstrate an investment in byte-identical validation across surfaces.
- **Tooling discipline.** The pnpm workspace, Volta pinning, and multi-platform CI matrix described in `docs/architecture.md` provide a solid foundation for predictable builds.

## Areas of Concern

### 1. Domain layering and duplication

- The core package exposes only low-level helpers; pipeline assembly (manifest processing, resampling selection, 8SVX emission) lives separately in the CLI (`apps/cli/src/cli.ts:228`–`apps/cli/src/cli.ts:520`) and the web worker (`apps/web/src/worker.ts:198`–`apps/web/src/worker.ts:299`). This leads to duplicated logic for filename generation, padding, and 8SVX struct layout.
- Both the CLI and worker embed bespoke 8SVX writers (`apps/cli/src/cli.ts:521` and `apps/web/src/worker.ts:70`). Divergence risk is already visible: the CLI path uses `Buffer.alloc(...)` and `Buffer.fill` for sample data, while the worker uses `DataView`. The implementations are kept in sync only by discipline and tests.
- Documentation promises a higher-level `convert()` entry point (`docs/architecture.md:20`), but no such function exists. Consumers must manually compose primitives, which encourages further duplication if new entry points arise (e.g., future REST API or desktop UI).

### 2. Resampler plug-in model inconsistencies

- The shared `ResampleAPI` contract defined in `packages/core/src/resampler.ts:5` is not actually re-used by the ZOH implementation, which instead returns a bespoke `ZohApi` type (`packages/resampler-zoh/src/index.ts:6`). Structural typing masks the difference, but it weakens compile-time guarantees and makes it harder to add new metadata (e.g., SHA256) without breaking consumers.
- With Phase B making ZOH the canonical engine, the codebase should finish removing stale WASM toggles (e.g., outdated UI hints) and lean on shared metadata helpers so browser and CLI surfaces describe the same deterministic resampler.
- CLI fallback rules still juggle synchronous ZOH and external ffmpeg code paths (`apps/cli/src/cli.ts:280`–`apps/cli/src/cli.ts:382`). Consolidating this logic behind a factory would simplify error handling and make future resampler additions less invasive.

### 3. Data handling and scalability

- Node I/O loads entire decoded buffers into memory and iterates per-sample (`packages/node-io/src/ffmpeg.ts:17`). There is no streaming strategy for large multi-layer conversions. While acceptable for short samples, this will not scale to batch pipelines or long-form inputs.
- The web worker keeps every `Int16Array` and `Uint8Array` in memory simultaneously (`apps/web/src/worker.ts:215`). There is no chunking or backpressure when processing stacked workloads. Transferring ownership via `postMessage` helps, but the architecture assumes samples fit comfortably in memory.
- CLI manifest processing reads JSON synchronously (`apps/cli/src/cli.ts:254`) and assumes uniform sample rates per manifest entry. There is no intermediate representation that could be reused by other front-ends or validated independently.

### 4. Testing and documentation drift

- Web parity tests recreate the CLI pipeline inline (`apps/web/src/__tests__/parity.test.ts:12`) instead of invoking a shared conversion module, echoing the duplication concern and increasing maintenance overhead.
- Documentation under `docs/architecture.md:20` references exports (`convert()`) that are no longer present, signalling drift between design docs and the codebase.
- Golden tests cover CLI behavior rigorously, but there is no automated check that the web build continues to stay ZOH-only (e.g., guarding against stray WASM bundling) or that the browser worker stays in lockstep with the CLI writer.

### 5. Cross-environment cohesion

- The CLI writes 8SVX data with Node `Buffer` utilities (`apps/cli/src/cli.ts:521`), while the browser worker uses `ArrayBuffer`. Edge cases such as padding byte values (0x80 vs 0x00) rely on implicit knowledge. A cross-environment serialization module in `@wav2amiga/core` (or a new `@wav2amiga/formats`) would reduce divergence.
- Error shapes differ across surfaces. CLI-specific `CliError` handling (`apps/cli/src/errors.ts`) wraps `@wav2amiga/node-io` exceptions, whereas the worker emits raw strings (`apps/web/src/worker.ts:294`). Without shared error contracts, presenting consistent diagnostics across UI layers is harder.

## Recommendations (prioritized)

1. **Introduce a shared conversion facade.** Create an orchestration module (e.g., `@wav2amiga/core/convert`) that accepts decoded PCM segments, stacking directives, and resampler adapters to return `Uint8Array` plus report metadata. Refactor both CLI and web worker to use it, eliminating duplicated 8SVX writers (`apps/cli/src/cli.ts:521`, `apps/web/src/worker.ts:70`) and enabling the documented API.
2. **Standardize resampler contracts.** Export the shared `ResampleAPI` interface from `@wav2amiga/core` and have every engine (`@wav2amiga/resampler-zoh`, future ffmpeg shims) implement it explicitly. Consider a small factory that hides async vs sync instantiation so clients do not hand-roll fallbacks (`apps/cli/src/cli.ts:280`).
3. **Centralize 8SVX serialization.** Move chunk layout constants, padding rules, and file assembly into a reusable module that works in both Node and browser contexts. This would codify alignment rules (`packages/core/src/index.ts:117`) and padding values once.
4. **Reconcile documentation and tests with the new facade.** Update `docs/architecture.md` to point at the shared API, and modify parity/golden tests to call the same conversion entry point rather than duplicating logic (`apps/web/src/__tests__/parity.test.ts:12`).
5. **Plan for large-input handling.** Evaluate streaming or chunked processing in `@wav2amiga/node-io` and the worker. A middle layer could expose iterators over PCM blocks, reducing peak memory usage during stacked conversions.
6. **Harmonize error and report structures.** Define transport-agnostic error types and report schemas in `@wav2amiga/core`, and reuse them in CLI and web layers for consistent telemetry.
7. **Document the ZOH-first approach in the browser.** Make sure UI copy and help text highlight the deterministic ZOH path and explain that ffmpeg is available only for explicit parity testing.

## Opportunities / Questions

- Should manifests become a first-class concept (e.g., `@wav2amiga/core/manifest`) to validate and transform stacked inputs independently of the CLI parser (`apps/cli/src/cli.ts:254`)? This could unlock future REST/desktop entry points.
- Would a cross-language core (e.g., Rust with WASM/Node bindings) better serve deterministic audio math long term, or is TypeScript sufficient given current performance targets?
- Can the project publish a binary schema or spec for generated 8SVX files so third parties can integrate without re-implementing the writer?
- Is there appetite for leveraging web workers + transferable streams to handle larger files without double-buffering in memory?

---

Prepared by: _Codex architecture review_
