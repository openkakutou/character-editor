// Pure validation of the loaded character, feeding the sidebar badges and the
// Output section's problem list (UX flow 001). Every rule flags only
// something objectively wrong in the data: an error blocks nothing by
// itself but is a defect the user should fix before export, a warning is
// probably unintended. Messages are translated when the issues are
// computed; the shell recomputes on a locale change.
import { validateCommandRow } from "../commands/command-logic.ts";
import type { CharacterDocument } from "../document/character-document.ts";
import { t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import type { SectionId } from "../shell/sections.ts";
import { mergeSpriteGroups } from "../sprites/sprite-edits.ts";
import type { SpriteGroup } from "../wasm/types.ts";

export type IssueSeverity = "error" | "warning";

/** Where to move focus for an issue: the `index`-th match of `selector` inside the issue's section. */
export interface IssueTarget {
  selector: string;
  index?: number;
}

export interface ValidationIssue {
  /** Stable across recomputations, unique per issue. */
  id: string;
  section: SectionId;
  severity: IssueSeverity;
  message: string;
  target?: IssueTarget;
}

function issue(
  section: SectionId,
  rule: string,
  key: string | number,
  severity: IssueSeverity,
  message: string,
  target?: IssueTarget,
): ValidationIssue {
  return {
    id: `${section}:${rule}:${key}`,
    section,
    severity,
    message,
    target,
  };
}

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function spriteExists(
  groups: readonly SpriteGroup[],
  group: number,
  image: number,
): boolean {
  return groups.some(
    (g) => g.index === group && g.sprites.some((s) => s.image === image),
  );
}

function identityIssues(doc: CharacterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (doc.character.name.trim() === "") {
    issues.push(
      issue(
        "identity",
        "empty-name",
        "name",
        "error",
        t("validation.nameEmpty", "The character has no name."),
        { selector: '[data-field="name"]' },
      ),
    );
  }
  if (doc.character.author.trim() === "") {
    issues.push(
      issue(
        "identity",
        "empty-author",
        "author",
        "warning",
        t("validation.authorEmpty", "The author is not filled in."),
        { selector: '[data-field="author"]' },
      ),
    );
  }
  return issues;
}

function resourceIssues(doc: CharacterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const refs = doc.character.sprites.flatMap((group) =>
    group.sprites.map((sprite) => `${sprite.group},${sprite.image}`),
  );
  for (const ref of duplicates(refs)) {
    const [group, image] = ref.split(",");
    issues.push(
      issue(
        "sprites",
        "duplicate",
        ref,
        "error",
        t(
          "validation.spriteDuplicate",
          "Sprite {{group}},{{image}} appears more than once.",
          { group, image },
        ),
        { selector: `[data-group-index="${group}"]` },
      ),
    );
  }
  const effective = mergeSpriteGroups(doc.character.sprites, doc.spriteEdits);
  if (effective.length === 0) {
    issues.push(
      issue(
        "sprites",
        "none",
        "all",
        "warning",
        t("validation.noSprite", "The character has no sprite."),
      ),
    );
  }
  if (doc.character.palettes.length === 0) {
    issues.push(
      issue(
        "palettes",
        "none",
        "all",
        "warning",
        t("validation.noPalette", "No palette is declared."),
      ),
    );
  }
  return issues;
}

function animationIssues(doc: CharacterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { animations } = doc.character;
  const sprites = mergeSpriteGroups(doc.character.sprites, doc.spriteEdits);
  const target = (number: number): IssueTarget => ({
    selector: `[data-animation="${number}"]`,
  });

  for (const number of duplicates(animations.map((a) => a.number))) {
    issues.push(
      issue(
        "animations",
        "duplicate",
        number,
        "error",
        t(
          "validation.animationDuplicate",
          "Animation {{number}} is defined more than once.",
          { number: String(number) },
        ),
        target(number),
      ),
    );
  }
  for (const animation of animations) {
    if (animation.frames.length === 0) {
      issues.push(
        issue(
          "animations",
          "no-frame",
          animation.number,
          "error",
          t(
            "validation.animationNoFrame",
            "Animation {{number}} has no frame.",
            { number: String(animation.number) },
          ),
          target(animation.number),
        ),
      );
      continue;
    }
    const missing = animation.frames.filter(
      (frame) => !spriteExists(sprites, frame.group, frame.image),
    ).length;
    if (missing > 0) {
      issues.push(
        issue(
          "animations",
          "missing-sprite",
          animation.number,
          "warning",
          tCount(
            "validation.animationMissingSprite",
            missing,
            {
              one: "Animation {{number}} uses {{count}} sprite that does not exist.",
              other:
                "Animation {{number}} uses {{count}} sprites that do not exist.",
            },
            { number: String(animation.number) },
          ),
          target(animation.number),
        ),
      );
    }
  }
  return issues;
}

function stateIssues(doc: CharacterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { stateDefs, animations } = doc.character;
  const target = (number: number): IssueTarget => ({
    selector: `[data-statedef="${number}"]`,
  });

  for (const number of duplicates(stateDefs.map((s) => s.number))) {
    issues.push(
      issue(
        "states",
        "duplicate",
        number,
        "error",
        t(
          "validation.stateDuplicate",
          "StateDef {{number}} is defined more than once.",
          { number: String(number) },
        ),
        target(number),
      ),
    );
  }
  const animationNumbers = new Set(animations.map((a) => a.number));
  // 0 is also what an unset `anim` parses to, so only a positive number is a
  // deliberate reference worth flagging.
  for (const def of stateDefs) {
    if (def.anim > 0 && !animationNumbers.has(def.anim)) {
      issues.push(
        issue(
          "states",
          "missing-animation",
          def.number,
          "warning",
          t(
            "validation.stateMissingAnimation",
            "StateDef {{state}} uses animation {{anim}}, which does not exist.",
            { state: String(def.number), anim: String(def.anim) },
          ),
          target(def.number),
        ),
      );
    }
  }
  return issues;
}

function commandIssues(doc: CharacterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { commands } = doc.commandFile;
  const names = commands.map((command) => command.name.trim());
  commands.forEach((command, index) => {
    const others = names.filter((_, i) => i !== index);
    const row = validateCommandRow(command.name, command.input, "", others, []);
    // A duplicated name is reported once, on the later occurrences.
    const target: IssueTarget = { selector: "[data-command-row]", index };
    if (command.name.trim() === "") {
      issues.push(
        issue(
          "commands",
          "empty-name",
          index,
          "error",
          t("validation.commandNameEmpty", "Command {{n}} has no name.", {
            n: String(index + 1),
          }),
          target,
        ),
      );
    } else if (row.nameError !== null && names.indexOf(names[index]) < index) {
      issues.push(
        issue(
          "commands",
          "duplicate-name",
          index,
          "error",
          t(
            "validation.commandNameDuplicate",
            'Command "{{name}}" is defined more than once.',
            { name: command.name.trim() },
          ),
          target,
        ),
      );
    }
    if (row.inputError !== null) {
      issues.push(
        issue(
          "commands",
          "empty-input",
          index,
          "error",
          t(
            "validation.commandInputEmpty",
            "Command {{n}} has no input sequence.",
            { n: String(index + 1) },
          ),
          target,
        ),
      );
    }
  });
  return issues;
}

/** Every problem found in `doc`, in section order. */
export function validateCharacterDocument(
  doc: CharacterDocument,
): ValidationIssue[] {
  return [
    ...identityIssues(doc),
    ...resourceIssues(doc),
    ...stateIssues(doc),
    ...commandIssues(doc),
    ...animationIssues(doc),
  ];
}
