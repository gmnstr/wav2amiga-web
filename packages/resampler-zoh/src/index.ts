export interface ZohMeta {
  name: 'zoh';
  version: string;
}

export interface ZohApi {
  meta: ZohMeta;
  resamplePCM16(_input: Int16Array, _srcHz: number, _dstHz: number): Int16Array;
}

/**
 * Creates a zero-order hold (ZOH) resampler instance.
 * ZOH preserves transients without interpolation, matching Paula's sample-and-hold behavior.
 * 
 * @param version Version string for the resampler
 * @returns ZOH resampler API instance
 */
export function createZohResampler(version = '1.0.0'): ZohApi {
  const meta: ZohMeta = {
    name: 'zoh',
    version
  };

  return {
    meta,
    resamplePCM16(input: Int16Array, srcHz: number, dstHz: number): Int16Array {
      if (srcHz === dstHz) {
        return input.slice();
      }

      // Calculate output length using consistent rounding
      const ratio = dstHz / srcHz;
      const outLen = Math.round(input.length * ratio);
      
      if (outLen === 0) {
        return new Int16Array(0);
      }

      const output = new Int16Array(outLen);
      
      // Bresenham/fixed-point algorithm for zero-order hold
      let acc = 0;
      let idx = 0;
      
      for (let n = 0; n < outLen; n++) {
        // Sample-and-hold: use current input sample
        output[n] = input[idx];
        
        // Advance accumulator
        acc += srcHz;
        
        // Skip/advance input index when needed
        while (acc >= dstHz) {
          acc -= dstHz;
          if (idx + 1 < input.length) {
            idx++;
          }
        }
      }
      
      return output;
    }
  };
}
