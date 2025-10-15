# wav2amiga-web — Phased Work Plan

One-line summary: fast, evenly sized phases to take the scaffold to a deterministic,
release-ready tool, keeping each phase similar in scope and agent token needs.

---

## Phase 1 — Lock invariants and StackedEqual

Goal
- Finalize core layout rules and semantics that everything else depends on.

Tasks
- Implement align-to-next-0x100 with no extra block when already aligned.
- Implement StackedEqual as uniform slots; increment = slotSize >> 8.
- Add unit tests for mapping edges, alignment edges, Stacked/StackedEqual math.
- Implement filename suggestions: stacked offsets and stacked-equal increment.

Exit checks
- All new unit tests green across OS.
- Filename outputs match spec examples exactly.
- No regression in existing structure-only goldens.

Artifacts
- Updated @wav2amiga/core with tests.
- Short NOTES.md summarising the invariants.

---

## Phase 2 — WASM resampler integration and pinning

Goal
- Introduce a single, deterministic resampler path shared by Node and web.

Tasks
- Add libsamplerate-wasm adapter in core or a small adapter package.
- Wire CLI flag `--resampler wasm|ffmpeg` (default can remain ffmpeg for speed).
- Implement tools/pin-wasm.mjs to compute and record WASM SHA256.
- Record wasm version and SHA in report.json and versions.json.

Exit checks
- Local CLI can run with `--resampler wasm` and produce outputs.
- versions.json includes WASM SHA on all OS.
- Structure-only goldens pass with wasm path.

Artifacts
- Adapter source, pinned WASM binary, updated tools and reports.

---

## Phase 3 — Byte-equal golden tests (cross-OS)

Goal
- Move from structure-only to byte-for-byte goldens using the wasm path.

Tasks
- Expand golden corpus: single, stacked, stacked-equal, aligned edge, >0xFFFF.
- Switch golden runner to `--resampler wasm` for identity.
- Store expected .8SVX and _report.json with SHA256s in goldens/index.json.
- Add regenerate guard to refuse if versions drift from pinned set.

Exit checks
- Golden tests are byte-identical on Linux, macOS, Windows.
- Regeneration script updates files and SHAs deterministically.
- CI uploads versions.json per job.

Artifacts
- New cases under goldens/cases and updated index.json.

---

## Phase 4 — CLI UX polish and error handling

Goal
- Make the CLI pleasant and predictable without changing bytes.

Tasks
- Enforce mono gate with channel-count in error message.
- Clear error for invalid note names; tidy help text for flags.
- Implement size warning for >0xFFFF with wording from spec.
- Add --force, --verbose behavior and tests.

Exit checks
- CLI error and warning messages match spec strings.
- Unit tests cover mono gate and invalid note paths.
- No change to golden bytes.

Artifacts
- Updated CLI, tests, and a CLI README snippet.

---

## Phase 5 — Web app resampling and UX

Goal
- Enable full in-browser conversion with deterministic wasm path.

Tasks
- Integrate wasm resampler into the Vite app.
- Add drag-drop multi-file, per-file note assignment, and mode selection.
- Show computed offsets (start>>8) and slot increment for stacked-equal.
- Add fallback banner when using OfflineAudioContext (preview quality).

Exit checks
- Web demo produces identical bytes to CLI wasm path for the same inputs.
- Preview banner appears when wasm fails and fallback is used.
- Lighthouse basic pass for performance and accessibility.

Artifacts
- Web build, short user guide section in README.

---

## Phase 6 — CI hardening and drift guards

Goal
- Make the pipeline resilient and reproducible long term.

Tasks
- Ensure multi-OS matrix runs wasm golden job byte-equal.
- Add a separate ffmpeg structure-only job for early warnings.
- Upload versions.json artifacts and failing outputs on test failures.
- CODEOWNERS: require review for changes under goldens/ and tools/.

Exit checks
- CI green across OS with clear artifacts on failure.
- Golden changes require review.
- New contributors see deterministic failures instead of flaky diffs.

Artifacts
- Updated workflow YAML, CODEOWNERS, contributing notes.

---

## Phase 7 — Docs, examples, and minimal release prep

Goal
- Document behavior, publish a pre-release, and collect early feedback.

Tasks
- Update README with quickstart, modes, offsets math, size limits, determinism.
- Add examples folder with tiny inputs and expected outputs for manual testing.
- Prepare a 0.1.0 pre-release tag; dry-run npm publish from CI.
- Changelog entry summarizing the invariants and testing guarantees.

Exit checks
- README answers the common questions without opening the code.
- Pre-release artifact builds reproducibly in CI.
- No changes to golden bytes between tag and main.

Artifacts
- README sections, examples/, changelog, pre-release tag.

---

## Phase 8 — Nice-to-haves (post 0.1)

Goal
- Quality-of-life improvements without touching the core bytes.

Tasks
- Perf micro-bench script and simple dashboard in CI logs.
- Web: drag-reorder in stacked mode, per-file trimming preview.
- CLI: --dry-run to emit only the report without writing .8SVX.
- Optional: small ProTracker usage guide with 9xx examples.

Exit checks
- All features guarded behind flags or UI toggles.
- No changes to golden bytes by default.

Artifacts
- Tools and docs additions only.

