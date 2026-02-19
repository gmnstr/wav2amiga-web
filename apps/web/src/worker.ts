/**
 * Web Worker for deterministic WAV to 8SVX conversion.
 * Delegates conversion orchestration to the shared core convert() facade.
 */

import {
  convert,
  type AudioInput,
  type Mode as ConvertMode,
  type SegmentInfo,
  ConversionError,
  type Report,
  type ReportSegment,
  type W2AError,
  generateSingleFilename,
  filenameForStacked,
  filenameForStackedEqual,
  type StackingMode,
} from "@wav2amiga/core";

export interface ConvertMsg {
  type: "convert";
  files: Array<{
    name: string;
    pcm16: Int16Array;
    srcHz: number;
    note: string;
  }>;
  mode: StackingMode;
}

export interface WorkerReportSegment extends ReportSegment {
  paddedLength: number;
  sampleData: Record<string, number>;
}

export interface WorkerReport extends Report {
  segments: WorkerReportSegment[];
}

export interface ResultMsg {
  type: "result";
  output: Uint8Array;
  report: WorkerReport;
  filename: string;
}

export interface ErrorMsg {
  type: "error";
  error: W2AError;
}

type WorkerMessage = ConvertMsg;
type WorkerResponse = ResultMsg | ErrorMsg;

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "");
}

function createEightSVXFile(segments: SegmentInfo[], bodyBytes: Uint8Array): Uint8Array {
  if (segments.length === 0) {
    throw new Error("no segments to write");
  }

  const name = "wav2amiga";
  const nameChunkSize = (name.length + 1) & ~1;
  const bodySize = segments.reduce((sum, segment) => sum + segment.paddedLengthBytes, 0);
  const totalSize = 12 + 28 + (8 + nameChunkSize) + 8 + bodySize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let pos = 0;

  view.setUint32(pos, 0x464f524d, false); // "FORM"
  view.setUint32(pos + 4, totalSize - 8, false);
  view.setUint32(pos + 8, 0x38535658, false); // "8SVX"
  pos += 12;

  view.setUint32(pos, 0x56484452, false); // "VHDR"
  view.setUint32(pos + 4, 20, false);
  view.setUint32(pos + 8, 0, false);
  view.setUint32(pos + 12, 0, false);
  view.setUint32(pos + 16, 0, false);
  view.setUint32(pos + 20, segments[0]?.targetHz ?? 0, false);
  view.setUint16(pos + 24, 1, false);
  view.setUint16(pos + 26, 0, false);
  pos += 28;

  view.setUint32(pos, 0x4e414d45, false); // "NAME"
  view.setUint32(pos + 4, nameChunkSize, false);
  for (let i = 0; i < name.length; i++) {
    view.setUint8(pos + 8 + i, name.charCodeAt(i));
  }
  pos += 8 + nameChunkSize;

  view.setUint32(pos, 0x424f4459, false); // "BODY"
  view.setUint32(pos + 4, bodySize, false);
  pos += 8;

  for (let i = 0; i < bodyBytes.length; i++) {
    view.setUint8(pos + i, bodyBytes[i]);
  }

  return new Uint8Array(buffer);
}

function buildReportSegments(
  segments: SegmentInfo[],
  bodyBytes: Uint8Array,
): WorkerReportSegment[] {
  return segments.map((segment) => {
    const sampleData: Record<string, number> = {};
    const start = segment.startByte;
    for (let i = 0; i < segment.lengthBytes; i++) {
      sampleData[i.toString()] = bodyBytes[start + i];
    }

    return {
      ...segment,
      paddedLength: segment.paddedLengthBytes,
      sampleData,
    };
  });
}

function selectFilename(mode: StackingMode, baseLabel: string, segments: SegmentInfo[]): string {
  if (mode === "single") {
    return generateSingleFilename(baseLabel);
  }
  if (mode === "stacked") {
    const starts = segments.map((segment) => segment.startByte);
    return filenameForStacked(baseLabel, starts);
  }
  const slot = segments[0]?.paddedLengthBytes ?? 0;
  return filenameForStackedEqual(baseLabel, slot);
}

export function convertFiles(
  files: ConvertMsg["files"],
  mode: StackingMode,
): { output: Uint8Array; filename: string; report: WorkerReport } {
  const labels = files.map((file) => stripExtension(file.name));
  const inputs: AudioInput[] = files.map((file, index) => ({
    pcm16: file.pcm16,
    label: labels[index],
    note: file.note,
    sourceHz: file.srcHz,
  }));

  const convertResult = convert(inputs, { mode: mode as ConvertMode });
  const filename = selectFilename(mode, labels[0] ?? "kit", convertResult.segments);
  const output = createEightSVXFile(convertResult.segments, convertResult.outputBytes);
  const reportSegments = buildReportSegments(convertResult.segments, convertResult.outputBytes);

  return {
    output,
    filename,
    report: {
      mode,
      outputFile: filename,
      segments: reportSegments,
      resampler: convertResult.resampler,
    },
  };
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  try {
    const { type, files, mode } = event.data;

    if (type !== "convert") {
      throw new Error("unknown message type");
    }

    const result = convertFiles(files, mode);

    const response: ResultMsg = {
      type: "result",
      output: result.output,
      report: result.report,
      filename: result.filename,
    };

    self.postMessage(response, [result.output.buffer]);
  } catch (error) {
    if (error instanceof ConversionError) {
      const response: ErrorMsg = {
        type: "error",
        error: error.w2aError,
      };
      self.postMessage(response);
      return;
    }

    const fallback: ErrorMsg = {
      type: "error",
      error: {
        code: "worker/unhandled",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    self.postMessage(fallback);
  }
};
