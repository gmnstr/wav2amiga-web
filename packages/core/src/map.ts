/**
 * Maps 16-bit PCM samples to 8-bit values.
 * Input range: -32768 to 32767
 * Output range: 0 to 255
 */
export function mapPcm16To8Bit(input: Int16Array): Uint8Array {
  const output = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const unsigned16 = input[i] + 32768; // 0..65535
    output[i] = (unsigned16 >>> 8) & 0xff; // 0..255
  }
  return output;
}
