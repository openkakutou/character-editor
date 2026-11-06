import { afterEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import type { CharacterData, Sound } from "../wasm/types.ts";
import {
  type SoundPlayer,
  createWebAudioPlayer,
  renderSoundBrowser,
} from "./sound-browser.ts";

function sound(group: number, sample: number, extra: Partial<Sound> = {}) {
  return {
    group,
    sample,
    sampleRate: 22050,
    channels: 1,
    bitsPerSample: 16,
    pcm: [1, -1, 2, -2],
    ...extra,
  } satisfies Sound;
}

function character(sounds?: CharacterData["sounds"]): CharacterData {
  return {
    name: "Test",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [],
    sounds,
  };
}

const twoGroups = [
  { index: 0, sounds: [sound(0, 0), sound(0, 1)] },
  { index: 5, sounds: [sound(5, 1)] },
];

/** A fake player recording calls; `end()` simulates natural end of the current sound. */
function fakePlayer() {
  let onEnded: (() => void) | null = null;
  const player = {
    play: vi.fn((_s: Sound, cb: () => void) => {
      onEnded = cb;
    }),
    stop: vi.fn(() => {
      onEnded = null;
    }),
    end: () => onEnded?.(),
  };
  return player satisfies SoundPlayer & { end: () => void };
}

function mount(
  c: CharacterData,
  player: SoundPlayer,
  files: { sndIssue?: string } = {},
): HTMLElement {
  const root = document.createElement("div");
  renderSoundBrowser(root, c, files, { createPlayer: () => player });
  return root;
}

function expandAll(root: HTMLElement): void {
  for (const toggle of root.querySelectorAll<HTMLButtonElement>(
    ".sound-browser__group-toggle",
  )) {
    toggle.click();
  }
}

function rows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".sound-browser__sound")];
}

