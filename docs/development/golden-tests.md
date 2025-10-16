# Golden Tests

## Overview

Golden tests ensure byte-identical outputs across all platforms by comparing against reference files with known SHA256 hashes. This system prevents regressions and maintains deterministic behavior.

## Architecture

### Test Structure
```
goldens/
├── index.json                 # Test manifest with SHA256 hashes
└── cases/                     # Individual test cases
    ├── single_c2_sine/        # Baseline test case
    ├── stacked_offsets/       # Stacked mode test
    ├── stackedequal_uniform/  # StackedEqual mode test
    ├── aligned_boundary/      # Alignment edge case
    ├── oversize_warning/      # Size warning test
    └── silence_minimal/       # Empty audio test
```

### Case Structure
Each test case contains:
```
goldens/cases/{case_name}/
├── input.wav                    # Input audio file
├── output.8SVX                  # Expected output
├── output_report.json           # Expected report
└── manifest.json                # Test configuration (if applicable)
```

### Index Structure
```json
{
  "version": 1,
  "toolchain": {
    "node": "20.19.5",
    "pnpm": "9.10.0",
    "ffmpeg": "ffmpeg version 5.2.0",
    "zoh": { "name": "zoh", "version": "1.0.0" }
  },
  "cases": [
    {
      "id": "single_c2_sine",
      "mode": "single",
      "note": "C-2",
      "inputs": ["cases/single_c2_sine/input.wav"],
      "expect": {
        "output": { "path": "cases/single_c2_sine/output.8SVX", "sha256": "..." },
        "report": { "path": "cases/single_c2_sine/output_report.json", "sha256": "..." }
      }
    }
  ]
}
```

## Test Cases

### 1. single_c2_sine
**Purpose**: Baseline test case for single mode conversion
**Input**: 44.1kHz mono sine wave
**Note**: C-2 (8287Hz)
**Output**: Single .8SVX file with aligned segment

**Validation**:
- Output length matches expected resample length
- Alignment boundary is correct
- SHA256 hash matches expected

### 2. stacked_offsets
**Purpose**: Test stacked mode with different segment sizes
**Input**: Three WAV files with different lengths
**Notes**: C-2, D-2, F#3
**Output**: Single .8SVX file with sequential segments

**Validation**:
- Segments have correct individual alignment
- Offsets are calculated correctly
- Filename includes all offsets

### 3. stackedequal_uniform
**Purpose**: Test StackedEqual mode with uniform slots
**Input**: Three WAV files with different lengths
**Notes**: C-2, D-2, F#3
**Output**: Single .8SVX file with uniform slot sizes

**Validation**:
- All segments padded to largest size
- Uniform offset spacing
- Filename includes increment value

### 4. aligned_boundary
**Purpose**: Test alignment edge case (exactly 256 bytes)
**Input**: WAV file that resamples to exactly 256 bytes
**Note**: C-2
**Output**: .8SVX file with no extra padding

**Validation**:
- No extra padding added
- Alignment calculation is correct
- Output size is exactly 256 bytes

### 5. oversize_warning
**Purpose**: Test size warning for segments > 65535 bytes
**Input**: WAV file that resamples to > 65535 bytes
**Note**: C-2
**Output**: .8SVX file with warning

**Validation**:
- Warning is emitted
- Output is not truncated
- Report includes size information

### 6. silence_minimal
**Purpose**: Test edge case with minimal audio content
**Input**: WAV file with very short duration
**Note**: C-2
**Output**: .8SVX file with minimal content

**Validation**:
- Handles minimal content correctly
- No errors or crashes
- Output is valid

## Running Golden Tests

### Command Line
```bash
# Run all golden tests
pnpm test:golden:byteequal

# Run specific case
node tools/run-golden-tests.mjs --case single_c2_sine

# Run with different resampler
node tools/run-golden-tests.mjs --resampler ffmpeg
```

### CI Integration
Golden tests run automatically in CI on all platforms:
- Ubuntu Latest
- macOS Latest
- Windows Latest

**Status Checks**:
- `golden-byteequal (ubuntu)`
- `golden-byteequal (macos)`
- `golden-byteequal (windows)`

## Validation Process

### 1. Input Processing
- Load test case input files
- Validate file format and properties
- Check mono channel requirement

### 2. Conversion
- Run CLI with specified parameters
- Use ZOH resampler for deterministic output
- Generate output files and reports

### 3. Byte Comparison
- Compare output bytes with expected SHA256
- Generate hexdump diffs for mismatches
- Validate file structure

### 4. Report Validation
- Compare JSON report with expected structure
- Validate segment metadata
- Check offset calculations

### 5. Cross-Platform Verification
- Ensure identical results on all platforms
- Validate toolchain consistency
- Check for platform-specific issues

## Regeneration Process

### When to Regenerate
Only regenerate golden tests when:
- You've intentionally changed the conversion algorithm
- You've fixed a bug that affects output
- You've added new test cases
- You've updated the resampler implementation

### Regeneration Commands
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

## Debugging Golden Test Failures

### Common Issues

#### Byte Mismatches
```bash
# Check specific case
node tools/check-goldens.mjs --case single_c2_sine

# Compare outputs manually
hexdump -C out/goldens/single_c2_sine/output.8SVX > actual.hex
hexdump -C goldens/cases/single_c2_sine/output.8SVX > expected.hex
diff actual.hex expected.hex
```

#### Report Mismatches
```bash
# Check report structure
cat out/goldens/single_c2_sine/output_report.json | jq .

# Compare with expected
diff out/goldens/single_c2_sine/output_report.json goldens/cases/single_c2_sine/output_report.json
```

#### Cross-Platform Issues
```bash
# Check toolchain versions
node tools/versions.mjs

# Verify environment
echo "OS: $(uname -a)"
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
```

### Debugging Steps
1. **Check toolchain**: Run `node tools/check-toolchain.mjs`
2. **Check goldens**: Run `node tools/check-goldens.mjs`
3. **Compare outputs**: Use hexdump to compare files
4. **Check versions**: Run `node tools/versions.mjs`
5. **Verify manually**: Load output in ProTracker

## Performance Considerations

### Test Execution Time
- Unit tests: ~5 seconds
- Golden tests: ~30 seconds
- Full test suite: ~60 seconds

### Optimization Strategies
- Keep test inputs small
- Use efficient resampling algorithms
- Parallelize test execution
- Cache intermediate results

### Memory Usage
- Test inputs: < 1MB each
- Output files: < 1MB each
- Total memory: < 100MB for all tests

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

## Troubleshooting

### Common Failures

#### SHA256 Mismatch
```
❌ Byte mismatch: output.8SVX
   Expected: a1b2c3d4e5f6...
   Actual:   a1b2c3d4e5f7...
```

**Causes**:
- Toolchain version drift
- Algorithm changes
- Platform differences

**Solutions**:
- Check toolchain versions
- Regenerate if intentional change
- Fix algorithm if bug

#### Report Structure Mismatch
```
❌ Report mismatch: output_report.json
   Expected: {"mode": "single", ...}
   Actual:   {"mode": "single", "extra": "field"}
```

**Causes**:
- API changes
- New fields added
- Structure modifications

**Solutions**:
- Update expected report
- Regenerate if intentional
- Fix API if bug

#### Cross-Platform Differences
```
❌ Platform mismatch: Windows vs Linux
   Different output on different platforms
```

**Causes**:
- Platform-specific behavior
- Toolchain differences
- Algorithm non-determinism

**Solutions**:
- Use deterministic algorithms
- Pin toolchain versions
- Fix platform-specific code
