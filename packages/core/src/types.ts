import type { Mode, SegmentInfo } from "./convert.js";

export interface W2AError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export class ConversionError extends Error {
  readonly w2aError: W2AError;

  constructor(error: W2AError) {
    super(error.message);
    this.name = "ConversionError";
    this.w2aError = error;
  }
}

export interface ReportSegment extends SegmentInfo {}

export interface Report {
  mode: Mode;
  outputFile: string;
  segments: ReportSegment[];
  resampler: { name: "ZOH"; version: string };
  // versions.* excluded from golden SHA comparison by policy
}