describe("renderSoundBrowser", () => {
  it("lists every group with its sample count, collapsed, then every sample labelled 'group,sample' once expanded", () => {
    const root = mount(character(twoGroups), fakePlayer());

    const toggles = [
      ...root.querySelectorAll(".sound-browser__group-toggle"),
    ].map((e) => e.textContent);
    expect(toggles).toEqual(["Group 0 (2)", "Group 5 (1)"]);
    expect(rows(root)).toHaveLength(0);

    expandAll(root);

    expect(rows(root).map((r) => r.textContent)).toEqual([
      expect.stringContaining("0,0"),
      expect.stringContaining("0,1"),
      expect.stringContaining("5,1"),
    ]);
  });

  it("plays a sample on click, shows it as playing, and returns to idle when it ends naturally", () => {
    const player = fakePlayer();
    const root = mount(character(twoGroups), player);
    expandAll(root);

    rows(root)[0].click();

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.calls[0][0]).toMatchObject({ group: 0, sample: 0 });
    expect(rows(root)[0].textContent).toContain("Stop");
    expect(rows(root)[0].dataset.playing).toBe("true");
    expect(root.querySelector(".sound-browser__status")?.textContent).toContain(
      "0,0",
    );

    player.end();

    expect(rows(root)[0].textContent).toContain("Play");
    expect(rows(root)[0].dataset.playing).toBe("false");
  });

  it("stops the first sample when another is clicked, so only one row is playing", () => {
    const player = fakePlayer();
    const root = mount(character(twoGroups), player);
    expandAll(root);

    rows(root)[0].click();
    rows(root)[2].click();

    expect(player.stop).toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledTimes(2);
    const playing = rows(root).filter((r) => r.dataset.playing === "true");
    expect(playing).toHaveLength(1);
    expect(playing[0].textContent).toContain("5,1");
  });

  it("stops playback when the playing row is clicked again", () => {
    const player = fakePlayer();
    const root = mount(character(twoGroups), player);
    expandAll(root);

    rows(root)[1].click();
    rows(root)[1].click();

    expect(player.stop).toHaveBeenCalled();
    expect(rows(root)[1].dataset.playing).toBe("false");
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("flags an undecodable sample with its reason, keeps it focusable, never plays it, and leaves the others playable", () => {
    const player = fakePlayer();
    const broken = sound(0, 1, { pcm: [], error: "decoding failed: bad wav" });
    const root = mount(
      character([{ index: 0, sounds: [sound(0, 0), broken] }]),
      player,
    );
    expandAll(root);

    const [good, bad] = rows(root);
    expect(bad.textContent).toContain("Can't be played");
    // The raw reason is not the message: it sits behind "Show details".
    expect(bad.textContent).not.toContain("decoding failed: bad wav");
    expect(root.querySelector(".problem__detail")?.textContent).toBe(
      "decoding failed: bad wav",
    );
    expect(root.querySelector<HTMLElement>(".problem__detail")?.hidden).toBe(
      true,
    );
    expect(bad.hasAttribute("disabled")).toBe(false);
    expect(bad.getAttribute("aria-disabled")).toBe("true");

    bad.click();
    expect(player.play).not.toHaveBeenCalled();

    good.click();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("flags a sample with empty audio data or a zero sample rate as undecodable even without an error message", () => {
    const root = mount(
      character([
        {
          index: 0,
          sounds: [sound(0, 0, { pcm: [] }), sound(0, 1, { sampleRate: 0 })],
        },
      ]),
      fakePlayer(),
    );
    expandAll(root);

    for (const row of rows(root)) {
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Can't be played");
    }
  });

  it("flags a sample the browser itself fails to play (e.g. an unsupported sample rate) instead of crashing", () => {
    const player = fakePlayer();
    player.play.mockImplementationOnce(() => {
      throw new Error("unsupported sample rate");
    });
    const root = mount(character(twoGroups), player);
    expandAll(root);

    rows(root)[0].click();

    expect(rows(root)[0].textContent).toContain("Can't be played");
    expect(root.querySelector(".problem__detail")?.textContent).toBe(
      "unsupported sample rate",
    );
    expect(rows(root)[0].getAttribute("aria-disabled")).toBe("true");
    rows(root)[1].click();
    expect(rows(root)[1].dataset.playing).toBe("true");
  });

  it("announces a play row once: the label changes, with no aria-pressed and no live status", () => {
    const player = fakePlayer();
    const root = mount(character(twoGroups), player);
    expandAll(root);

    rows(root)[0].click();

    expect(rows(root)[0].hasAttribute("aria-pressed")).toBe(false);
    expect(root.querySelector("[role=status]")).toBeNull();
    expect(rows(root)[0].textContent).toContain("Stop");
  });

  it("builds group and sound rows from kit list rows, the playing one marked selected", () => {
    const root = mount(character(twoGroups), fakePlayer());
    const groupToggle = root.querySelector(".sound-browser__group-toggle");
    expect(groupToggle?.localName).toBe("wuik-list-row");
    expect(groupToggle?.hasAttribute("expandable")).toBe(true);
    expect(groupToggle?.hasAttribute("expanded")).toBe(false);
    expandAll(root);

    expect(
      root
        .querySelector(".sound-browser__group-toggle")
        ?.hasAttribute("expanded"),
    ).toBe(true);
    expect(rows(root)[0].localName).toBe("wuik-list-row");
    rows(root)[0].click();
    expect(rows(root)[0].hasAttribute("selected")).toBe(true);
    expect(rows(root)[1].hasAttribute("selected")).toBe(false);
  });

  it("puts focus back on a group's toggle after toggling it", () => {
    const root = mount(character(twoGroups), fakePlayer());
    document.body.append(root);
    const focused: string[] = [];
    const spy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function (this: HTMLElement) {
        const host = (this.getRootNode() as ShadowRoot).host ?? this;
        focused.push((host as HTMLElement).dataset.groupIndex ?? "");
      });
    const toggle = root.querySelector<HTMLElement>(
      '.sound-browser__group-toggle[data-group-index="5"]',
    );
    toggle?.setAttribute("tabindex", "0");
    const active = vi
      .spyOn(document, "activeElement", "get")
      .mockReturnValue(toggle ?? null);

    toggle?.click();

    active.mockRestore();
    spy.mockRestore();
    root.remove();
    expect(focused).toEqual(["5"]);
  });

  it("ignores clicks on a disabled row", () => {
    const player = fakePlayer();
    player.play.mockImplementationOnce(() => {
      throw new Error("unsupported sample rate");
    });
    const root = mount(character(twoGroups), player);
    expandAll(root);
    rows(root)[0].click();
    player.play.mockClear();

    rows(root)[0].click();

    expect(rows(root)[0].getAttribute("aria-disabled")).toBe("true");
    expect(player.play).not.toHaveBeenCalled();
  });

  it("shows the 'no sound file' empty state when the character has no sounds and no issue", () => {
    const root = mount(character([]), fakePlayer());

    expect(root.querySelector(".sound-browser__empty")?.textContent).toContain(
      "no sound file",
    );
    expect(root.querySelector(".sound-browser__error")).toBeNull();
  });

  it("treats a character without a sounds field (wizard-created) as the empty state", () => {
    const root = mount(character(undefined), fakePlayer());
    expect(root.querySelector(".sound-browser__empty")).not.toBeNull();
  });

  it("shows the error state with the load issue, distinct from the empty state, when the referenced .snd failed", () => {
    const root = mount(character([]), fakePlayer(), {
      sndIssue: "ryu.snd: file not found in the folder",
    });

    const error = root.querySelector(".sound-browser__error");
    // Plain DOM, announced once elsewhere: no live attribute of its own.
    expect(error?.hasAttribute("role")).toBe(false);
    expect(error?.querySelector(".problem__title")?.textContent).toBe(
      "Couldn't load the sound file",
    );
    expect(error?.querySelector(".problem__title")?.textContent).not.toContain(
      "ryu.snd",
    );
    expect(error?.querySelector(".problem__detail")?.textContent).toBe(
      "ryu.snd: file not found in the folder",
    );
    expect(root.querySelector(".sound-browser__empty")).toBeNull();
  });

  it("stops playback when the panel is torn down by rendering a new character into the same root", () => {
    const player = fakePlayer();
    const root = mount(character(twoGroups), player);
    expandAll(root);
    rows(root)[0].click();

    renderSoundBrowser(root, character([]), {}, { createPlayer: () => player });

    expect(player.stop).toHaveBeenCalled();
    expect(root.querySelector(".sound-browser__sound")).toBeNull();
  });

  describe("localization", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
    });

    it("translates its labels into French and keeps expanded groups and the playing row across the switch", async () => {
      await initAppI18n();
      const player = fakePlayer();
      const root = mount(character(twoGroups), player);
      expandAll(root);
      rows(root)[0].click();

      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector("h2")?.textContent).toContain("Sons");
      expect(rows(root)[0].textContent).toContain("Arrêter");
      expect(rows(root)[0].dataset.playing).toBe("true");
      expect(rows(root)).toHaveLength(3);
    });
  });
});

