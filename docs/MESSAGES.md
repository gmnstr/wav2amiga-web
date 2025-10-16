# wav2amiga CLI Error Messages

This document catalogs all error messages, warning messages, and exit codes used by the wav2amiga CLI.

## Exit Codes

| Code | Category | Description |
|------|----------|-------------|
| `0` | Success | Operation completed successfully (warnings allowed) |
| `2` | Usage Error | CLI usage/validation error (flags/manifest/invalid note) |
| `3` | Input Error | Input error (file missing/unreadable/unsupported/empty/non-mono) |
| `4` | Processing Error | Processing error (unexpected internal failure) |
| `5` | Output Error | Output error (cannot write output) |

## Error Messages

All error messages are prefixed with `Error: ` and sent to stderr.

### Input Errors (Exit Code 3)

#### ERR_NON_MONO
```
Error: {file}: {channels} channels detected, expected 1 (mono)
```
**Example:** `Error: kick.wav: 2 channels detected, expected 1 (mono)`

#### ERR_FILE_NOT_FOUND
```
Error: {file}: file not found
```
**Example:** `Error: missing.wav: file not found`

#### ERR_UNREADABLE_FILE
```
Error: {file}: cannot read input
```
**Example:** `Error: corrupted.wav: cannot read input`

#### ERR_UNSUPPORTED_AUDIO
```
Error: {file}: unsupported audio format (cannot decode to PCM16 mono)
```
**Example:** `Error: video.mp4: unsupported audio format (cannot decode to PCM16 mono)`

#### ERR_EMPTY_AUDIO
```
Error: {file}: decoded audio is empty
```
**Example:** `Error: silence.wav: decoded audio is empty`

### Usage Errors (Exit Code 2)

#### ERR_INVALID_NOTE
```
Error: '{note}' is not a valid ProTracker note
```
**Example:** `Error: 'X-5' is not a valid ProTracker note`

#### ERR_FLAG_CONFLICT
```
Error: --manifest cannot be used together with --note in stacked modes
```

#### ERR_MISSING_NOTE_SINGLE
```
Error: --note is required for single mode
```

### Output Errors (Exit Code 5)

#### ERR_WRITE_FAILED
```
Error: {outFile}: failed to write output
```
**Example:** `Error: output.8SVX: failed to write output`

## Warning Messages

All warning messages are prefixed with `Warning: ` and sent to stderr. Warnings do not cause the program to exit (exit code 0).

### WARN_OVERSIZE
```
Warning: {label} is {bytes} bytes (> 65535). ProTracker may not load the full sample.
```
**Example:** `Warning: kick is 70000 bytes (> 65535). ProTracker may not load the full sample.`

### WARN_OVERWRITE
```
Warning: {outFile} exists; use --force to overwrite
```
**Example:** `Warning: output.8SVX exists; use --force to overwrite`

## Stream Usage

### stdout
- Success messages (e.g., "Successfully created output.8SVX")
- JSON report output (when `--emit-report` is used)
- Filename output for scripting

### stderr
- All error messages
- All warning messages
- Verbose diagnostic output (when `--verbose` is used)
- Processing status messages

## Implementation Notes

- All error messages are exact strings as specified in this document
- Error messages are case-sensitive and include exact punctuation
- File paths in error messages are the exact paths provided by the user
- Channel counts and byte sizes are displayed as decimal numbers
- Hex offsets in verbose output are uppercase (e.g., "0x05", "0xFF")
