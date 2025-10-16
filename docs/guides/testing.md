# Testing and Validation

## Overview

Wav2Amiga includes comprehensive testing to ensure deterministic, high-quality output across all platforms. This guide covers running tests, validating outputs, and adding new test cases.

## Test Types

### Unit Tests
Fast, isolated tests for individual functions and components.

### Golden Tests
Byte-identical output verification across platforms using reference files.

### Integration Tests
End-to-end testing of the complete conversion pipeline.

## Running Tests

### Quick Test Suite
Run all tests:
```bash
pnpm test
```

This runs:
- Unit tests for core packages
- Golden byte-equal tests
- FFmpeg structural validation

### Unit Tests Only
Fast feedback for development:
```bash
pnpm test:unit
```

Tests the core business logic:
- `packages/core`: 38 tests
- `packages/resampler-zoh`: 22 tests
- Total: 60 tests

### Golden Tests
Byte-identical output verification:
```bash
pnpm test:golden:byteequal
```

Validates:
- 6 golden test cases
- Cross-platform byte equality
- SHA256 hash verification
- Report JSON validation

### FFmpeg Comparison
Optional structural validation:
```bash
pnpm test:cli:ffmpeg
```

Compares ZOH output with FFmpeg resampling for structural consistency.

## Golden Test System

### Overview
Golden tests ensure byte-identical outputs across platforms by comparing against reference files with known SHA256 hashes.

### Test Cases
Located in `goldens/cases/`:

1. **single_c2_sine**: Baseline 44.1kHz mono sine → C-2 (8287Hz)
2. **stacked_offsets**: Three segments with aligned sizes 0x500, 0x400, 0x200
3. **stackedequal_uniform**: Equal-slot stacked segments (0x500 each)
4. **aligned_boundary**: Exactly 0x100 bytes (no extra padding)
5. **oversize_warning**: Segment > 0xFFFF with proper warning
6. **silence_minimal**: Near-empty sample for edge case testing

### Case Structure
Each test case contains:
```
goldens/cases/{case_name}/
├── input.wav                    # Input audio file
├── output.8SVX                  # Expected output
├── output_report.json           # Expected report
└── manifest.json                # Test configuration (if applicable)
```

### Validation Process
1. **Input Processing**: Load test case input files
2. **Conversion**: Run CLI with specified parameters
3. **Byte Comparison**: Compare output bytes with expected SHA256
4. **Report Validation**: Verify JSON report matches expected structure
5. **Cross-Platform**: Ensure identical results on Linux, macOS, Windows

## Regenerating Golden Tests

### When to Regenerate
Only regenerate golden tests when:
- You've intentionally changed the conversion algorithm
- You've fixed a bug that affects output
- You've added new test cases
- You've updated the resampler implementation

### Regeneration Process
```bash
# Regenerate all golden tests
pnpm goldens:regen

# Regenerate specific case
pnpm goldens:regen --case single_c2_sine

# Use different resampler
pnpm goldens:regen --resampler ffmpeg
```

### Safety Checks
The regeneration script includes safety checks:
- Verifies current toolchain versions match expected
- Refuses to run if versions have drifted
- Updates SHA256 hashes in `goldens/index.json`
- Preserves original files as backup

### After Regeneration
1. **Review Changes**: Check the generated outputs make sense
2. **Run Tests**: Verify all tests pass
3. **Commit**: Include regenerated files in your commit
4. **Document**: Explain the changes in your PR description

## Adding New Test Cases

### Creating a Test Case
1. **Create Directory**: `goldens/cases/{new_case_name}/`
2. **Add Input**: Place input WAV file(s)
3. **Create Manifest**: Define test parameters in `manifest.json`
4. **Generate Output**: Run conversion to create expected outputs
5. **Update Index**: Add case to `goldens/index.json`

### Example: New Test Case
```bash
# Create directory
mkdir -p goldens/cases/new_case

# Add input file
cp my_sample.wav goldens/cases/new_case/input.wav

# Create manifest
echo '{
  "mode": "single",
  "note": "C-2",
  "inputs": ["input.wav"]
}' > goldens/cases/new_case/manifest.json

# Generate expected output
wav2amiga --mode single --note C-2 goldens/cases/new_case/input.wav --out-dir goldens/cases/new_case

# Update index
node tools/update-golden-index.mjs
```

### Test Case Guidelines
- **Keep inputs small**: < 1MB for fast testing
- **Use mono files**: Ensure proper channel configuration
- **Test edge cases**: Empty files, boundary conditions, etc.
- **Document purpose**: Include README explaining the test case
- **Verify manually**: Load output in ProTracker to verify

## Drift Guard Scripts

### Toolchain Check
```bash
node tools/check-toolchain.mjs
```

Validates:
- Node.js version matches requirements
- pnpm version matches requirements
- Volta pins are correct

### Golden Consistency Check
```bash
node tools/check-goldens.mjs --resampler zoh
```

Re-runs conversions and verifies:
- Byte-identical outputs
- SHA256 hash matches
- Report JSON structure

### File Encoding Check
```bash
node tools/detect-text-binary.mjs
```

Verifies:
- `.8SVX` files are detected as binary
- Text files are UTF-8 encoded
- Line endings are LF (not CRLF)

## CI Integration

### Automated Testing
The CI pipeline runs:
- Unit tests on all platforms
- Golden byte-equal tests on Linux, macOS, Windows
- FFmpeg structural validation
- Drift guard checks
- Artifact collection on failure

### Status Checks
Required for merging:
- `unit`: Unit tests pass
- `golden-byteequal (ubuntu)`: Golden tests pass on Ubuntu
- `golden-byteequal (macos)`: Golden tests pass on macOS
- `golden-byteequal (windows)`: Golden tests pass on Windows

### Artifact Collection
On test failure, CI collects:
- `out/versions.json`: Toolchain information
- `out/diff/`: Hexdump diffs for debugging
- `out/goldens/`: Generated outputs for comparison

## Debugging Test Failures

### Unit Test Failures
```bash
# Run specific test file
cd packages/core
pnpm exec vitest run src/__tests__/alignment.test.ts

# Run with verbose output
pnpm exec vitest run --reporter=verbose

# Run in watch mode
pnpm exec vitest watch
```

### Golden Test Failures
```bash
# Check specific case
node tools/check-goldens.mjs --case single_c2_sine

# Compare outputs manually
hexdump -C out/goldens/single_c2_sine/output.8SVX > actual.hex
hexdump -C goldens/cases/single_c2_sine/output.8SVX > expected.hex
diff actual.hex expected.hex
```

### Cross-Platform Issues
```bash
# Check toolchain versions
node tools/versions.mjs

# Verify environment
echo "OS: $(uname -a)"
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
```

## Performance Testing

### Benchmarking
```bash
# Time conversion process
time wav2amiga --mode single --note C-2 large_sample.wav

# Memory usage
/usr/bin/time -v wav2amiga --mode single --note C-2 large_sample.wav
```

### Load Testing
```bash
# Convert many files
for i in {1..100}; do
  wav2amiga --mode single --note C-2 sample_$i.wav
done
```

## Best Practices

### Test Development
- Write tests for edge cases
- Test both success and failure paths
- Keep tests fast and isolated
- Use descriptive test names

### Golden Test Management
- Only regenerate when necessary
- Document changes in PR descriptions
- Verify outputs manually
- Keep test cases small and focused

### CI Integration
- Ensure all tests pass locally before pushing
- Use branch protection rules
- Monitor CI status regularly
- Fix failures promptly

### Debugging
- Use verbose output for detailed information
- Check toolchain versions first
- Compare outputs manually when needed
- Use drift guard scripts for validation
