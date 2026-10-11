import { describe, expect, it } from "vitest";
import en from "./en.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };

function flatten(node: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (typeof value === "string") out[path] = value;
      else Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

const english = flatten(en);
const french = flatten(fr);

describe("catalogs", () => {
  it("have the same keys in English and French", () => {
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  });

  it("use the same placeholders in both languages", () => {
    const names = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(english)) {
      expect(names(french[key] ?? ""), key).toEqual(names(english[key] ?? ""));
    }
  });

  it("build no plural with a {{suffix}} placeholder", () => {
    for (const catalog of [english, french]) {
      for (const [key, text] of Object.entries(catalog)) {
        expect(text, key).not.toContain("{{suffix}}");
      }
    }
  });

  it("give every plural key both its one and other forms", () => {
    for (const catalog of [english, french]) {
      for (const key of Object.keys(catalog)) {
        if (key.endsWith("_one")) {
          expect(catalog, key).toHaveProperty([`${key.slice(0, -4)}_other`]);
        }
      }
    }
  });

  it("name collision boxes consistently", () => {
    expect(english["animations.hit"]).toBe("Hit box");
    expect(english["animations.hurt"]).toBe("Hurt box");
    expect(french["animations.hit"]).toBe("Zone d'attaque");
    expect(french["animations.hurt"]).toBe("Zone vulnérable");
  });

  it("keep StateDef out of the interface texts but for the format hint", () => {
    const allowed = new Set(["sections.states.help"]);
    for (const catalog of [english, french]) {
      for (const [key, text] of Object.entries(catalog)) {
        if (allowed.has(key)) continue;
        expect(text.toLowerCase(), key).not.toContain("statedef");
      }
    }
  });

  it("avoid the jargon the audit flagged", () => {
    for (const text of Object.values(english)) {
      expect(text).not.toMatch(/trailing footer|Stored as-is|\bland\b| -- /);
    }
  });
});
