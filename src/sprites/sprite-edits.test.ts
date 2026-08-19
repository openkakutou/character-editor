import { describe, expect, it } from "vitest";
import type { Animation, SpriteGroup } from "../wasm/types.ts";
import {
  type SpriteEdit,
  applySpriteEdit,
  countReferencingFrames,
  mergeSpriteGroups,
  nextAvailableGroupIndex,
  nextAvailableImageIndex,
  spriteEditFor,
} from "./sprite-edits.ts";

function baseGroups(): SpriteGroup[] {
  return [
    {
      index: 0,
      sprites: [
        {
          group: 0,
          image: 0,
          width: 10,
          height: 10,
          axisX: 5,
          axisY: 9,
          palette: 0,
        },
        {
          group: 0,
          image: 1,
          width: 12,
          height: 12,
          axisX: 6,
          axisY: 11,
          palette: 0,
        },
      ],
    },
    {
      index: 1,
      sprites: [
        {
          group: 1,
          image: 0,
          width: 20,
          height: 20,
          axisX: 0,
          axisY: 0,
          palette: 1,
        },
      ],
    },
  ];
}

describe("applySpriteEdit", () => {
  it("appends a new edit for a sprite with no prior pending edit", () => {
    const edit: SpriteEdit = {
      kind: "add",
      group: 2,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    };
    const result = applySpriteEdit([], edit);
    expect(result).toEqual([edit]);
  });

  it("replaces an earlier pending edit for the same sprite instead of appending", () => {
    const first: SpriteEdit = {
      kind: "add",
      group: 2,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    };
    const second: SpriteEdit = {
      kind: "replace",
      group: 2,
      image: 0,
      pixels: new Uint8Array(16),
      width: 2,
      height: 2,
    };
    const result = applySpriteEdit([first], second);
    expect(result).toEqual([second]);
  });

  it("leaves pending edits for other sprites untouched", () => {
    const other: SpriteEdit = { kind: "delete", group: 0, image: 0 };
    const edit: SpriteEdit = {
      kind: "add",
      group: 2,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    };
    const result = applySpriteEdit([other], edit);
    expect(result).toEqual([other, edit]);
  });
});

describe("mergeSpriteGroups", () => {
  it("returns the base groups unchanged when there are no edits", () => {
    const groups = baseGroups();
    expect(mergeSpriteGroups(groups, [])).toEqual(groups);
  });

  it("removes a deleted sprite, dropping its group entirely once empty", () => {
    const result = mergeSpriteGroups(baseGroups(), [
      { kind: "delete", group: 1, image: 0 },
    ]);
    expect(result.map((g) => g.index)).toEqual([0]);
  });

  it("inserts an added sprite into an existing group", () => {
    const result = mergeSpriteGroups(baseGroups(), [
      {
        kind: "add",
        group: 0,
        image: 2,
        pixels: new Uint8Array(4),
        width: 8,
        height: 8,
      },
    ]);
    const group0 = result.find((g) => g.index === 0);
    expect(group0?.sprites.map((s) => s.image)).toEqual([0, 1, 2]);
    expect(group0?.sprites[2]).toMatchObject({ width: 8, height: 8 });
  });

  it("creates a brand-new group for an added sprite whose group doesn't exist yet", () => {
    const result = mergeSpriteGroups(baseGroups(), [
      {
        kind: "add",
        group: 5,
        image: 0,
        pixels: new Uint8Array(4),
        width: 4,
        height: 4,
      },
    ]);
    expect(result.map((g) => g.index)).toEqual([0, 1, 5]);
  });

  it("updates an existing sprite's dimensions on replace, preserving its axis/palette", () => {
    const result = mergeSpriteGroups(baseGroups(), [
      {
        kind: "replace",
        group: 0,
        image: 0,
        pixels: new Uint8Array(400),
        width: 100,
        height: 100,
      },
    ]);
    const sprite = result[0]?.sprites.find((s) => s.image === 0);
    expect(sprite).toMatchObject({
      width: 100,
      height: 100,
      axisX: 5,
      axisY: 9,
      palette: 0,
    });
  });

  it("sorts groups and sprites for a stable display order regardless of edit order", () => {
    const result = mergeSpriteGroups(baseGroups(), [
      {
        kind: "add",
        group: 3,
        image: 0,
        pixels: new Uint8Array(4),
        width: 1,
        height: 1,
      },
      {
        kind: "add",
        group: 0,
        image: 5,
        pixels: new Uint8Array(4),
        width: 1,
        height: 1,
      },
    ]);
    expect(result.map((g) => g.index)).toEqual([0, 1, 3]);
    expect(result[0]?.sprites.map((s) => s.image)).toEqual([0, 1, 5]);
  });
});

describe("spriteEditFor", () => {
  it("returns the add/replace edit pending for a sprite", () => {
    const edit: SpriteEdit = {
      kind: "replace",
      group: 0,
      image: 0,
      pixels: new Uint8Array(4),
      width: 1,
      height: 1,
    };
    expect(spriteEditFor([edit], { group: 0, image: 0 })).toBe(edit);
  });

  it("returns undefined for a sprite with no pending edit", () => {
    expect(spriteEditFor([], { group: 0, image: 0 })).toBeUndefined();
  });

  it("returns undefined for a sprite only pending a delete", () => {
    const edit: SpriteEdit = { kind: "delete", group: 0, image: 0 };
    expect(spriteEditFor([edit], { group: 0, image: 0 })).toBeUndefined();
  });
});

describe("nextAvailableImageIndex", () => {
  it("returns 0 for a group that doesn't exist yet", () => {
    expect(nextAvailableImageIndex(undefined)).toBe(0);
  });

  it("returns 0 for an existing but empty group", () => {
    expect(nextAvailableImageIndex({ index: 0, sprites: [] })).toBe(0);
  });

  it("returns one past the highest existing image index", () => {
    expect(nextAvailableImageIndex(baseGroups()[0])).toBe(2);
  });
});

describe("nextAvailableGroupIndex", () => {
  it("returns 0 when there are no groups yet", () => {
    expect(nextAvailableGroupIndex([])).toBe(0);
  });

  it("returns one past the highest existing group index", () => {
    expect(nextAvailableGroupIndex(baseGroups())).toBe(2);
  });
});

describe("countReferencingFrames", () => {
  function animations(): Animation[] {
    return [
      {
        number: 0,
        loopStart: 0,
        frames: [
          {
            group: 0,
            image: 0,
            x: 0,
            y: 0,
            time: 1,
            flip: "",
            blend: "",
            clsn1: [],
            clsn2: [],
          },
          {
            group: 0,
            image: 1,
            x: 0,
            y: 0,
            time: 1,
            flip: "",
            blend: "",
            clsn1: [],
            clsn2: [],
          },
          {
            group: 0,
            image: 0,
            x: 0,
            y: 0,
            time: 1,
            flip: "",
            blend: "",
            clsn1: [],
            clsn2: [],
          },
        ],
      },
      {
        number: 1,
        loopStart: 0,
        frames: [
          {
            group: 0,
            image: 0,
            x: 0,
            y: 0,
            time: 1,
            flip: "",
            blend: "",
            clsn1: [],
            clsn2: [],
          },
        ],
      },
    ];
  }

  it("counts every frame across every animation referencing the sprite", () => {
    expect(countReferencingFrames(animations(), 0, 0)).toBe(3);
  });

  it("returns 0 for a sprite no frame references", () => {
    expect(countReferencingFrames(animations(), 9, 9)).toBe(0);
  });

  it("returns 0 for an empty animation list", () => {
    expect(countReferencingFrames([], 0, 0)).toBe(0);
  });
});
