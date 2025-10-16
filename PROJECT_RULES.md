# Project Rules

This document outlines the key rules and invariants for the wav2amiga project.

> 📚 **Comprehensive Documentation**: See [docs/README.md](docs/README.md) for complete guides, API reference, and development documentation.

## Tiny Invariants Header

**no golden changes**, **ZOH only**, **single npm package `wav2amiga`**, **reports opt‑in**, **CI must be green before reporting success**.

## Core Principles

1. **Determinism**: All outputs must be byte-identical across platforms
2. **ZOH Resampler Only**: Zero-order hold resampler for consistent results
3. **Single Package**: One npm package `wav2amiga` with subpath exports
4. **Golden Tests**: CI-gated byte-equal tests prevent regression
5. **Clean CI**: All checks must pass before reporting success

## Development Guidelines

- Use TypeScript ES modules with two-space indentation
- Prefer named exports and keep constants uppercase with underscores
- Tests mirror their subjects in `__tests__` directories
- ESLint plus `eslint-config-prettier` enforce formatting
- Run `pnpm lint` before opening a review

## Release Process

- Follow Conventional-style commit messages
- Each commit should encapsulate one logical change
- Pull requests must describe motivation and list validation commands
- Label breaking changes early for downstream consumers
