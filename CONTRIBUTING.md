# Contributing to wav2amiga-web

Thank you for your interest in contributing to wav2amiga-web! This document outlines the development workflow and guidelines.

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
