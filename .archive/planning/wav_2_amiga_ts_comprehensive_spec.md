# Wav2Amiga-TS — Comprehensive Spec

One-sentence summary: A deterministic, cross-platform Node/TypeScript tool that converts mono WAV samples into raw signed 8‑bit PCM packed for ProTracker, resampled to PAL note rates, and stacked with 0x100-byte alignment for accurate `9xx` offsets.

---

## 1. Goals & Non‑Goals

**Goals**
- Provide a faithful, deterministic replacement for the original Windows tool, focused on ProTracker use.
- Inputs: mono PCM audio (WAV preferred; CLI may accept other formats via ffmpeg).
- Processing: resample to **PAL** ProTracker note frequencies, map to **signed 8‑bit** (two’s complement), and pack/stack with **0x100-byte** alignment.
- Outputs: **raw signed 8‑bit** stream(s) with the **`.8svx`** extension (headerless).
- Modes: **Single**, **Stacked**, **StackedEqual**, preserving original filename/offset conventions.

**Non‑Goals**
- No dithering, normalization, noise shaping.
- No true IFF/8SVX container writer.
- No stereo support (reject non‑mono).
- No NTSC/8363 or alternative note tables; **PAL only**.
- No playback, no DAW integration, no editor UI beyond minimal preview in web demo.

---

## 2. Terminology (short)
- **ProTracker `9xx`**: playback starts at offset `xx × 0x100` bytes within the sample.
- **Alignment**: pad each segment to the **next** 0x100‑byte boundary so `9xx` lands exactly at segment starts.
- **Segment**: a resampled, 8‑bit‑mapped block representing one converted input sample.
- **Slot**: in StackedEqual mode, a fixed‑size region (matching the largest aligned segment) that holds one segment plus padding.
- **Increment**: in StackedEqual mode, `(largestSlotSize >> 8)`, the offset difference between consecutive segments.

---

## 3. Functional Requirements

### 3.1 Inputs
- **Primary**: WAV files (PCM 16‑bit LE preferred). CLI may accept any ffmpeg‑decodable audio, but must yield a mono PCM stream prior to mapping.
- **Mono only**: If input is not mono, **hard‑fail** with a clear error.
- **Sample rate**: Arbitrary input rates accepted; the pipeline resamples to target note rate.

### 3.2 Note model & resampling
- **Model**: **PAL** only. A fixed ProTracker PAL period table defines target frequencies.
- **Frequency**: `freq = PAL_clock / period`. The canonical PAL clock and period values are shipped as constants (see §10 Schema).
- **Resampler**: High‑quality resampling via platform adapter (Node: ffmpeg; Browser: WASM or WebAudio fallback). Determinism matters for lengths; byte‑identical waveforms are **not** required.
- **Length expectation**: Post‑resample duration must match the chosen note rate within a tolerance (see §7 Testing).

### 3.3 16→8 mapping (quantization)

The pipeline produces PCM16 LE (signed 16‑bit samples). Each 16‑bit sample is converted to signed 8‑bit using the following algorithm:

```typescript
function mapTo8Bit(sample16: number): number {
  // Arithmetic right shift by 8 bits (extracts high byte, preserves sign)
  const shifted = sample16 >> 8;
  // Clamp to signed 8-bit range [-128, 127]
  return Math.max(-128, Math.min(127, shifted));
}
```

**Examples:**
- `-32768 >> 8 = -128` → `-128`
- `-32767 >> 8 = -128` → `-128`
- `-256 >> 8 = -1` → `-1`
- `0 >> 8 = 0` → `0`
- `255 >> 8 = 0` → `0`
- `32767 >> 8 = 127` → `127`

No normalization, no dithering, no noise shaping.

### 3.4 Modes

- **Single**: Output one `.8svx` per input sample (headerless signed‑8 PCM).

- **Stacked**: Concatenate segments sequentially in one file. Each segment is individually aligned to 0x100 boundaries. Segments start at different offsets.
  
  **Example**: Three segments of 1280, 1024, 512 bytes produce offsets at 900 (0x00), 904 (0x04), 908 (0x08).
  
