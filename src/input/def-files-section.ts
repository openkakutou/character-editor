// A deliberately minimal, narrow read of a `.def` file's own `[Files]`
// section — just enough to learn which sibling filenames it references
// (`sprite`/`anim`/`cns`/`cmd`), so a folder-based load (backlog item 014)
// can look those exact names up in the already-gathered folder listing
// before calling the real WASM `loadCharacter` bridge, which itself
// requires all four required files' bytes at once and so cannot answer
// "what does this .def reference" on its own. Mirrors the `character` Go
// library's own `def.Parse` key-to-field mapping exactly (see
// github.com/openkakutou/character's `def/parser.go`), but nothing else
// about `.def`'s grammar (comments, `[Info]`, palette/state-file lists) is
// reimplemented — see
// .vibe/decisions/016-folder-only-input-def-files-parse-and-ported-resolution.md.

/** The 4 `.def` [Files] references this app needs to resolve a folder-loaded character. */
export interface DefFileReferences {
  spriteFile: string;
  animationFile: string;
  constantsFile: string;
  commandFile: string;
}

const KEY_TO_FIELD: Readonly<Record<string, keyof DefFileReferences>> = {
  sprite: "spriteFile",
  anim: "animationFile",
  cns: "constantsFile",
  cmd: "commandFile",
};

/**
 * Reads only the `[Files]` section's `sprite`/`anim`/`cns`/`cmd` keys from a
 * `.def` file's text, case-insensitively for both the section name and the
 * keys (as real `.def` files are authored). Any other section or key is
 * ignored. A key not present in the file is left as an empty string, the
 * same "not referenced" meaning `character`'s own parser gives it.
 */
export function parseDefFileReferences(defText: string): DefFileReferences {
  const result: DefFileReferences = {
    spriteFile: "",
    animationFile: "",
    constantsFile: "",
    commandFile: "",
  };

  let inFilesSection = false;

  for (const rawLine of defText.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    const sectionMatch = line.match(/^\[([^\]]*)\]/);
    if (sectionMatch) {
      inFilesSection = sectionMatch[1].trim().toLowerCase() === "files";
      continue;
    }

    if (!inFilesSection) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const field = KEY_TO_FIELD[key];
    if (!field) continue;

    // A trailing `;`-prefixed comment is real .def syntax, same as `.cns`/`.air`.
    const rawValue = line.slice(separatorIndex + 1).split(";")[0] ?? "";
    result[field] = rawValue.trim();
  }

  return result;
}
