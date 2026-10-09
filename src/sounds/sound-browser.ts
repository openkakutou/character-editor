// The sound browser (backlog item 017): lists every sound of the loaded
// character's `.snd`, grouped the way the sprite browser groups sprites, and
// plays one on demand through the Web Audio API. Browse and preview only --
// no editing. A sound that failed to decode stays in the list, flagged with
// its reason; a `.snd` that could not be loaded at all shows an error state,
// distinct from the empty state of a character that has no sound file.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { createProblemView } from "../problems/problem-view.ts";
import type { CharacterData, Sound } from "../wasm/types.ts";

/** Plays one sound at a time. Injectable: jsdom has no Web Audio. */
export interface SoundPlayer {
  /** Starts `sound`; calls `onEnded` once it finishes by itself. Throws if it cannot be played. */
  play(sound: Sound, onEnded: () => void): void;
  /** Stops whatever is playing, without calling its `onEnded`. */
  stop(): void;
}

export interface SoundBrowserOptions {
  /** Defaults to the real Web Audio player; tests inject a fake. */
  createPlayer?: () => SoundPlayer;
}

/** The part of the loaded files this screen needs. */
export interface SoundBrowserFiles {
  /** Why the sounds are unavailable although the `.def` references a `.snd`. */
  sndIssue?: string;
}

type SoundKey = string;

function keyOf(sound: Sound): SoundKey {
  return `${sound.group},${sound.sample}`;
}

/** The reason a sound cannot be played, or `undefined` when it can. */
function undecodableReason(sound: Sound): string | undefined {
  if (sound.error) return sound.error;
  if (sound.pcm.length === 0 || sound.sampleRate <= 0 || sound.channels <= 0) {
    return t("sounds.noAudioData", "no audio data");
  }
  return undefined;
}

/**
 * The real player: one lazily created `AudioContext` (browsers only allow it
 * to start from a user gesture, and `play` is only ever called from a click),
 * one `AudioBuffer` built on a sound's first play.
 */
export function createWebAudioPlayer(): SoundPlayer {
  let context: AudioContext | undefined;
  let current: AudioBufferSourceNode | undefined;
  const buffers = new Map<SoundKey, AudioBuffer>();

  function bufferFor(ctx: AudioContext, sound: Sound): AudioBuffer {
    const key = keyOf(sound);
    const cached = buffers.get(key);
    if (cached) return cached;
    const frames = Math.floor(sound.pcm.length / sound.channels);
    const buffer = ctx.createBuffer(sound.channels, frames, sound.sampleRate);
    for (let channel = 0; channel < sound.channels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < frames; i++) {
        data[i] = sound.pcm[i * sound.channels + channel] / 32768;
      }
    }
    buffers.set(key, buffer);
    return buffer;
  }

  function stop(): void {
    if (!current) return;
    current.onended = null;
    current.stop();
    current = undefined;
  }

  return {
    play(sound, onEnded) {
      stop();
      context ??= new AudioContext();
      const source = context.createBufferSource();
      source.buffer = bufferFor(context, sound);
      source.connect(context.destination);
      source.onended = () => {
        current = undefined;
        onEnded();
      };
      current = source;
      void context.resume();
      source.start();
    },
    stop,
  };
}

// `main.ts` can render this screen again into the same root (a new character
// replacing the loaded one): the previous render's playback and locale
// subscription are torn down first, never left running against stale content.
const teardownByRoot = new WeakMap<HTMLElement, () => void>();