- **StackedEqual**: All segments are padded to equal size (matching the largest segment after alignment). This creates uniform "slots" with predictable spacing.
  
  **Use case**: Enables consistent offset arithmetic in ProTracker patterns. If the largest segment is 0x500 bytes (offset increment = 05), all segments occupy 0x500 bytes, creating uniform spacing: segment 0 at 900, segment 1 at 905, segment 2 at 90A, etc. You can calculate: `offset = base + (index × increment)`.
  
  **Physical layout**: Each segment is post‑padded with 0x00 bytes to match the largest segment's aligned size. Segments remain sequential but equally spaced.
  
  **Example**:
  
  ```
  Inputs: 1200, 800, 400 bytes
  After Align256: 1280 (0x500), 1024 (0x400), 512 (0x200)
  Largest: 1280 bytes
  
  Output file layout:
  0x0000-0x04FF: Segment 0 (1280 bytes actual data)
  0x0500-0x09FF: Segment 1 (1024 bytes data + 256 bytes padding)
  0x0A00-0x0EFF: Segment 2 (512 bytes data + 768 bytes padding)
  
  All offsets: 900, 905, 90A (uniform increment of 05)
  ```

> **Note on offsets & filenames**: Offsets are expressed as `(startByte >> 8)` formatted as uppercase hex without `0x` prefix. See §5 Naming.

- **Single**: Output one `.8svx` per input sample (headerless signed‑8 PCM).
- **Stacked**: Concatenate segments sequentially in one file; insert **0x100‑aligned padding** between segments.
- **StackedEqual**: As *Stacked*, but segments are aligned so that all **start offsets (>>8)** are equalized to the **largest** segment’s start index; use padding to equalize.

> **Note on offsets & filenames**: Where filenames encode offsets, offsets are expressed as `startByte >> 8` (hex). See §5 Naming.

### 3.5 Alignment & padding

Each segment must be padded to align to the next 0x100‑byte (256‑byte) boundary.

**Correct implementation:**
```typescript
// Round up to next 256-byte boundary
const paddedLength = (length + 0xFF) & ~0xFF; // equivalently: Math.ceil(length / 0x100) * 0x100
// If already aligned, no padding is added
const paddingNeeded = paddedLength - length;
```

**Examples:**
- `0x100` bytes → `0x100` (no padding)
- `0x101` bytes → `0x200` (255 bytes padding)
- `0x1FF` bytes → `0x200` (1 byte padding)
- `0x200` bytes → `0x200` (no padding)

**Important**: The original Windows tool contains a bug where it computes:
```csharp
var newSize = data.Length + (256 - (data.Length % 256));
```
This always adds padding, even when the length is already aligned (e.g., a 256‑byte segment becomes 512). This implementation **corrects** that to avoid wasting space.

**Rationale**: Proper alignment ensures `9xx` commands address segment starts exactly, without wasting an extra 256 bytes per aligned segment.

### 3.6 Size constraints & warnings

ProTracker has two relevant size limits:

1. **`9xx` addressable range**: The offset command uses a single byte (`00`–`FF`), addressing offsets from `900` to `9FF`, which equals **0 to 65,280 bytes** (255 × 256).
2. **Maximum sample size**: ProTracker's maximum sample length is **65,535 bytes (0xFFFF)**.

**Implementation behavior:**
- If any segment exceeds **65,535 bytes (0xFFFF)**, emit a **warning** and continue. Do **not** truncate automatically.
- Segments between **65,280** and **65,535** bytes will load but cannot be fully addressed with `9xx` (only the first 65,280 bytes are reachable).

### 3.7 Output format

**Only** raw signed 8‑bit output with the `.8svx` extension (headerless). No IFF headers. The extension is case‑insensitive on most systems, but `.8SVX` (uppercase) is preferred for consistency with the original Windows tool and Amiga conventions.

### 3.8 Error Handling

**Hard errors (abort conversion):**
- Non‑mono input (include channel count)
- File not found or unreadable
- Unsupported audio format (cannot decode to PCM)
- Invalid note name
- Empty or zero‑length audio file
- Output file write failure

**Warnings (continue):**
- Segment exceeds 65,535 bytes
- Output file already exists (unless `--force`)

**Error message format:**
```
Error: {filename}: {description}
Example: "Error: kick.wav: 2 channels detected, expected 1 (mono)"
```

---

