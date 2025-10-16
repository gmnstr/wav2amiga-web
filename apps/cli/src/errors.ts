// Error catalog for wav2amiga CLI
// Provides typed errors with exact messages and exit codes

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_USAGE = 2;      // CLI/validation errors
export const EXIT_INPUT = 3;       // Input file errors
export const EXIT_PROCESSING = 4;  // Internal failures
export const EXIT_OUTPUT = 5;      // Output write errors

// Error classes
export class CliError extends Error {
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public readonly exitCode: number,
    // eslint-disable-next-line no-unused-vars
    public readonly filename?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

// Error factories
export const errors = {
  nonMono: (file: string, channels: number) => 
    new CliError(
      `Error: ${file}: ${channels} channels detected, expected 1 (mono)`,
      EXIT_INPUT,
      file
    ),
  
  invalidNote: (note: string) =>
    new CliError(
      `Error: '${note}' is not a valid ProTracker note`,
      EXIT_USAGE
    ),
  
  fileNotFound: (file: string) =>
    new CliError(
      `Error: ${file}: file not found`,
      EXIT_INPUT,
      file
    ),
  
  unreadableFile: (file: string) =>
    new CliError(
      `Error: ${file}: cannot read input`,
      EXIT_INPUT,
      file
    ),
  
  unsupportedAudio: (file: string) =>
    new CliError(
      `Error: ${file}: unsupported audio format (cannot decode to PCM16 mono)`,
      EXIT_INPUT,
      file
    ),
  
  emptyAudio: (file: string) =>
    new CliError(
      `Error: ${file}: decoded audio is empty`,
      EXIT_INPUT,
      file
    ),
  
  flagConflict: () =>
    new CliError(
      `Error: --manifest cannot be used together with --note in stacked modes`,
      EXIT_USAGE
    ),
  
  missingNoteSingle: () =>
    new CliError(
      `Error: --note is required for single mode`,
      EXIT_USAGE
    ),
  
  writeFailed: (outFile: string) =>
    new CliError(
      `Error: ${outFile}: failed to write output`,
      EXIT_OUTPUT,
      outFile
    ),
};

// Warning messages (exit 0)
export const warnings = {
  oversize: (label: string, bytes: number) =>
    `Warning: ${label} is ${bytes} bytes (> 65535). ProTracker may not load the full sample.`,
  
  overwrite: (outFile: string) =>
    `Warning: ${outFile} exists; use --force to overwrite`,
};
