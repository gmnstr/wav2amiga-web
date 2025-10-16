# CI and Drift Guards

## Overview

Wav2Amiga uses a comprehensive CI/CD pipeline with drift guard scripts to ensure deterministic, reproducible builds across all platforms. This system prevents regressions and maintains byte-identical outputs.

## CI Pipeline

### Workflow Structure
The CI pipeline runs on every push and pull request:

1. **Unit Tests**: Fast feedback for core logic
2. **Golden Tests**: Byte-identical output verification
3. **FFmpeg Comparison**: Structural validation
4. **Drift Guards**: Toolchain and consistency checks
5. **Documentation**: Required files and examples
6. **Release**: Automated publishing on tags

### Platform Matrix
Tests run on three platforms:
- **Ubuntu Latest**: Primary Linux environment
- **macOS Latest**: Apple Silicon and Intel
- **Windows Latest**: Windows Server environment

### Job Dependencies
```
unit → golden-byteequal → contracts → docs-and-examples → release
```

## Drift Guard Scripts

### Toolchain Check (`tools/check-toolchain.mjs`)

Validates that the current environment matches the required toolchain versions.

**Checks:**
- Node.js version matches `engines.node` range
- pnpm version matches `packageManager` field
- Volta pins are correct (informational)

**Usage:**
```bash
node tools/check-toolchain.mjs
```

**Output:**
```
✓ Node.js version 20.19.5 satisfies >=20.11.0 <21.0.0
✓ pnpm version 9.10.0 matches packageManager
ℹ Volta pins: node@20.19.5, pnpm@9.10.0
```

**Failure:**
```
✗ Node.js version 18.17.0 does not satisfy >=20.11.0 <21.0.0
✗ pnpm version 8.15.0 does not match packageManager 9.10.0
```

### Golden Consistency Check (`tools/check-goldens.mjs`)

Re-runs CLI conversion for all golden test cases and verifies byte-identical outputs.

**Checks:**
- Output bytes match expected SHA256 hashes
- Report JSON files match expected structure
- No drift in conversion results

**Usage:**
```bash
# Check with ZOH resampler (default)
node tools/check-goldens.mjs --resampler zoh

# Check with FFmpeg resampler
node tools/check-goldens.mjs --resampler ffmpeg

# Check specific case
node tools/check-goldens.mjs --case single_c2_sine
```

**Output:**
```
=== single_c2_sine ===
✅ Byte-identical: output.8SVX
✅ Report match: output_report.json

=== stacked_offsets ===
✅ Byte-identical: output_00_05_09.8SVX
✅ Report match: output_00_05_09_report.json

Golden summary: 6 passed, 0 failed
```

**Failure:**
```
=== single_c2_sine ===
❌ Byte mismatch: output.8SVX
   Expected: a1b2c3d4e5f6...
   Actual:   a1b2c3d4e5f7...
   Diff written to: out/diff/single_c2_sine-output.8SVX.txt
```

### File Encoding Check (`tools/detect-text-binary.mjs`)

Verifies file encodings and line endings to prevent cross-platform issues.

**Checks:**
- `.8SVX` files are detected as binary
- Text files (`.json`, `.md`, `.ts`) are UTF-8
- Line endings are LF (not CRLF)

**Usage:**
```bash
node tools/detect-text-binary.mjs
```

**Output:**
```
✓ goldens/cases/single_c2_sine/output.8SVX: binary
✓ goldens/index.json: text (UTF-8, LF)
✓ README.md: text (UTF-8, LF)
✓ packages/core/src/index.ts: text (UTF-8, LF)
```

**Failure:**
```
✗ goldens/index.json: text (UTF-8, CRLF) - should be LF
✗ README.md: text (UTF-8, CRLF) - should be LF
```

## CI Job Details

### Unit Tests Job
```yaml
unit:
  runs-on: ubuntu-latest
  steps:
    - Checkout code
    - Setup Node.js 20.x
    - Install dependencies
    - Check toolchain
    - Build packages
    - Run unit tests
    - Generate versions.json
    - Upload artifacts
```

**Status Check:** `unit`

### Golden Tests Job
```yaml
golden-byteequal:
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
  steps:
    - Checkout code
    - Setup Node.js 20.x
    - Install dependencies
    - Check toolchain
    - Build packages
    - Run golden tests
    - Check golden consistency
    - FFmpeg structural validation
    - Check file encodings (Ubuntu only)
    - Upload failure artifacts
```

**Status Checks:** `golden-byteequal (ubuntu)`, `golden-byteequal (macos)`, `golden-byteequal (windows)`