## 4. Non‑Functional Requirements
- **Determinism**: Same inputs → identical outputs on all supported platforms (excluding float SRC tiny rounding; structural bytes identical, content bytes identical given same SRC binaries/settings).
- **Portability**: Node LTS on macOS (Apple Silicon and x64), Linux, Windows; browser demo in evergreen browsers.
- **Performance**: Handle multi‑second samples interactively; CLI should convert typical single‑shot samples (<10s) in under ~200 ms on Apple Silicon M‑class.
- **Robustness**: Clear, actionable errors (mono‑gate, empty files, decode failures).

---

## 5. File Naming & Conventions

### 5.1 Output filenames

- **Single mode**: `{input_basename}.8SVX` (one file per input)

- **Stacked mode**: `{first_input_basename}_{offset1}_{offset2}_..._{offsetN}.8SVX`
  - All segment offsets included in filename, separated by underscores
  - Offsets are `(startByte >> 8)` formatted as **uppercase hex** (no `0x` prefix)
  - **Example**: `kit_00_05_0A.8SVX` means segments at 900, 905, 90A

- **StackedEqual mode**: `{first_input_basename}_{increment}.8SVX`
  - Only the increment value (largest segment's aligned size >> 8) in filename
  - **Example**: `kit_05.8SVX` means uniform 0x500‑byte slots (increment = 05)

### 5.2 Extension convention

The `.8SVX` extension is a ProTracker convention for headerless signed 8‑bit PCM. This is **not** the IFF 8SVX container format—it's raw PCM data only.

### 5.3 JSON report (optional)

When `--emit-report` is specified, also write `{output_basename}_report.json` containing segment metadata: index, input label, note, target rate, start byte, start offset hex, length, and padded length.

## 6. Architecture & Packages
 Architecture & Packages

### 6.1 Monorepo layout
- `packages/core`: Pure TypeScript. Responsibilities: note table, rate calc, 16→8 mapping, alignment, stacking, invariants. No Node or DOM APIs.
- `packages/node-io`: Node adapters for decode/resample (ffmpeg), filesystem I/O, and process integration.
- `apps/cli`: CLI wrapper (yargs) over `core` + `node-io`.
- `apps/web`: Browser demo (drag‑and‑drop WAV, choose note/mode, download `.8svx`). Uses `core` with a web adapter (WASM/WebAudio resample).

### 6.2 Resampling adapters

**Node (CLI):**
- Use `ffmpeg-static` to spawn ffmpeg.
- Command: `ffmpeg -i <input> -ar {targetHz} -ac 1 -f s16le -`
- Read stdout as PCM16 LE.
- Deterministic across platforms when using the same ffmpeg version.

**Web (Browser):**
- **Primary**: libsamplerate (Secret Rabbit Code) compiled to WASM
  - Use `SRC_SINC_BEST_QUALITY` mode for high‑quality resampling
  - Deterministic: same WASM binary → identical output to CLI (within ±1 sample rounding)
- **Fallback**: `OfflineAudioContext` (browser resampler)
  - Used only if WASM fails to load
  - Non‑deterministic across browsers; label output as "Preview Quality — use CLI for production"

**Determinism strategy**: Ship the same WASM SRC for both Node and browser to ensure cross‑platform byte‑identical output as far as float rounding allows.

### 6.3 Data flow
1) **Decode** input → float32 or PCM16 mono.
2) **Resample** to target PAL note rate.
3) **Map** to signed 8‑bit via arithmetic high‑byte of PCM16.
4) **Assemble** segments per mode with 0x100 alignment.
5) **Emit** raw bytes (`Uint8Array`) and write `.8svx`.

### 6.4 Core implementation notes

**Alignment function:**
```typescript
export function alignTo256(length: number): number {
  return (length + 0xFF) & ~0xFF;
}
```

**Padding function:**
```typescript
export function addPadding(data: Uint8Array): Uint8Array {
  const paddedLength = alignTo256(data.length);
  if (paddedLength === data.length) return data; // Already aligned
  const result = new Uint8Array(paddedLength);
  result.set(data);
  return result; // Remaining bytes default to 0x00
}
```

**StackedEqual slot calculation:**
```typescript
function calculateLargestSlot(segments: Uint8Array[]): number {
  return Math.max(...segments.map(seg => alignTo256(seg.length)));
}

function padToSlotSize(segment: Uint8Array, slotSize: number): Uint8Array {
  const result = new Uint8Array(slotSize);
  result.set(segment);
  return result;
}
```

---

## 7. Testing & Validation

### 7.1 Unit tests (core)

