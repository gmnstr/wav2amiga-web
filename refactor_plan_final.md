# Refactor Plan — ZOH‑Only, Unified Orchestration, and Error Contracts (Updated)

> Goal: remove duplication, lock contracts, and **keep bytes identical by default**. ZOH is the canonical resampler. No golden changes unless explicitly noted; all new behavior is additive/opt‑in.

---

## 1) Guiding constraints (must stay true)
- **Determinism:** Default path uses ZOH → byte‑identical on Win/macOS/Linux.
- **No breaking changes:** CLI & public API remain compatible; only additive exports.
- **Single source of truth:** One orchestration path used by CLI **and** web worker.
- **Exact messages:** Error strings + exit codes remain unchanged.
- **CI gates unchanged:** unit, golden‑byteequal (3 OS), docs‑and‑examples, contracts.

---

## 2) Phase A — Conversion Facade & Raw Serializer (no byte changes)
**Objective:** Remove orchestration duplication; centralize raw 8‑bit layout. **ZOH is used internally** (no resampler parameter).

### A.1 `convert()` facade (in `packages/core/src/convert.ts`)
```ts
export type Mode = 'single' | 'stacked' | 'stacked-equal';

export interface AudioInput {
  /** mono PCM16 LE samples */
  pcm16: Int16Array;
  /** filename/label for reporting */
  label: string;
  /** ProTracker note, e.g., 'C-2' */
  note: string;
  /** source sample rate (Hz), for metadata/tests */
  sourceHz: number;
}

export interface ConvertOptions { mode: Mode }

export interface SegmentInfo {
  label: string;
  note: string;
  sourceHz: number;
  targetHz: number;
  startByte: number;          // absolute start
  startOffsetHex: string;     // (startByte >> 8) uppercase hex
  lengthBytes: number;        // before padding
  paddedLengthBytes: number;  // after align‑to‑256
}

export interface ConvertResult {
  outputBytes: Uint8Array;     // headerless signed 8‑bit PCM
  segments: SegmentInfo[];
  suggestedFilename: string;   // e.g., kit_00_05_0A.8SVX or kit_05.8SVX
  // metadata for reporting/diagnostics
  resampler: { name: 'ZOH'; version: string };
  mode: Mode;
  totalInputSamples?: number;
  totalOutputBytes?: number;
  processingTimeMs?: number;   // optional profiling
}

export function convert(inputs: AudioInput[], opts: ConvertOptions): ConvertResult;
```
**Notes:**
- Internally perform: `decode (caller) → ZOH resample → 16→8 (arith >> 8) → serialize`.
- ZOH is imported directly from the ZOH module; no factory/DI surface.

### A.2 Raw serializer (in `packages/core/src/formats/raw8svx.ts`)
```ts
export const ALIGN = 0x100; // 256
export function alignTo256(n: number): number;
export function writeRaw8(
  parts: Uint8Array[],
  mode: 'stacked'|'stacked-equal',
): { bytes: Uint8Array; starts: number[]; slot?: number };
```
- Sole source of truth for padding, slot sizing, and segment layout.
- Pure `Uint8Array`; no Node‑only APIs.

### A.3 Integrations
- **CLI:** replace bespoke orchestration with `convert()`; flags/messages unchanged.
- **Web worker:** call `convert()`; UI behavior unchanged.

### A.4 Tests & acceptance
- **Unit:** facade happy paths + edge cases; serializer alignment math.
- **Contracts:** `convert` exported with exact shapes.
- **Golden:** unchanged (byte‑equal across 3 OSes).
- **A.4.1 Golden harness validation:** temporarily mutate padding byte to `0x81`, confirm goldens fail; revert and confirm pass.

**Done when:** both surfaces call `convert()` and all goldens remain identical.

---

## 3) Phase B — ZOH‑only strategy & cleanup (no code paths added)
**Objective:** Make ZOH the explicitly documented, canonical resampler; remove unused WASM pieces.

- Remove `@wav2amiga/resampler-wasm` from web (and workspace if present), or mark deprecated.
- Docs: “ZOH is the canonical resampler; determinism prioritized over interpolation quality.”
- Optional helper export: `getResamplerInfo(): { name: 'ZOH'; version: string }`.