### Contracts Job
```yaml
contracts:
  runs-on: ubuntu-latest
  steps:
    - Checkout code
    - Setup Node.js 20.x
    - Install dependencies
    - Build packages
    - Run contract tests
```

**Status Check:** `contracts`

### Documentation Job
```yaml
docs-and-examples:
  runs-on: ubuntu-latest
  steps:
    - Checkout code
    - Setup Node.js 20.x
    - Install dependencies
    - Check toolchain
    - Build packages
    - Check required documentation files
    - Check CONTRIBUTING.md sections
    - Run npm publish dry-run
    - Upload publish artifacts
```

**Status Check:** `docs-and-examples`

## Branch Protection

### Required Status Checks
The following status checks must pass before merging:

1. **`unit`**: Unit tests pass
2. **`golden-byteequal (ubuntu)`**: Golden tests pass on Ubuntu
3. **`golden-byteequal (macos)`**: Golden tests pass on macOS
4. **`golden-byteequal (windows)`**: Golden tests pass on Windows

### Optional Status Checks
- **`ffmpeg-structure`**: FFmpeg structural validation (informational)
- **`contracts`**: Contract tests (informational)
- **`docs-and-examples`**: Documentation validation (informational)

### Protection Rules
- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- Dismiss stale reviews when new commits are pushed
- Include administrators in protection rules

## Artifact Management

### Success Artifacts
- `versions.json`: Toolchain and environment information
- `publish-dryrun/`: NPM publish dry-run results

### Failure Artifacts
- `golden-failure-{platform}/`: Generated outputs for debugging
- `out/diff/`: Hexdump diffs for byte mismatches
- `out/goldens/`: Generated outputs for comparison

### Artifact Retention
- Success artifacts: 7 days
- Failure artifacts: 30 days
- Release artifacts: 90 days

## Version Management

### Toolchain Versions
```json
{
  "node": "20.19.5",
  "pnpm": "9.10.0",
  "typescript": "5.6.3",
  "vitest": "2.0.5",
  "ffmpeg": "ffmpeg version 5.2.0"
}
```

### Version Pinning
- **package.json**: `engines` and `packageManager` fields
- **Volta**: `.volta` configuration
- **Lockfile**: `pnpm-lock.yaml` committed
- **Overrides**: `pnpm.overrides` for exact versions

### Version Updates
1. Update version in `package.json`
2. Update Volta pins
3. Run `pnpm install` to update lockfile
4. Test with drift guards
5. Commit changes

## Drift Detection

### What Causes Drift
- Node.js version changes
- pnpm version changes
- TypeScript version changes
- FFmpeg version changes
- Operating system differences
- Compiler differences

### Drift Prevention
- Pin exact versions in package.json
- Use Volta for Node.js version management
- Commit lockfile to repository
- Run drift guards in CI
- Use deterministic build tools

### Drift Resolution
1. **Identify**: Check drift guard output
2. **Analyze**: Determine cause of drift
3. **Fix**: Update versions or fix code
4. **Verify**: Run drift guards again
5. **Commit**: Include version updates

## Monitoring and Alerts

### CI Status
- Monitor CI status on all branches
- Set up notifications for failures
- Track build times and performance
- Monitor artifact storage usage

### Drift Alerts
- Set up alerts for drift guard failures
- Monitor toolchain version changes
- Track golden test failures
- Alert on cross-platform differences

### Performance Monitoring
- Track build times
- Monitor test execution time
- Track artifact sizes
- Monitor resource usage

## Troubleshooting

### Common CI Issues

#### Toolchain Mismatch
```bash
# Check current versions
node --version
pnpm --version

# Update to required versions
volta install node@20.19.5
volta install pnpm@9.10.0
```

#### Golden Test Failures
```bash
# Check specific case
node tools/check-goldens.mjs --case single_c2_sine

# Compare outputs
hexdump -C out/goldens/single_c2_sine/output.8SVX > actual.hex
hexdump -C goldens/cases/single_c2_sine/output.8SVX > expected.hex
diff actual.hex expected.hex
```

#### File Encoding Issues
```bash
# Check file encodings
node tools/detect-text-binary.mjs

# Fix line endings
dos2unix *.md *.json *.ts
```

### Debugging Steps
1. **Check toolchain**: Run `node tools/check-toolchain.mjs`
2. **Check goldens**: Run `node tools/check-goldens.mjs`
3. **Check encodings**: Run `node tools/detect-text-binary.mjs`
4. **Check versions**: Run `node tools/versions.mjs`
5. **Compare outputs**: Use hexdump to compare files

### Getting Help
- Check CI logs for detailed error messages
- Review drift guard output
- Compare with working builds
- Ask for help in discussions