**Quantization:**
- Edge cases: −32768, −32767, −256, −255, −1, 0, 1, 255, 256, 32767 map correctly
- Verify arithmetic right shift preserves sign
- Verify clamp handles theoretical overflow

**Alignment:**
- Test lengths: 1, 255, 256, 257, 511, 512, 513, 65535
- Assert: `paddedLength = (length + 0xFF) & ~0xFF`
- Assert: No padding when `length % 0x100 === 0`

**Offset calculation:**
- Stacked: Sequential segments have increasing offsets
- StackedEqual: All offsets follow `base + (i × increment)`
- Verify hex formatting: uppercase, no `0x` prefix, zero‑padded to 2 chars

**StackedEqual slot sizing:**
- Given inputs [1200, 800, 400], largest after align is 1280 (0x500)
- All three segments must occupy exactly 0x500 bytes in output
- Total output size = 3 × 0x500 = 0xF00 bytes

**Mono gate:**
- Stereo input (2 channels) → reject with error
- 5.1 surround (6 channels) → reject with error
- Error message includes channel count

**Note table lookup:**
- Every note in PAL table maps to correct frequency
- Invalid note strings → clear error
- Case sensitivity: 'C-2', 'c-2', 'C-2 ' handled appropriately

### 7.2 Integration tests (CLI)
- Corpus of mono WAVs at varied input rates and lengths.
- For each note: assert **output length** matches expected resample length (±1 sample tolerance), **alignment** boundaries are correct, and **offsets** computed from emitted segment metadata match.
- Verify **warning** on segments >0xFFFF bytes.

### 7.3 Manual validation (tracker)
- Load stacked output in ProTracker; verify `9xx` at documented offsets triggers correct segment starts.

---

## 8. CLI Interface (planning)

### 8.1 Command
```
wav2amiga <input...> --mode single|stacked|stacked-equal --note C-2 --out-dir ./build
```

### 8.2 Flags

- `--mode` one of `single | stacked | stacked-equal` (**required**)

- `--note` ProTracker note name (e.g., `C-2`)
  - Required for single mode
  - Optional for stacked modes if `--manifest` provided
  - If specified with stacked modes, applies to all inputs

- `--manifest` path to JSON manifest file (alternative to `--note` for stacked)
  - Format: `[ { "filepath": "kick.wav", "note": "C-2" }, ... ]`
  - Allows per‑file note specification
  - Mutually exclusive with `--note` for stacked modes

- `--out-dir` output directory (default: `./out`)
- `--emit-report` write JSON report of segment metadata
- `--force` overwrite existing output files without prompting
- `--verbose` show detailed conversion progress

**Error handling messages:**
- Non‑mono input: `Error: kick.wav has 2 channels, expected 1 (mono)`
- Invalid note: `Error: 'H-2' is not a valid ProTracker note`
- Missing required flag: `Error: --note is required for single mode`

---

## 9. Web Demo (planning)
- Drag‑and‑drop mono WAVs.
- Select mode and note(s); for stacked modes, a small table lets users choose per‑file notes.
- Convert client‑side; download `.8svx` and optional JSON report.
- Show computed offsets (`start >> 8` hex) for immediate `9xx` reference.

---

## 10. Schema (core types & artifacts)

### 10.1 Core API (TypeScript)
```ts
type Mode = 'single' | 'stacked' | 'stacked-equal';

interface AudioInput {
  data: ArrayBuffer;      // Decoded mono PCM16 LE audio data
  label: string;          // Filename or user label (for reporting)
  note: string;           // Target ProTracker note (e.g., 'C-2')
}

interface ConvertOpts {
  mode: Mode;
}

interface SegmentInfo {
  label: string;                 // Input label (from AudioInput)
  note: string;                  // Target note
  targetHz: number;              // Target sample rate
  startByte: number;             // Byte offset in output file
  startOffsetHex: string;        // (startByte >> 8) as uppercase hex
  lengthBytes: number;           // Actual segment data length
  paddedLengthBytes: number;     // Length including alignment padding
}

interface ConvertResult {
  outputBytes: Uint8Array;       // Raw signed 8-bit PCM
  segments: SegmentInfo[];       // Metadata for each segment
  suggestedFilename: string;     // Generated filename following conventions
}

// Core conversion function (pure, no I/O)
export function convert(inputs: AudioInput[], opts: ConvertOpts): ConvertResult;
```ts
type Mode = 'single' | 'stacked' | 'stacked-equal';

