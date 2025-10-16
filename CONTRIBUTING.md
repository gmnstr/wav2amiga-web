# Contributing to wav2amiga-web

Thank you for your interest in contributing to wav2amiga-web! This document outlines the development workflow and guidelines.

## Tiny Invariants Header

**no golden changes**, **ZOH only**, **single npm package `wav2amiga`**, **reports opt‑in**, **CI must be green before reporting success**.

## Request Micro-Structure

When submitting issues or pull requests, please follow this structure:

1. **Context**: Specify the file, lines, or module affected
2. **Intent**: Describe the exact change you want to make
3. **Constraints**: Note any invariants (no golden changes, determinism, etc.)
4. **Validation**: List the commands to verify your changes work correctly

## Requirements Contract Template

For feature requests, please provide:

- **Input**: What files/formats/parameters are needed
- **Output**: What should be produced
- **Determinism**: How it maintains byte-identical outputs
- **Testing**: How to verify the feature works correctly
- **Breaking Changes**: Whether this affects existing APIs

## Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## CI & Drift Guards

This project uses several drift guard scripts to ensure consistency and catch issues early:

### Toolchain Check (`tools/check-toolchain.mjs`)
Validates that the current Node.js and pnpm versions satisfy the requirements in `package.json`:
- Checks `engines.node` semver range (e.g., `>=20.11.0 <21.0.0`)
- Verifies `packageManager` version matches installed pnpm
- Logs Volta pins for informational purposes

**Run locally:**
```bash
node tools/check-toolchain.mjs
```

### Golden Consistency Check (`tools/check-goldens.mjs`)
Re-runs CLI conversion for all golden test cases and verifies byte-identical outputs:
- Detects any drift in `.8SVX` output files
- Validates report JSON files match expected SHAs
- Generates hexdump diffs for debugging mismatches

**Run locally:**
```bash
node tools/check-goldens.mjs --resampler zoh
```

### File Encoding Check (`tools/detect-text-binary.mjs`)
Verifies file encodings and line endings:
- Ensures `.8SVX` files are detected as binary
- Validates text files (`.json`, `.md`, `.ts`, etc.) are UTF-8
- Checks for LF line endings (not CRLF)

**Run locally:**
```bash
node tools/detect-text-binary.mjs
```

## Running Examples

The project includes reproducible examples in the `examples/` directory:

```bash
# Run a single example
cd examples/single_c2_sine
bash run.sh

# Run all examples
find examples -name run.sh -exec bash {} \;
```

Each example includes:
- Input WAV files
- Expected 8SVX output
- SHA256 verification script
- README with usage instructions

Examples verify byte-identical output via SHA256 checksums and serve as integration tests.

## Golden Test Management

Golden tests ensure byte-identical outputs across platforms. When you need to update them:

```bash
# Regenerate all golden outputs
pnpm goldens:regen

# Regenerate specific case
pnpm goldens:regen --case single_c2_sine

# Use different resampler
pnpm goldens:regen --resampler ffmpeg
```

**Important:** Only regenerate goldens after validating that the new behavior is correct and intentional.

## Pull Request Guidelines

1. **All checks must pass** before merging:
   - Unit tests (`pnpm test:unit`)
   - Golden byte-equal tests (`pnpm test:golden:byteequal`)
   - Drift guard checks (run automatically in CI)

2. **Code style:** Run `pnpm lint` before committing

3. **Golden updates:** If you regenerate goldens, explain the rationale in your PR description

4. **Breaking changes:** Label early so downstream consumers can react

## Commit Convention

Use conventional commit format:
```
type: summary

Description of changes (optional)
```

Examples:
- `feat: add new resampling algorithm`
- `fix: correct boundary alignment in ZOH resampler`
- `ci: add drift guards for toolchain validation`
- `docs: update README with new usage examples`

## Testing

- **Unit tests:** `pnpm test:unit` - Fast feedback for core logic
- **Golden tests:** `pnpm test:golden:byteequal` - Byte-identical output verification
- **FFmpeg comparison:** `pnpm test:cli:ffmpeg` - Optional structural validation

## Architecture

- **packages/core**: Pure TypeScript business logic
- **packages/resampler-zoh**: Zero-order hold resampler implementation  
- **packages/node-io**: FFmpeg-based audio decoding
- **apps/cli**: Command-line interface
- **apps/web**: Browser-based interface

## Questions?

Feel free to open an issue for questions about the codebase or contribution process.
