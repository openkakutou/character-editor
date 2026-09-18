import { describe, expect, it } from "vitest";
import { parseDefFileReferences } from "./def-files-section.ts";

describe("parseDefFileReferences", () => {
  it("reads the sprite/anim/cns/cmd keys from a [Files] section, ignoring [Info] and unrelated keys", () => {
    const src = `[Info]
name = "Kung Fu Man"
author = "Elecbyte"

[Files]
cmd = kfm.cmd
cns = kfm.cns
sprite = kfm.sff
anim = kfm.air
sound = kfm.snd
st1 = kfm_extra1.st
pal1 = kfm1.act
`;

    expect(parseDefFileReferences(src)).toEqual({
      spriteFile: "kfm.sff",
      animationFile: "kfm.air",
      constantsFile: "kfm.cns",
      commandFile: "kfm.cmd",
    });
  });

  it("matches the section/key names case-insensitively, as real .def files do", () => {
    const src = `[FILES]
SPRITE = Kfm.SFF
Anim = kfm.AIR
CNS = kfm.CNS
`;

    expect(parseDefFileReferences(src)).toEqual({
      spriteFile: "Kfm.SFF",
      animationFile: "kfm.AIR",
      constantsFile: "kfm.CNS",
      commandFile: "",
    });
  });

  it("leaves a key empty when the [Files] section doesn't set it (e.g. no .cmd referenced at all)", () => {
    const src = `[Files]
sprite = kfm.sff
anim = kfm.air
cns = kfm.cns
`;

    expect(parseDefFileReferences(src)).toEqual({
      spriteFile: "kfm.sff",
      animationFile: "kfm.air",
      constantsFile: "kfm.cns",
      commandFile: "",
    });
  });

  it("returns every field empty when there is no [Files] section at all", () => {
    const src = `[Info]
name = "No Files Section"
`;

    expect(parseDefFileReferences(src)).toEqual({
      spriteFile: "",
      animationFile: "",
      constantsFile: "",
      commandFile: "",
    });
  });

  it("ignores a same-named key that appears outside the [Files] section", () => {
    const src = `[Info]
sprite = not-a-files-entry.sff

[Files]
sprite = kfm.sff
`;

    expect(parseDefFileReferences(src).spriteFile).toBe("kfm.sff");
  });
});
