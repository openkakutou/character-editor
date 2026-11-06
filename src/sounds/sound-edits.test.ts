import { describe, expect, it } from "vitest";
import type { Controller, Sound, StateDef } from "../wasm/types.ts";
import {
  type SoundEdit,
  countSoundReferences,
  mergeSoundGroups,
  nextFreeSample,
} from "./sound-edits.ts";

function sound(group: number, sample: number, rate = 22050): Sound {
  return {
    group,
    sample,
    sampleRate: rate,
    channels: 1,
    bitsPerSample: 16,
    pcm: [1, 2],
  };
}

const base = [
  { index: 0, sounds: [sound(0, 0), sound(0, 2)] },
  { index: 5, sounds: [sound(5, 1)] },
];

describe("mergeSoundGroups", () => {
  it("returns the base groups unchanged when there is no edit", () => {
    expect(mergeSoundGroups(base, [])).toEqual(base);
  });

  it("adds a sound into an existing group and creates a missing one, sorted", () => {
    const edits: SoundEdit[] = [
      {
        kind: "add",
        group: 9,
        sample: 0,
        wav: new Uint8Array(),
        sound: sound(9, 0),
      },
      {
        kind: "add",
        group: 0,
        sample: 1,
        wav: new Uint8Array(),
        sound: sound(0, 1),
      },
    ];
    const merged = mergeSoundGroups(base, edits);
    expect(merged.map((g) => g.index)).toEqual([0, 5, 9]);
    expect(merged[0].sounds.map((s) => s.sample)).toEqual([0, 1, 2]);
  });

  it("replaces a sound in place with the newly decoded one", () => {
    const merged = mergeSoundGroups(base, [
      {
        kind: "replace",
        group: 5,
        sample: 1,
        wav: new Uint8Array(),
        sound: sound(5, 1, 8000),
      },
    ]);
    expect(merged[1].sounds).toEqual([sound(5, 1, 8000)]);
  });

  it("drops a deleted sound, and its group once empty", () => {
    const merged = mergeSoundGroups(base, [
      { kind: "delete", group: 5, sample: 1 },
      { kind: "delete", group: 0, sample: 0 },
    ]);
    expect(merged).toEqual([{ index: 0, sounds: [sound(0, 2)] }]);
  });

  it("replays edits in order: a sound added then deleted leaves nothing, deleted then re-added is back", () => {
    const add: SoundEdit = {
      kind: "add",
      group: 7,
      sample: 7,
      wav: new Uint8Array(),
      sound: sound(7, 7),
    };
    const del: SoundEdit = { kind: "delete", group: 7, sample: 7 };
    expect(mergeSoundGroups(base, [add, del])).toEqual(base);
    expect(mergeSoundGroups(base, [del, add]).some((g) => g.index === 7)).toBe(
      true,
    );
  });

  it("does not modify its inputs", () => {
    const copy = structuredClone(base);
    mergeSoundGroups(base, [{ kind: "delete", group: 0, sample: 0 }]);
    expect(base).toEqual(copy);
  });
});

describe("nextFreeSample", () => {
  it("is 0 for a group that does not exist", () => {
    expect(nextFreeSample(base, 42)).toBe(0);
  });

  it("fills the first gap in a group", () => {
    expect(nextFreeSample(base, 0)).toBe(1);
  });

  it("goes past the last sample of a gapless group", () => {
    expect(
      nextFreeSample([{ index: 1, sounds: [sound(1, 0), sound(1, 1)] }], 1),
    ).toBe(2);
  });
});

function stateWith(...controllers: StateDef["controllers"]): StateDef {
  return {
    number: 0,
    type: "S",
    moveType: "I",
    physics: "S",
    anim: 0,
    ctrl: true,
    powerAdd: 0,
    juggle: 0,
    faceP2: false,
    hitDefPersist: false,
    moveHitPersist: false,
    hitCountPersist: false,
    sprPriority: 0,
    controllers,
  } as StateDef;
}

function playSnd(value: string | undefined, type = "PlaySnd"): Controller {
  const parameters: Record<string, string> = {};
  if (value !== undefined) parameters.value = value;
  return { type, triggers: ["1"], parameters };
}

describe("countSoundReferences", () => {
  it("counts the PlaySnd controllers naming exactly this sound, across states", () => {
    const states = [
      stateWith(playSnd("5, 1"), playSnd("5,2")),
      stateWith(playSnd("S5, 1"), playSnd(" 5 , 1 ")),
    ];
    expect(countSoundReferences(states, 5, 1)).toEqual({
      exact: 3,
      unresolved: 0,
    });
  });

  it("ignores the common sound file (F prefix) and other controller types", () => {
    const states = [stateWith(playSnd("F5, 1"), playSnd("5, 1", "VarSet"))];
    expect(countSoundReferences(states, 5, 1)).toEqual({
      exact: 0,
      unresolved: 0,
    });
  });

  it("counts a value it cannot read as unresolved, whatever the sound", () => {
    const states = [
      stateWith(
        playSnd("var(3), 0"),
        playSnd("5, 1+Random"),
        playSnd(undefined),
        playSnd(""),
      ),
    ];
    expect(countSoundReferences(states, 9, 9)).toEqual({
      exact: 0,
      unresolved: 4,
    });
  });

  it("matches the controller type case-insensitively", () => {
    expect(
      countSoundReferences([stateWith(playSnd("1, 1", "playsnd"))], 1, 1).exact,
    ).toBe(1);
  });

  it("is zero for no states at all", () => {
    expect(countSoundReferences([], 0, 0)).toEqual({ exact: 0, unresolved: 0 });
  });
});
