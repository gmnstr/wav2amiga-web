import { describe, it, expect } from 'vitest';
import { errors, warnings, EXIT_SUCCESS, EXIT_USAGE, EXIT_INPUT, EXIT_OUTPUT, CliError } from '../errors.js';

describe('Error messages', () => {
  it('formats non-mono error', () => {
    const err = errors.nonMono('test.wav', 2);
    expect(err.message).toBe('Error: test.wav: 2 channels detected, expected 1 (mono)');
    expect(err.exitCode).toBe(EXIT_INPUT);
    expect(err.filename).toBe('test.wav');
  });

  it('formats invalid note error', () => {
    const err = errors.invalidNote('X-5');
    expect(err.message).toBe("Error: 'X-5' is not a valid ProTracker note");
    expect(err.exitCode).toBe(EXIT_USAGE);
  });

  it('formats file not found error', () => {
    const err = errors.fileNotFound('missing.wav');
    expect(err.message).toBe('Error: missing.wav: file not found');
    expect(err.exitCode).toBe(EXIT_INPUT);
    expect(err.filename).toBe('missing.wav');
  });

  it('formats unreadable file error', () => {
    const err = errors.unreadableFile('corrupted.wav');
    expect(err.message).toBe('Error: corrupted.wav: cannot read input');
    expect(err.exitCode).toBe(EXIT_INPUT);
    expect(err.filename).toBe('corrupted.wav');
  });

  it('formats unsupported audio error', () => {
    const err = errors.unsupportedAudio('video.mp4');
    expect(err.message).toBe('Error: video.mp4: unsupported audio format (cannot decode to PCM16 mono)');
    expect(err.exitCode).toBe(EXIT_INPUT);
    expect(err.filename).toBe('video.mp4');
  });

  it('formats empty audio error', () => {
    const err = errors.emptyAudio('silence.wav');
    expect(err.message).toBe('Error: silence.wav: decoded audio is empty');
    expect(err.exitCode).toBe(EXIT_INPUT);
    expect(err.filename).toBe('silence.wav');
  });

  it('formats flag conflict error', () => {
    const err = errors.flagConflict();
    expect(err.message).toBe('Error: --manifest cannot be used together with --note in stacked modes');
    expect(err.exitCode).toBe(EXIT_USAGE);
  });

  it('formats missing note single error', () => {
    const err = errors.missingNoteSingle();
    expect(err.message).toBe('Error: --note is required for single mode');
    expect(err.exitCode).toBe(EXIT_USAGE);
  });

  it('formats write failed error', () => {
    const err = errors.writeFailed('output.8SVX');
    expect(err.message).toBe('Error: output.8SVX: failed to write output');
    expect(err.exitCode).toBe(EXIT_OUTPUT);
    expect(err.filename).toBe('output.8SVX');
  });
});

describe('Warning messages', () => {
  it('formats oversize warning', () => {
    const msg = warnings.oversize('kick', 70000);
    expect(msg).toBe('Warning: kick is 70000 bytes (> 65535). ProTracker may not load the full sample.');
  });

  it('formats overwrite warning', () => {
    const msg = warnings.overwrite('output.8SVX');
    expect(msg).toBe('Warning: output.8SVX exists; use --force to overwrite');
  });
});

describe('CliError class', () => {
  it('creates error with message and exit code', () => {
    const err = new CliError('Test error', 42);
    expect(err.message).toBe('Test error');
    expect(err.exitCode).toBe(42);
    expect(err.filename).toBeUndefined();
    expect(err.name).toBe('CliError');
  });

  it('creates error with filename', () => {
    const err = new CliError('Test error', 42, 'test.wav');
    expect(err.message).toBe('Test error');
    expect(err.exitCode).toBe(42);
    expect(err.filename).toBe('test.wav');
    expect(err.name).toBe('CliError');
  });

  it('extends Error properly', () => {
    const err = new CliError('Test error', 42);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof CliError).toBe(true);
  });
});

describe('Exit code constants', () => {
  it('exports correct exit codes', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_USAGE).toBe(2);
    expect(EXIT_INPUT).toBe(3);
    expect(EXIT_OUTPUT).toBe(5);
  });
});
