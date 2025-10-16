# Examples

This directory contains reproducible examples demonstrating wav2amiga functionality.

## Running Examples

Each example includes a `run.sh` script that:
1. Converts input WAV files to 8SVX format
2. Verifies output matches expected SHA256 checksums
3. Reports success or failure

```bash
# Run a single example
cd examples/single_c2_sine
bash run.sh

# Run all examples
find examples -name run.sh -exec bash {} \;
```

## Example Structure

Each example directory contains:
- `input.wav` - Source audio file
- `expected.8SVX` - Expected output file
- `run.sh` - Verification script
- `README.md` - Example-specific documentation

## Verification

Examples use SHA256 checksums to ensure byte-identical outputs across platforms, maintaining the project's determinism guarantees.
