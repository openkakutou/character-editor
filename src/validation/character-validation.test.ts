import { describe, expect, it } from "vitest";
import { emptyCommandFile } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import type {
  Animation,
  CharacterData,
  Command,
  Frame,
  SpriteGroup,
  StateDef,
} from "../wasm/types.ts";
import { validateCharacterDocument } from "./character-validation.ts";

function frame(group = 0, image = 0): Frame {
  return {
    group,
    image,
    x: 0,
    y: 0,
    time: 5,
    flip: "",
    blend: "",
    clsn1: [],
    clsn2: [],
  };
}

function animation(number: number, frames: Frame[] = [frame()]): Animation {
  return { number, frames, loopStart: 0 };
}

function stateDef(number: number, anim = 0): StateDef {
  return {
    number,
    type: "S",
    moveType: "I",
    physics: "S",
    anim,
    ctrl: true,
    powerAdd: 0,
    juggle: 0,
    faceP2: false,
    hitDefPersist: false,
    moveHitPersist: false,
    hitCountPersist: false,
    sprPriority: 0,
    controllers: [],
  };
}

function spriteGroups(...refs: Array<[number, number]>): SpriteGroup[] {
  const groups = new Map<number, SpriteGroup>();
  for (const [group, image] of refs) {
    const entry = groups.get(group) ?? { index: group, sprites: [] };
    entry.sprites.push({
      group,
      image,
      width: 1,
      height: 1,
      axisX: 0,
      axisY: 0,
      palette: 0,
    });
    groups.set(group, entry);
  }
  return [...groups.values()];
}

function documentWith(
  overrides: Partial<CharacterData> = {},
  commands: Command[] = [],
): CharacterDocument {
  const character: CharacterData = {
    name: "Kung Fu Man",
    author: "Someone",
    spriteFile: "kfm.sff",
    animationFile: "kfm.air",
    soundFile: "",
    commandFile: "kfm.cmd",
    constantsFile: "kfm.cns",
    stateFiles: [],
    palettes: ["kfm.act"],
    animations: [animation(0)],
    sprites: spriteGroups([0, 0]),
    stateDefs: [stateDef(0, 0)],
    ...overrides,
  };
  return {
    character,
    files: {} as CharacterDocument["files"],
    spriteEdits: [],
    commandFile: { ...emptyCommandFile(), commands },
  };
}

function command(name: string, input = "a"): Command {
  return { name, input, time: 0, bufferTime: 0 };
}

function ids(doc: CharacterDocument): string[] {
  return validateCharacterDocument(doc).map((issue) => issue.id);
}

describe("validateCharacterDocument", () => {
  it("reports nothing for a complete, consistent character", () => {
    expect(validateCharacterDocument(documentWith())).toEqual([]);
  });

  describe("identity", () => {
    it("reports an empty name as an error on the identity section", () => {
      const issues = validateCharacterDocument(documentWith({ name: "  " }));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "identity",
        severity: "error",
      });
    });

    it("reports an empty author as a warning", () => {
      const issues = validateCharacterDocument(documentWith({ author: "" }));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "identity",
        severity: "warning",
      });
    });
  });

  describe("resources", () => {
    it("reports a duplicated sprite (group, image) as an error on sprites", () => {
      const doc = documentWith({
        sprites: spriteGroups([0, 0], [0, 0], [0, 1]),
      });
      const issues = validateCharacterDocument(doc);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "sprites",
        severity: "error",
      });
    });

    it("warns when the character has no sprite at all", () => {
      const doc = documentWith({ sprites: [], animations: [] });
      const issues = validateCharacterDocument(doc);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "sprites",
        severity: "warning",
      });
    });

    it("counts a sprite added by a pending edit as existing", () => {
      const doc = documentWith({ sprites: [], animations: [] });
      doc.spriteEdits = [
        {
          kind: "add",
          group: 0,
          image: 0,
          pixels: new Uint8Array(1),
          width: 1,
          height: 1,
        },
      ];
      expect(validateCharacterDocument(doc)).toEqual([]);
    });

    it("warns when no palette is declared", () => {
      const issues = validateCharacterDocument(documentWith({ palettes: [] }));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "palettes",
        severity: "warning",
      });
    });
  });

  describe("animations", () => {
    it("reports duplicated animation numbers as an error", () => {
      const doc = documentWith({ animations: [animation(5), animation(5)] });
      const issues = validateCharacterDocument(doc).filter(
        (i) => i.severity === "error",
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].section).toBe("animations");
    });

    it("reports an animation without any frame as an error", () => {
      const doc = documentWith({ animations: [animation(7, [])] });
      expect(ids(doc)).toEqual(["animations:no-frame:7"]);
    });

    it("warns once per animation whose frames use a missing sprite", () => {
      const doc = documentWith({
        animations: [animation(3, [frame(9, 9), frame(9, 8), frame(0, 0)])],
      });
      const issues = validateCharacterDocument(doc);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        id: "animations:missing-sprite:3",
        severity: "warning",
      });
    });

    it("does not warn about a sprite deleted by a pending edit being unused", () => {
      const doc = documentWith();
      doc.spriteEdits = [{ kind: "delete", group: 0, image: 0 }];
      expect(ids(doc)).toContain("animations:missing-sprite:0");
    });
  });

  describe("states", () => {
    it("reports duplicated StateDef numbers as an error", () => {
      const doc = documentWith({ stateDefs: [stateDef(10), stateDef(10)] });
      expect(ids(doc)).toEqual(["states:duplicate:10"]);
    });

    it("warns when a StateDef points to an animation that does not exist", () => {
      const doc = documentWith({ stateDefs: [stateDef(200, 999)] });
      const issues = validateCharacterDocument(doc);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        section: "states",
        severity: "warning",
      });
    });

    it("does not warn about an unset animation (0 or negative)", () => {
      const doc = documentWith({
        animations: [],
        sprites: spriteGroups([0, 0]),
        stateDefs: [stateDef(0, 0), stateDef(1, -1)],
      });
      expect(validateCharacterDocument(doc)).toEqual([]);
    });
  });

  describe("commands", () => {
    it("reports duplicated command names as an error", () => {
      const doc = documentWith({}, [command("fireball"), command("fireball")]);
      const errors = validateCharacterDocument(doc).filter(
        (i) => i.section === "commands",
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe("error");
    });

    it("reports an empty input sequence as an error", () => {
      const doc = documentWith({}, [command("fireball", "  ")]);
      expect(ids(doc)).toEqual(["commands:empty-input:0"]);
    });

    it("reports an empty command name as an error", () => {
      const doc = documentWith({}, [command("")]);
      expect(ids(doc)).toEqual(["commands:empty-name:0"]);
    });
  });

  it("returns every issue with a stable, unique id", () => {
    const doc = documentWith(
      { name: "", palettes: [], stateDefs: [stateDef(1), stateDef(1)] },
      [command("a"), command("a", "")],
    );
    const all = ids(doc);
    expect(new Set(all).size).toBe(all.length);
  });
});