interface ConvertOpts {
  mode: Mode;
  globalNote?: string;           // e.g., 'C-2'; required for single, optional if manifest provided
  manifest?: ManifestEntry[];    // per-file notes for stacked modes
}

interface ManifestEntry {
  filename: string;              // input file path or name
  note: string;                  // note per file
}

interface SegmentInfo {
  input: string;
  note: string;
  targetHz: number;
  startByte: number;             // byte offset of segment start in output
  startIndexHex: string;         // (startByte >> 8) as hex string
  lengthBytes: number;           // segment size before padding
  paddedLengthBytes: number;     // segment size including post-segment padding
}

interface ConvertResult {
  outputBytes: Uint8Array;       // raw signed-8 PCM
  segments: SegmentInfo[];       // ordered list for report/UI
}

export function convert(inputs: ArrayBuffer[], opts: ConvertOpts): ConvertResult;
```

### 10.2 PAL period table (full, PAL only)
```json
{
  "palClock": 3546895,
  "formula": "rate = palClock / period",
  "notes": [
    {
      "Note": "B-3",
      "Period": 113,
      "Rate": 31388.44779
    },
    {
      "Note": "A#3",
      "Period": 120,
      "Rate": 29557.455
    },
    {
      "Note": "A-3",
      "Period": 127,
      "Rate": 27928.30394
    },
    {
      "Note": "G#3",
      "Period": 135,
      "Rate": 26273.29333
    },
    {
      "Note": "G-3",
      "Period": 143,
      "Rate": 24803.45874
    },
    {
      "Note": "F#3",
      "Period": 151,
      "Rate": 23489.36821
    },
    {
      "Note": "F-3",
      "Period": 160,
      "Rate": 22168.09125
    },
    {
      "Note": "E-3",
      "Period": 170,
      "Rate": 20864.08588
    },
    {
      "Note": "D#3",
      "Period": 180,
      "Rate": 19704.97
    },
    {
      "Note": "D-3",
      "Period": 190,
      "Rate": 18667.86632
    },
    {
      "Note": "C#3",
      "Period": 202,
      "Rate": 17558.88416
    },
    {
      "Note": "C-3",
      "Period": 214,
      "Rate": 16574.27383
    },
    {
      "Note": "B-2",
      "Period": 226,
      "Rate": 15694.22389
    },
    {
      "Note": "A#2",
      "Period": 240,
      "Rate": 14778.7275
    },
    {
      "Note": "A-2",
      "Period": 254,
      "Rate": 13964.15197
    },
    {
      "Note": "G#2",
      "Period": 269,
      "Rate": 13185.48178
    },
    {
      "Note": "G-2",
      "Period": 285,
      "Rate": 12445.24421
    },
    {
      "Note": "F#2",
      "Period": 302,
      "Rate": 11744.68411
    },
    {
      "Note": "F-2",
      "Period": 320,
      "Rate": 11084.04563
    },
    {
      "Note": "E-2",
      "Period": 339,
      "Rate": 10462.81593
    },
    {
      "Note": "D#2",
      "Period": 360,
      "Rate": 9852.485
    },
    {
      "Note": "D-2",
      "Period": 381,
      "Rate": 9309.434646
    },
    {
      "Note": "C#2",
      "Period": 404,
      "Rate": 8779.442079
    },
    {
      "Note": "C-2",
      "Period": 428,
      "Rate": 8287.136916
    },
    {
      "Note": "B-1",
      "Period": 453,
      "Rate": 7829.789404
    },
    {
      "Note": "A#1",
      "Period": 480,
      "Rate": 7389.36375
    },
    {
      "Note": "A-1",
      "Period": 508,
      "Rate": 6982.075984
    },
    {
      "Note": "G#1",
      "Period": 538,
      "Rate": 6592.740892
    },
    {
      "Note": "G-1",
      "Period": 570,
      "Rate": 6222.622105
    },
    {
      "Note": "F#1",
      "Period": 604,
      "Rate": 5872.342053
    },
    {
      "Note": "F-1",
      "Period": 640,
      "Rate": 5542.022813
    },
    {
      "Note": "E-1",
      "Period": 678,
      "Rate": 5231.407965
    },
    {
      "Note": "D#1",
      "Period": 720,
      "Rate": 4926.2425
    },
    {
      "Note": "D-1",
      "Period": 762,
      "Rate": 4654.717323
    },
    {
      "Note": "C#1",
      "Period": 808,
      "Rate": 4389.72104
    },
    {
      "Note": "C-1",
      "Period": 856,
      "Rate": 4143.568458
    }
  ]
}
```

### 10.3 Optional report JSON
```json
{
  "mode": "stacked",
  "outputFile": "kit_00_15_35.8SVX",
  "segments": [
    {
      "label": "kick.wav",
      "note": "C-2",
      "targetHz": 8287,
      "startByte": 0,
      "startOffsetHex": "00",
      "lengthBytes": 5120,
      "paddedLengthBytes": 5376
    },
    {
      "label": "snare.wav",
      "note": "C-3",
      "targetHz": 16574,
      "startByte": 5376,
      "startOffsetHex": "15",
      "lengthBytes": 8000,
      "paddedLengthBytes": 8192
    },
    {
      "label": "hat.wav",
      "note": "F#3",
      "targetHz": 23489,
      "startByte": 13568,
      "startOffsetHex": "35",
      "lengthBytes": 3000,
      "paddedLengthBytes": 3072
    }
  ]
}
```

---

## 11. Acceptance Criteria
- **Mono gate**: Non‑mono input causes a hard error with channel count in message.
- **PAL only**: Frequencies derive from the shipped PAL table; tests cover mapping.
- **No DSP extras**: No normalization/dither/noise shaping code paths present.
- **Alignment**: Every segment boundary is at a multiple of 0x100; no extra 0x100 if already aligned.
- **Offsets**: Reported `(start >> 8)` values match byte layout; verified in an integration test and manual tracker check.
- **Size warning**: Warning emitted for any segment >0xFFFF bytes.
- **Determinism**: Given same inputs and SRC settings, output bytes identical across runs.

---

## 12. Risks & Open Questions
- **SRC parity**: ffmpeg/WASM SRC may produce 1–2 sample differences across platforms; tests focus on length/alignment, not waveform equality.
- **Edge clipping**: Ensure mapping clamps correctly at 16‑bit extremes; add explicit tests.
- **Browser fallback**: WebAudio fallback may differ slightly in length; the browser demo will be labeled “preview quality.”

---

## 13. Milestones
- **M1 — Core**: PAL table, rate calc, 16→8 mapping, alignment/stacking, unit tests.
- **M2 — Node CLI**: Decode/resample adapter (ffmpeg), integration tests, JSON report.
- **M3 — Web Demo**: WASM/WebAudio adapter, drag‑drop UI, download, quick visual report.
- **M4 — Polish**: Docs, examples, CI, signed macOS binaries for CLI if desired.

---

## 14. Tooling & Packaging
- **Language**: TypeScript (strict).
- **Build**: pnpm + turbo (or npm workspaces) monorepo.
- **CLI**: `yargs`, `ffmpeg-static`.
- **Web**: Vite, WASM SRC (or WebAudio fallback).
- **CI**: GitHub Actions; run unit/integration on macOS & Linux.

---

## 15. License & Attribution
- SPDX‑style license header in all files. Acknowledge original author and repository lineage in README.

---

## 16. Future Extensions (explicitly out of scope)
- True IFF/8SVX container writer (VHDR/BODY).
- Dither/normalization or stereo processing.
- NTSC or alternate tracker tables; loop metadata; per‑segment envelopes.

---

## 17. Appendix: Example CLI invocations
```
# Single mode, one file at C-2
wav2amiga sample.wav --mode single --note C-2 --out-dir ./out

# Stacked mode, multiple files with a single common note
wav2amiga clap.wav hat.wav snare.wav --mode stacked --note F-2 --out-dir ./out

# Stacked mode with manifest (per-file notes)
cat > drumkit.json << 'EOF'
[
  {"filepath": "kick.wav", "note": "C-2"},
  {"filepath": "snare.wav", "note": "D-2"},
  {"filepath": "hat.wav", "note": "F#3"}
]
EOF
wav2amiga --mode stacked --manifest drumkit.json --out-dir ./out --emit-report

# Stacked-equal with a common note
wav2amiga kick.wav snare.wav hat.wav \
  --mode stacked-equal \
  --note C-2 \
  --out-dir ./out \
  --emit-report
```