describe("createWebAudioPlayer", () => {
  function stubAudioContext() {
    const buffers: {
      channels: number;
      frames: number;
      rate: number;
      data: Float32Array;
    }[] = [];
    class FakeAudioContext {
      destination = {};
      createBuffer(channels: number, frames: number, rate: number) {
        const data = new Float32Array(frames);
        buffers.push({ channels, frames, rate, data });
        return { getChannelData: () => data };
      }
      createBufferSource() {
        return {
          connect() {},
          start() {},
          stop() {},
          onended: null as null | (() => void),
        };
      }
      resume() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    return buffers;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("builds the audio again for a replaced sound under the same key, never replaying the old buffer", () => {
    const buffers = stubAudioContext();
    const player = createWebAudioPlayer();
    const original = sound(5, 1, { pcm: [16384, 0] });
    const replaced = sound(5, 1, { pcm: [-16384, 8192], sampleRate: 8000 });

    player.play(original, () => {});
    player.play(original, () => {});
    player.play(replaced, () => {});

    expect(buffers).toHaveLength(2); // the same sound object is built once, the replacement once more
    expect([...buffers[0].data]).toEqual([0.5, 0]);
    expect([...buffers[1].data]).toEqual([-0.5, 0.25]);
    expect(buffers[1].rate).toBe(8000);
  });
});
