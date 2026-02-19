import { createZohResampler } from "@wav2amiga/resampler-zoh";

type ResamplerInfo = { name: "ZOH"; version: string };

const RESAMPLER_INFO: ResamplerInfo = (() => {
  const instance = createZohResampler();
  return {
    name: "ZOH",
    version: instance.meta.version ?? "unknown",
  };
})();

export function getResamplerInfo(): ResamplerInfo {
  return { ...RESAMPLER_INFO };
}