export function renderSoundBrowser(
  root: HTMLElement,
  character: CharacterData | null,
  files: SoundBrowserFiles,
  options: SoundBrowserOptions = {},
): void {
  teardownByRoot.get(root)?.();

  const player = (options.createPlayer ?? createWebAudioPlayer)();
  const groups = character?.sounds ?? [];
  const expandedGroups = new Set<number>();
  /** Sounds the browser itself failed to play (e.g. unsupported sample rate). */
  const playbackErrors = new Map<SoundKey, string>();
  let playing: SoundKey | null = null;

  const panel = document.createElement("wuik-panel");
  panel.className = "sound-browser";
  const heading = document.createElement("h3");
  const status = document.createElement("p");
  status.className = "sound-browser__status";
  status.setAttribute("role", "status");
  const body = document.createElement("div");
  panel.append(heading, status, body);
  root.replaceChildren(panel);

  function totalCount(): number {
    return groups.reduce((sum, group) => sum + group.sounds.length, 0);
  }

  function stopPlayback(): void {
    player.stop();
    playing = null;
  }

  function toggle(sound: Sound): void {
    const key = keyOf(sound);
    if (playing === key) {
      stopPlayback();
      render();
      return;
    }
    if (undecodableReason(sound) !== undefined || playbackErrors.has(key)) {
      return;
    }
    stopPlayback();
    try {
      player.play(sound, () => {
        if (playing === key) playing = null;
        render();
      });
      playing = key;
    } catch (err) {
      playbackErrors.set(key, err instanceof Error ? err.message : String(err));
    }
    render();
  }

  /** A sound's row, followed by its raw reason behind "Show details" when it cannot be played. */
  function renderRowWithDetails(sound: Sound): HTMLElement[] {
    const row = renderRow(sound);
    const reason = undecodableReason(sound) ?? playbackErrors.get(keyOf(sound));
    if (reason === undefined) return [row];
    const details = createProblemView(
      { code: "unknown", params: {}, detail: reason },
      { detailsOnly: true },
    );
    return [row, details.element];
  }

  function renderRow(sound: Sound): HTMLButtonElement {
    const key = keyOf(sound);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "sound-browser__sound";
    const reason = undecodableReason(sound) ?? playbackErrors.get(key);
    if (reason !== undefined) {
      row.setAttribute("aria-disabled", "true");
      row.textContent = t(
        "sounds.rowUndecodable",
        "{{key}} — Cannot be decoded",
        { key },
      );
    } else {
      const isPlaying = playing === key;
      row.setAttribute("aria-pressed", String(isPlaying));
      row.textContent = isPlaying
        ? t("sounds.rowStop", "{{key}} — Stop", { key })
        : t("sounds.rowPlay", "{{key}} — Play", { key });
    }
    row.addEventListener("click", () => toggle(sound));
    return row;
  }

  function renderGroups(): HTMLElement {
    const list = document.createElement("div");
    list.className = "sound-browser__list";
    for (const group of groups) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "sound-browser__group-toggle";
      const expanded = expandedGroups.has(group.index);
      toggleButton.setAttribute("aria-expanded", String(expanded));
      toggleButton.textContent = t(
        "sounds.groupToggle",
        "Group {{index}} ({{count}})",
        {
          index: String(group.index),
          count: String(group.sounds.length),
        },
      );
      toggleButton.addEventListener("click", () => {
        if (expandedGroups.has(group.index)) expandedGroups.delete(group.index);
        else expandedGroups.add(group.index);
        render();
      });
      list.appendChild(toggleButton);
      if (expanded) {
        for (const sound of group.sounds)
          list.append(...renderRowWithDetails(sound));
      }
    }
    return list;
  }

  function render(): void {
    heading.textContent = t("sounds.browserHeading", "Sounds ({{count}})", {
      count: String(totalCount()),
    });
    status.textContent =
      playing === null
        ? ""
        : t("sounds.nowPlaying", "Playing {{key}}", { key: playing });

    body.replaceChildren();
    if (files.sndIssue) {
      const error = document.createElement("div");
      error.className = "sound-browser__error";
      const message = document.createElement("p");
      message.textContent = t(
        "sounds.loadFailed",
        "The sound file could not be loaded. Fix the file and load the character folder again.",
      );
      const details = createProblemView(
        { code: "unknown", params: {}, detail: files.sndIssue },
        { detailsOnly: true },
      );
      error.append(message, details.element);
      body.appendChild(error);
    } else if (groups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sound-browser__empty";
      empty.textContent = t(
        "sounds.empty",
        'This character has no sound file. A .def file can reference one with a "sound =" line in its [Files] section.',
      );
      body.appendChild(empty);
    } else {
      body.appendChild(renderGroups());
    }
  }

  render();

  const unsubscribe = onLocaleChange(render);
  teardownByRoot.set(root, () => {
    stopPlayback();
    unsubscribe();
  });
}
