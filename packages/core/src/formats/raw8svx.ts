export const ALIGN = 0x100;

export function alignTo256(length: number): number {
  if (length <= 0) {
    return 0;
  }
  return (length + (ALIGN - 1)) & ~(ALIGN - 1);
}

export function writeRaw8(
  parts: Uint8Array[],
  mode: "stacked" | "stacked-equal",
): { bytes: Uint8Array; starts: number[]; slot?: number } {
  if (parts.length === 0) {
    return mode === "stacked-equal"
      ? { bytes: new Uint8Array(0), starts: [], slot: 0 }
      : { bytes: new Uint8Array(0), starts: [] };
  }

  const paddedLengths = parts.map((part) => alignTo256(part.length));

  if (mode === "stacked-equal") {
    const slot = Math.max(...paddedLengths);
    const starts: number[] = [];
    let totalLength = 0;

    for (let i = 0; i < paddedLengths.length; i++) {
      starts.push(totalLength);
      totalLength += paddedLengths[i];
    }

    const bytes = new Uint8Array(totalLength);
    bytes.fill(0x80);

    for (let i = 0; i < parts.length; i++) {
      bytes.set(parts[i], starts[i]);
    }

    return { bytes, starts, slot };
  }

  const starts: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < paddedLengths.length; i++) {
    starts.push(totalLength);
    totalLength += paddedLengths[i];
  }

  const bytes = new Uint8Array(totalLength);
  bytes.fill(0x80);

  for (let i = 0; i < parts.length; i++) {
    bytes.set(parts[i], starts[i]);
  }

  return { bytes, starts };
}
