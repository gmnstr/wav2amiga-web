# CLI API Reference

## Overview

The `wav2amiga` command-line interface provides batch conversion of WAV files to Amiga 8SVX format with deterministic resampling.

## Installation

```bash
npm install -g wav2amiga
```

## Usage

```bash
wav2amiga [options] <input...>
```

## Options

### Required Options

#### `--mode <mode>`
Specifies the output mode.

**Values:**
- `single`: One .8SVX file per input sample
- `stacked`: Concatenate segments with individual alignment
- `stacked-equal`: Concatenate segments with uniform slot sizes

**Example:**
```bash
wav2amiga --mode single --note C-2 input.wav
```

### Note Configuration

#### `--note <note>`
ProTracker note for conversion (e.g., 'C-2').

**Required for:** Single mode
**Optional for:** Stacked modes (if `--manifest` provided)

**Example:**
```bash
wav2amiga --mode single --note C-2 input.wav
```

#### `--manifest <path>`
JSON manifest file for per-file note specification.

**Format:**
```json
[
  { "filepath": "kick.wav", "note": "C-2" },
  { "filepath": "snare.wav", "note": "D-2" },
  { "filepath": "hat.wav", "note": "F#3" }
]
```

**Mutually exclusive with:** `--note` for stacked modes

**Example:**
```bash
wav2amiga --mode stacked --manifest drumkit.json
```

### Output Options

#### `--out-dir <directory>`
Output directory for generated files.

**Default:** `./out`

**Example:**
```bash
wav2amiga --mode single --note C-2 --out-dir ./build input.wav
```

#### `--emit-report`
Generate JSON report with segment metadata.

**Output:** `{output_basename}_report.json`

**Example:**
```bash
wav2amiga --mode single --note C-2 --emit-report input.wav
```

### Resampler Options

#### `--resampler <type>`
Choose resampling algorithm.

**Values:**
- `zoh`: Zero-order hold (default, deterministic)
- `ffmpeg`: FFmpeg resampling (comparison only)

**Example:**
```bash
wav2amiga --mode single --note C-2 --resampler zoh input.wav
```

### Behavior Options

#### `--force`
Overwrite existing output files without prompting.

**Example:**
```bash
wav2amiga --mode single --note C-2 --force input.wav
```

#### `--verbose`
Show detailed conversion progress and diagnostics.

**Example:**
```bash
wav2amiga --mode single --note C-2 --verbose input.wav
```

## Exit Codes

| Code | Category | Description |
|------|----------|-------------|
| `0` | Success | Operation completed successfully (warnings allowed) |
| `2` | Usage Error | CLI usage/validation error (flags/manifest/invalid note) |
| `3` | Input Error | Input error (file missing/unreadable/unsupported/empty/non-mono) |
| `4` | Processing Error | Processing error (unexpected internal failure) |
| `5` | Output Error | Output error (cannot write output) |

## Error Messages

### Input Errors (Exit Code 3)

#### Non-mono input
```
Error: {file}: {channels} channels detected, expected 1 (mono)
```
**Example:** `Error: kick.wav: 2 channels detected, expected 1 (mono)`

#### File not found
```
Error: {file}: file not found
```
**Example:** `Error: missing.wav: file not found`

#### Unreadable file
```
Error: {file}: cannot read input
```
**Example:** `Error: corrupted.wav: cannot read input`

#### Unsupported audio format
```
Error: {file}: unsupported audio format (cannot decode to PCM16 mono)
```
**Example:** `Error: video.mp4: unsupported audio format (cannot decode to PCM16 mono)`

#### Empty audio
```
Error: {file}: decoded audio is empty
```
**Example:** `Error: silence.wav: decoded audio is empty`

### Usage Errors (Exit Code 2)

#### Invalid note
```
Error: '{note}' is not a valid ProTracker note
```
**Example:** `Error: 'X-5' is not a valid ProTracker note`

#### Flag conflict
```
Error: --manifest cannot be used together with --note in stacked modes
```

#### Missing note for single mode
```
Error: --note is required for single mode
```

### Output Errors (Exit Code 5)

#### Write failure
```
Error: {outFile}: failed to write output
```
**Example:** `Error: output.8SVX: failed to write output`

## Warning Messages

### Oversize warning
```
Warning: {label} is {bytes} bytes (> 65535). ProTracker may not load the full sample.
```
**Example:** `Warning: kick is 70000 bytes (> 65535). ProTracker may not load the full sample.`

### Overwrite warning
```
Warning: {outFile} exists; use --force to overwrite
```
**Example:** `Warning: output.8SVX exists; use --force to overwrite`

## Output Streams

### stdout
- Success messages (e.g., "Successfully created output.8SVX")
- JSON report output (when `--emit-report` is used)
- Filename output for scripting

### stderr
- All error messages
- All warning messages
- Verbose diagnostic output (when `--verbose` is used)
- Processing status messages

## Examples

### Single Mode
```bash
# Convert one file
wav2amiga --mode single --note C-2 kick.wav

# With report generation
wav2amiga --mode single --note C-2 --emit-report kick.wav
```

### Stacked Mode
```bash
# Multiple files with same note
wav2amiga --mode stacked --note C-2 kick.wav snare.wav hat.wav

# With manifest for different notes
wav2amiga --mode stacked --manifest drumkit.json
```

### StackedEqual Mode
```bash
# Uniform slot sizes
wav2amiga --mode stacked-equal --note C-2 kick.wav snare.wav hat.wav
```

### Advanced Usage
```bash
# Verbose output with custom directory
wav2amiga --mode stacked --manifest kit.json --out-dir ./build --verbose

# Force overwrite existing files
wav2amiga --mode single --note C-2 --force input.wav
```

## Scripting Integration

### Get output filename
```bash
OUTPUT=$(wav2amiga --mode single --note C-2 input.wav 2>/dev/null)
echo "Created: $OUTPUT"
```

### Batch processing
```bash
for file in *.wav; do
  wav2amiga --mode single --note C-2 "$file" --out-dir ./converted
done
```

### Error handling
```bash
if wav2amiga --mode single --note C-2 input.wav; then
  echo "Conversion successful"
else
  echo "Conversion failed with exit code $?"
fi
```

## Performance Notes

- ZOH resampler is faster and deterministic
- FFmpeg resampler is slower but provides comparison
- Typical conversion time: < 200ms for single-shot samples
- Memory usage scales with input file size
- Supports files up to available system memory