**Done when:** web bundle no longer includes unused WASM; docs reflect ZOH‑only.

---

## 4) Phase C — Error & Report Contracts (strings unchanged)
**Objective:** One structured error/report shape that preserves current CLI text.

### C.1 Types (in `packages/core/src/types.ts`)
```ts
export interface W2AError { code: string; message: string; context?: Record<string, unknown> }
export class ConversionError extends Error {
  readonly w2aError: W2AError;
  constructor(error: W2AError) { super(error.message); this.w2aError = error; this.name = 'ConversionError'; }
}
export interface ReportSegment extends SegmentInfo {}
export interface Report {
  mode: Mode;
  outputFile: string;
  segments: ReportSegment[];
  resampler: { name: 'ZOH'; version: string };
  // versions.* excluded from golden SHA comparison by policy
}
```

### C.2 Emission strategy
- **Core (`convert`)** throws `ConversionError` for known cases; messages **exactly match** current CLI strings.
- **CLI** catches and prints the message verbatim; exit codes unchanged.
- **Web worker** posts `{ type: 'error', error: w2aError }` for UI display; message identical.

### C.3 Tests & acceptance
- **Unit:** each error case throws `ConversionError` with expected code/message.
- **Contracts:** shapes/classes exported and stable.
- **Golden:** CLI output unchanged (messages identical).

**Done when:** both surfaces share structured errors; user‑visible text unchanged.

---

## 5) Phase D — Docs, Contracts, Benchmarks (no byte changes)
**Objective:** Lock the public surface and guard performance.

- **Docs:** update `docs/architecture.md` with the facade & data‑flow (`decode → ZOH → 16→8 → serialize`).
- **Contracts job:** assert new exports (`convert`, types) and signatures.
- **Benchmarks (`tools/benchmark.mjs`):**
  - Baseline 3 workloads: single (1s @ 44.1k), small kit (8 files), larger set (≈50 files).
  - Run 10 iterations; report median. Flag >10% regression vs baseline.
  - Output small Markdown table for commit messages.

**Done when:** contracts green; perf shows <10% regression.

---

## 6) Future Work — Streaming/Chunked Processing (deferred)
**Status:** Deferred until a real need arises.

**Trigger conditions:** OOM on typical hardware (≤8 GB), batch workflows >1 GB, or need for progressive reporting.

**Design notes (when tackled):** iterator over PCM16 blocks; alignment at chunk boundaries; CRC‑identical output vs non‑chunked; progressive write.

**Acceptance:** CRC‑identical bytes to non‑chunked; <10% perf hit on small inputs; demonstrated memory reduction on ≥500 MB inputs.

---

## 7) Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Hidden byte change from refactor | Full golden matrix; mutation test in A.4.1; phase rollbacks. |
| ZOH perceived as low‑fi | Document trade‑off (determinism > interpolation). Provide examples in docs. |
| Type drift between surfaces | Centralize types in core; contracts job enforces shapes. |
| Perf regression | Bench harness; flag >10% regressions before merge. |

---

## 8) Milestones & acceptance
- **A (facade + serializer):** CLI/worker call `convert()`; goldens unchanged; harness validated.
- **B (ZOH‑only cleanup):** WASM removed; docs updated.
- **C (errors & report):** Structured types; messages unchanged; contracts green.
- **D (docs + benchmarks):** Architecture/docs updated; perf guard in place; no >10% regression.

### Rollback validation (each phase)
- Create a temporary branch that reverts the phase commit and confirm CI matrix remains green → verifies phase independence.

---

## 9) Ownership
- **Core (convert, serializer, types):** core maintainer.
- **CLI integration:** CLI maintainer.
- **Web worker integration:** web maintainer.
- **Docs/bench/contracts:** docs & QA maintainer.

---

## 10) Definition of done (project‑level)
- Phases A–D merged.
- CI matrix green; no golden diffs.
- Docs updated with new architecture diagrams.
- Contracts enforce the public surface.
- Benchmarks show <10% regression vs baseline.

