// The words around each section: title, one-sentence description (the novice
// help of the header card), optional contextual help and the group labels.
// Defaults are the English catalog entries.
import { t } from "../i18n/i18n.ts";
import type { SectionGroupId, SectionId } from "./sections.ts";

interface SectionDefaults {
  title: string;
  description: string;
  help?: string;
}

const DEFAULTS: Record<SectionId, SectionDefaults> = {
  identity: {
    title: "Identity",
    description: "Name, author and the files that make up the character.",
  },
  sprites: {
    title: "Sprites",
    description: "Browse, import, replace and delete the character's images.",
  },
  sounds: {
    title: "Sounds",
    description: "Listen to the sounds the character can play.",
  },
  palettes: {
    title: "Palettes",
    description: "Recolour the character and save a palette file.",
  },
  states: {
    title: "States",
    description:
      "Describe what the character does in each state: standing, jumping, attacking.",
    help: "A StateDef describes what the character does in one state. Its controllers run every frame while the character is in that state.",
  },
  commands: {
    title: "Commands",
    description: "Define the button sequences that trigger moves.",
  },
  animations: {
    title: "Animations",
    description: "Edit frames and their collision boxes.",
    help: "Clsn1 boxes are where an attack hits; Clsn2 boxes are where the character can be hit.",
  },
  output: {
    title: "Export",
    description: "Review the problems found, then export the character files.",
  },
};

export function sectionTitle(id: SectionId): string {
  return t(`sections.${id}.title`, DEFAULTS[id].title);
}

export function sectionDescription(id: SectionId): string {
  return t(`sections.${id}.description`, DEFAULTS[id].description);
}

/** The contextual explanation shown behind the header's "?" button, if the section has one. */
export function sectionHelp(id: SectionId): string | undefined {
  const help = DEFAULTS[id].help;
  return help === undefined ? undefined : t(`sections.${id}.help`, help);
}

/** The label of the "?" button, naming what it explains. */
export function sectionHelpLabel(id: SectionId): string {
  return t("sections.helpLabel", "Help: {{section}}", {
    section: sectionTitle(id),
  });
}

const GROUP_DEFAULTS: Record<SectionGroupId, string> = {
  character: "Character",
  resources: "Resources",
  logic: "Logic",
  output: "Output",
};

export function groupLabel(id: SectionGroupId): string {
  return t(`nav.group.${id}`, GROUP_DEFAULTS[id]);
}
