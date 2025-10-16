# Contributing to Wav2Amiga

## Overview

Thank you for your interest in contributing to Wav2Amiga! This document outlines the development workflow, coding standards, and contribution process.

## Tiny Invariants Header

**no golden changes**, **ZOH only**, **single npm package `wav2amiga`**, **reports opt‑in**, **CI must be green before reporting success**.

## Development Setup

### Prerequisites
- Node.js 20.x (use Volta for version management)
- pnpm 9.10.0
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/gemini/wav2amiga-web.git
cd wav2amiga-web

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Development Environment
```bash
# Enable Volta (if using)
volta install node@20.19.5
volta install pnpm@9.10.0

# Verify versions
node --version  # Should be 20.19.5
pnpm --version  # Should be 9.10.0
```

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

## Code Style

### TypeScript Standards
- Use TypeScript ES modules with two-space indentation
- Prefer named exports over default exports
- Keep constants uppercase with underscores (e.g., `ALIGN`)
- Use camelCase for functions and variables
- Prefix intentionally ignored parameters with `_`

### File Organization
- Place tests in `__tests__` directories
- Mirror source structure in test directories
- Use descriptive filenames
- Keep files focused and single-purpose

### ESLint Configuration
```bash
# Run linting
pnpm lint

# Fix auto-fixable issues
pnpm lint --fix
```

The project uses:
- ESLint with TypeScript support
- Prettier for code formatting
- `eslint-config-prettier` for compatibility
- `no-unused-vars` rule enforcement

## Testing Guidelines

### Unit Tests
- Use Vitest for unit testing
- Place tests in `__tests__` directories
- Focus on edge cases and boundary conditions
- Test both success and failure paths
- Keep tests fast and isolated

### Golden Tests
- Golden tests ensure byte-identical outputs
- Only regenerate when behavior changes intentionally
- Document rationale in PR descriptions
- Verify outputs manually before committing

### Running Tests
```bash
# Unit tests only (fast feedback)
pnpm test:unit

# All tests including golden tests
pnpm test

# Golden tests only
pnpm test:golden:byteequal

# FFmpeg comparison
pnpm test:cli:ffmpeg
```

## CI & Drift Guards

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

## Pull Request Process

### Before Submitting
1. **Run all tests**: `pnpm test`
2. **Check linting**: `pnpm lint`
3. **Verify golden tests**: `pnpm test:golden:byteequal`
4. **Test locally**: Verify your changes work as expected

### PR Requirements
1. **All checks must pass** before merging:
   - Unit tests (`pnpm test:unit`)
   - Golden byte-equal tests (`pnpm test:golden:byteequal`)
   - Drift guard checks (run automatically in CI)

2. **Code style**: Run `pnpm lint` before committing

3. **Golden updates**: If you regenerate goldens, explain the rationale in your PR description

4. **Breaking changes**: Label early so downstream consumers can react

### PR Description Template
```markdown
## Context
[Describe the files/modules affected]

## Intent
[Describe the exact change you want to make]

## Constraints
[Note any invariants - no golden changes, determinism, etc.]

## Validation
[List commands to verify changes work correctly]

## Testing
- [ ] Unit tests pass
- [ ] Golden tests pass
- [ ] Manual testing completed
- [ ] No breaking changes (or documented if intentional)
```

## Commit Convention

Use conventional commit format:
```
type: summary

Description of changes (optional)
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks

### Examples
- `feat: add new resampling algorithm`
- `fix: correct boundary alignment in ZOH resampler`
- `ci: add drift guards for toolchain validation`
- `docs: update README with new usage examples`

## Architecture Guidelines

### Package Structure
- **packages/core**: Pure TypeScript business logic
- **packages/resampler-zoh**: Zero-order hold resampler implementation
- **packages/node-io**: FFmpeg-based audio decoding
- **apps/cli**: Command-line interface
- **apps/web**: Browser-based interface

### Design Principles
- **Determinism**: Byte-identical outputs across platforms
- **Modularity**: Clear separation of concerns
- **Performance**: Fast resampling algorithms
- **Maintainability**: Comprehensive test coverage

### API Design
- Keep APIs simple and focused
- Use TypeScript for type safety
- Provide clear error messages
- Document all public interfaces

## Golden Test Management

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
```

### Safety Checks
- Verifies current toolchain versions match expected
- Refuses to run if versions have drifted
- Updates SHA256 hashes in `goldens/index.json`
- Preserves original files as backup

## Examples and Documentation

### Running Examples
```bash
# Run a single example
cd examples/single_c2_sine
bash run.sh

# Run all examples
find examples -name run.sh -exec bash {} \;
```

### Documentation Updates
- Update relevant documentation when adding features
- Include usage examples
- Document any breaking changes
- Keep API documentation current

## Branch Protection

### Required Status Checks
- `unit`: Unit tests pass
- `golden-byteequal (ubuntu)`: Golden tests pass on Ubuntu
- `golden-byteequal (macos)`: Golden tests pass on macOS
- `golden-byteequal (windows)`: Golden tests pass on Windows

### Review Requirements
- At least one approving review required
- Stale reviews dismissed when new commits pushed
- Rules enforced for administrators

## Troubleshooting

### Common Issues

#### Test Failures
```bash
# Check specific test
pnpm exec vitest run src/__tests__/specific.test.ts

# Run with verbose output
pnpm exec vitest run --reporter=verbose
```

#### Golden Test Failures
```bash
# Check specific case
node tools/check-goldens.mjs --case single_c2_sine

# Compare outputs manually
hexdump -C out/goldens/single_c2_sine/output.8SVX > actual.hex
hexdump -C goldens/cases/single_c2_sine/output.8SVX > expected.hex
diff actual.hex expected.hex
```

#### Build Failures
```bash
# Clean and rebuild
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install
pnpm build
```

### Getting Help
- Check existing issues and PRs
- Review the documentation
- Ask questions in discussions
- Join the community chat

## Release Process

### Version Management
- Follow semantic versioning
- Update version numbers in package.json files
- Tag releases with `v*` format
- Generate changelog entries

### Publishing
- CLI package published to NPM
- Web interface deployed to GitHub Pages
- Release artifacts uploaded to GitHub
- Version information tracked in CI

## Questions?

Feel free to open an issue for questions about the codebase or contribution process. We're here to help!
