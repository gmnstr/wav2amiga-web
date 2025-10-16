# Single C-2 Sine Example

This example demonstrates converting a single WAV file to 8SVX format with a C-2 note.

## Files

- `input.wav` - 440Hz sine wave at 44.1kHz
- `expected.8SVX` - Expected output file
- `run.sh` - Verification script

## Usage

```bash
# Run the example
bash run.sh

# Manual conversion
wav2amiga --mode single --note C-2 input.wav
```

## Expected Output

The script should produce `output.8SVX` with SHA256 checksum verification.
