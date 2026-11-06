import { onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
// The sound browser (backlog items 017 and 023): lists every sound of the
// loaded character's `.snd`, grouped the way the sprite browser groups
// sprites, plays one on demand through the Web Audio API, and -- when the
// caller supplies `editing` -- imports a WAV as a new sound, replaces the
// selected sound's audio or deletes it (warning how many controllers use it).
// A sound that failed to decode stays in the list, flagged with its reason; a
// `.snd` that could not be loaded at all shows an error state, distinct from
// the empty state of a character that has no sound file.
import { readFileAsBytes } from "../input/character-file-input.ts";
import {
  type ProblemSink,
  createInlineError,
} from "../problems/inline-error.ts";
import { createProblemView } from "../problems/problem-view.ts";
import { type FilePicker, createFilePicker } from "../ui/file-picker.ts";
import { createListRow, focusKitControl } from "../ui/list-row.ts";
import type { CharacterData, Sound } from "../wasm/types.ts";
import type {
  PrepareSoundEditResult,
  SoundEditRequest,
} from "./sound-editing.ts";
import {
  type SoundEdit,
  type SoundReferences,
  mergeSoundGroups,
  nextFreeSample,
  soundKey,
} from "./sound-edits.ts";

/** Plays one sound at a time. Injectable: jsdom has no Web Audio. */
export interface SoundPlayer {
  /** Starts `sound`; calls `onEnded` once it finishes by itself. Throws if it cannot be played. */
  play(sound: Sound, onEnded: () => void): void;
  /** Stops whatever is playing, without calling its `onEnded`. */
  stop(): void;
}

/** The one description of what the import and replace pickers accept: both end in the same `snd` validation. */
const WAV_PICKER = {
  accept: ".wav,audio/wav,audio/x-wav",
  typeKey: "sounds.wavType",
  typeDefault: "A WAV file (8 or 16-bit PCM)",
} as const;

/** What the browser needs from its caller to edit sounds; absent means browse and preview only. */
export interface SoundBrowserEditing {
  /** The pending edits, read fresh on every render. */
  edits(): readonly SoundEdit[];
  /** Checks a request against the `.snd` as it stands and returns the edit to record, or why not. */
  prepare(request: SoundEditRequest): Promise<PrepareSoundEditResult>;
  /**
   * Records a prepared edit (one undo step). Returns false, recording
   * nothing, when the sounds changed since the edit was prepared (another
   * edit, an Undo): the edit was checked against a file that no longer is.
   */
  commit(edit: SoundEdit): boolean;
  /** How many controllers use the sound (exactly, and possibly through an expression). */
  references(group: number, sample: number): SoundReferences;
}

export interface SoundBrowserOptions {
  /** Defaults to the real Web Audio player; tests inject a fake. */
  createPlayer?: () => SoundPlayer;
  editing?: SoundBrowserEditing;
  /** Where import and replace failures are reported, so the sidebar badge counts them. */
  problems?: ProblemSink;
}

/** The part of the loaded files this screen needs. */
export interface SoundBrowserFiles {
  /** Why the sounds are unavailable although the `.def` references a `.snd`. */
  sndIssue?: string;
}

type SoundKey = string;

function keyOf(sound: Sound): SoundKey {
  return soundKey(sound);
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
  // Keyed by the sound itself, not by (group, sample): a replaced sound is a
  // new object under the same key and must not play its old audio.
  const buffers = new WeakMap<Sound, AudioBuffer>();

  function bufferFor(ctx: AudioContext, sound: Sound): AudioBuffer {
    const cached = buffers.get(sound);
    if (cached) return cached;
    const frames = Math.floor(sound.pcm.length / sound.channels);
    const buffer = ctx.createBuffer(sound.channels, frames, sound.sampleRate);
    for (let channel = 0; channel < sound.channels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < frames; i++) {
        data[i] = sound.pcm[i * sound.channels + channel] / 32768;
      }
    }
    buffers.set(sound, buffer);
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
// replacing the loaded one, or an Undo/Redo changing the sound edits): the
// previous render's playback and locale subscription are torn down first,
// never left running against stale content. What the user was looking at --
// the open groups and the selected sound -- lives per root so it survives.
const teardownByRoot = new WeakMap<HTMLElement, () => void>();

interface BrowserUiState {
  expandedGroups: Set<number>;
  selected: SoundKey | null;
}
const uiStateByRoot = new WeakMap<HTMLElement, BrowserUiState>();

export function renderSoundBrowser(
  root: HTMLElement,
  character: CharacterData | null,
  files: SoundBrowserFiles,
  options: SoundBrowserOptions = {},
): void {
  teardownByRoot.get(root)?.();

  const player = (options.createPlayer ?? createWebAudioPlayer)();
  const editing = files.sndIssue ? undefined : options.editing;
  const baseGroups = character?.sounds ?? [];
  const uiState = uiStateByRoot.get(root) ?? {
    expandedGroups: new Set<number>(),
    selected: null,
  };
  uiStateByRoot.set(root, uiState);
  const { expandedGroups } = uiState;
  /** Sounds the browser itself failed to play (e.g. unsupported sample rate). */
  // Keyed by the sound object: a replaced or re-imported sound under the same
  // key is a new object and must not inherit the old one's failure.
  const playbackErrors = new WeakMap<Sound, string>();
  let playing: SoundKey | null = null;
  let busy = false;
  let confirmingDelete = false;
  /** Set when a newer render replaced this one: a request still in flight must not commit or draw. */
  let disposed = false;
  /** Said in the status line until the next action: an edit that could not be recorded. */
  let notice = "";

  const panel = document.createElement("div");
  panel.className = "sound-browser";
  const heading = document.createElement("h2");
  heading.className = "editor-title";
  const status = document.createElement("p");
  status.className = "sound-browser__status";
  const body = document.createElement("div");
  const importSection = editing ? createImportSection() : undefined;
  const selectedPanel = document.createElement("div");
  selectedPanel.className = "sound-browser__selected";
  panel.append(heading, status);
  if (importSection) panel.append(importSection.element, selectedPanel);
  panel.append(body);
  root.replaceChildren(panel);

  function groups() {
    return editing ? mergeSoundGroups(baseGroups, editing.edits()) : baseGroups;
  }

  function totalCount(): number {
    return groups().reduce((sum, group) => sum + group.sounds.length, 0);
  }

  function findSound(key: SoundKey | null): Sound | undefined {
    if (key === null) return undefined;
    for (const group of groups()) {
      const found = group.sounds.find((sound) => keyOf(sound) === key);
      if (found) return found;
    }
    return undefined;
  }

  function stopPlayback(): void {
    player.stop();
    playing = null;
  }

  function toggle(sound: Sound): void {
    notice = "";
    const key = keyOf(sound);
    if (uiState.selected !== key) {
      uiState.selected = key;
      confirmingDelete = false;
    }
    if (playing === key) {
      stopPlayback();
      render();
      return;
    }
    if (undecodableReason(sound) !== undefined || playbackErrors.has(sound)) {
      render();
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
      playbackErrors.set(
        sound,
        err instanceof Error ? err.message : String(err),
      );
    }
    render();
  }

  /** A sound's row, followed by its raw reason behind "Show details" when it cannot be played. */
  function renderRowWithDetails(sound: Sound): HTMLElement[] {
    const row = renderRow(sound);
    const reason = undecodableReason(sound) ?? playbackErrors.get(sound);
    if (reason === undefined) return [row];
    const details = createProblemView(
      { code: "unknown", params: {}, detail: reason },
      { detailsOnly: true },
    );
    return [row, details.element];
  }

  function renderRow(sound: Sound): HTMLElement {
    const key = keyOf(sound);
    const reason = undecodableReason(sound) ?? playbackErrors.get(sound);
    const isPlaying = reason === undefined && playing === key;
    const row = createListRow({
      className: "sound-browser__sound",
      unavailable: reason !== undefined,
      selected: isPlaying,
      text:
        reason !== undefined
          ? t("sounds.rowUndecodable", "{{key}} — Can't be played", { key })
          : isPlaying
            ? t("sounds.rowStop", "{{key}} — Stop", { key })
            : t("sounds.rowPlay", "{{key}} — Play", { key }),
    });
    row.dataset.key = key;
    if (reason === undefined) row.dataset.playing = String(isPlaying);
    row.addEventListener("click", () => {
      if (row.getAttribute("aria-disabled") === "true") {
        // Not playable, but still selectable: it can be replaced or deleted.
        uiState.selected = key;
        confirmingDelete = false;
        render();
        return;
      }
      toggle(sound);
    });
    return row;
  }

  function renderGroups(): HTMLElement {
    const list = document.createElement("div");
    list.className = "sound-browser__list";
    for (const group of groups()) {
      const expanded = expandedGroups.has(group.index);
      const toggleButton = createListRow({
        className: "sound-browser__group-toggle",
        expandable: true,
        expanded,
        text: t("sounds.groupToggle", "Group {{index}} ({{count}})", {
          index: String(group.index),
          count: String(group.sounds.length),
        }),
      });
      toggleButton.dataset.groupIndex = String(group.index);
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

  // ---- editing (item 023) ----------------------------------------------

  function createImportSection() {
    const element = document.createElement("div");
    element.className = "sound-browser__import";

    const groupLabel = document.createElement("label");
    const groupLabelText = document.createTextNode("");
    const groupInput = document.createElement("input");
    groupInput.type = "number";
    groupInput.min = "0";
    groupInput.step = "1";
    groupInput.className = "sound-browser__import-group field-number";
    groupLabel.append(groupLabelText, groupInput);

    const sampleLabel = document.createElement("label");
    const sampleLabelText = document.createTextNode("");
    const sampleInput = document.createElement("input");
    sampleInput.type = "number";
    sampleInput.min = "0";
    sampleInput.step = "1";
    sampleInput.className = "sound-browser__import-sample field-number";
    sampleLabel.append(sampleLabelText, sampleInput);

    const picker = createFilePicker({
      ...WAV_PICKER,
      inputClassName: "sound-browser__import-file",
      buttonKey: "sounds.chooseWav",
      buttonDefault: "Choose a WAV file",
    });

    const submit = document.createElement("wuik-button");
    submit.setAttribute("variant", "secondary");
    submit.className = "sound-browser__import-submit";

    const hint = document.createElement("p");
    hint.className = "sound-browser__import-error";
    hint.setAttribute("role", "status");
    hint.hidden = true;

    const failure = createInlineError({
      section: "sounds",
      key: "import",
      sink: options.problems,
      onDismiss: () => picker.focus(),
    });

    groupInput.addEventListener("input", () => {
      groupInput.dataset.touched = "true";
      if (sampleInput.dataset.touched !== "true") syncSampleDefault();
    });
    sampleInput.addEventListener("input", () => {
      sampleInput.dataset.touched = "true";
    });
    submit.addEventListener("click", () => {
      if (busy) return;
      void handleImport();
    });

    function retranslate(): void {
      groupLabelText.textContent = t("sounds.groupLabel", "Group");
      sampleLabelText.textContent = t("sounds.sampleLabel", "Number");
      submit.textContent = busy
        ? t("sounds.importing", "Importing…")
        : t("sounds.importSound", "Import sound");
    }

    /** The sample field follows the first free number of the chosen group until the user types one. */
    function syncSampleDefault(): void {
      if (sampleInput.dataset.touched === "true") return;
      const group = Number.parseInt(groupInput.value, 10);
      if (Number.isInteger(group) && group >= 0) {
        sampleInput.value = String(nextFreeSample(groups(), group));
      }
    }

    /** Called on every render: the group defaults to the selected sound's group, then the first group. */
    function syncDefaults(): void {
      if (groupInput.dataset.touched !== "true") {
        const selected = findSound(uiState.selected);
        groupInput.value = String(selected?.group ?? groups()[0]?.index ?? 0);
      }
      syncSampleDefault();
    }

    function showHint(message: string): void {
      failure.clear();
      hint.hidden = false;
      hint.textContent = message;
    }

    async function handleImport(): Promise<void> {
      if (!editing) return;
      const file = picker.input.files?.[0];
      if (!file) {
        showHint(
          t("sounds.noFileChosen", "Choose a WAV file to import first."),
        );
        picker.focus();
        return;
      }
      const group = Number.parseInt(groupInput.value, 10);
      const sample = Number.parseInt(sampleInput.value, 10);
      if (!Number.isInteger(group) || group < 0) {
        showHint(
          t("sounds.invalidGroup", "Enter a valid, non-negative group number."),
        );
        return;
      }
      if (!Number.isInteger(sample) || sample < 0) {
        showHint(
          t(
            "sounds.invalidSample",
            "Enter a valid, non-negative sound number.",
          ),
        );
        return;
      }

      setBusy(true);
      let result: PrepareSoundEditResult;
      try {
        const wav = await readFileAsBytes(file);
        result = await editing.prepare({ kind: "add", group, sample, wav });
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        setBusy(false);
      }
      if (disposed) return;
      if (!result.ok) {
        hint.hidden = true;
        failure.show({
          code: "import.sound",
          params: {},
          detail: result.error,
        });
        picker.input.setAttribute("aria-describedby", failure.element.id);
        return;
      }
      failure.clear();
      hint.hidden = true;
      picker.input.removeAttribute("aria-describedby");
      if (!editing.commit(result.edit)) {
        notice = t(
          "sounds.changedMeanwhile",
          "The sounds changed while this was being checked. Try again.",
        );
        render();
        return;
      }
      notice = "";
      picker.input.value = "";
      picker.refresh();
      sampleInput.dataset.touched = "false";
      uiState.selected = soundKey({ group, sample });
      expandedGroups.add(group);
      confirmingDelete = false;
      render();
    }

    element.append(
      groupLabel,
      sampleLabel,
      picker.element,
      submit,
      hint,
      failure.element,
    );
    retranslate();
    return { element, retranslate, syncDefaults };
  }

  function setBusy(value: boolean): void {
    busy = value;
    const submit = panel.querySelector(".sound-browser__import-submit");
    if (value) submit?.setAttribute("aria-disabled", "true");
    else submit?.removeAttribute("aria-disabled");
    importSection?.retranslate();
  }

  /** The actions on the selected sound: replace its audio, or delete it after a confirm. */
  function renderSelectedPanel(): void {
    selectedPanel.replaceChildren();
    const sound = findSound(uiState.selected);
    if (!editing || !sound) return;
    const key = keyOf(sound);

    const label = document.createElement("p");
    label.className = "sound-browser__selected-label";
    label.textContent = t("sounds.selected", "Selected: {{key}}", { key });
    selectedPanel.appendChild(label);

    if (confirmingDelete) {
      renderDeleteConfirm(sound);
      return;
    }

    const replacePicker = createFilePicker({
      ...WAV_PICKER,
      inputClassName: "sound-browser__replace-file",
      buttonKey: "sounds.replace",
      buttonDefault: "Replace audio",
    });
    const failure = createInlineError({
      section: "sounds",
      key: "replace",
      sink: options.problems,
      onDismiss: () => replacePicker.focus(),
    });
    failure.element.classList.add("sound-browser__replace-error");
    replacePicker.input.addEventListener("change", () => {
      void handleReplace(sound, replacePicker, failure);
    });

    const deleteButton = document.createElement("wuik-button");
    deleteButton.setAttribute("variant", "secondary");
    deleteButton.textContent = t("sounds.delete", "Delete");
    deleteButton.className = "sound-browser__delete";
    deleteButton.addEventListener("click", () => {
      confirmingDelete = true;
      renderSelectedPanel();
    });

    selectedPanel.append(replacePicker.element, failure.element, deleteButton);
  }

  async function handleReplace(
    sound: Sound,
    picker: FilePicker,
    failure: ReturnType<typeof createInlineError>,
  ): Promise<void> {
    if (!editing || busy) return;
    const file = picker.input.files?.[0];
    if (!file) return;
    busy = true;
    let result: PrepareSoundEditResult;
    try {
      const wav = await readFileAsBytes(file);
      result = await editing.prepare({
        kind: "replace",
        group: sound.group,
        sample: sound.sample,
        wav,
      });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      busy = false;
    }
    if (disposed) return;
    if (!result.ok) {
      failure.show({ code: "import.sound", params: {}, detail: result.error });
      picker.input.setAttribute("aria-describedby", failure.element.id);
      return;
    }
    failure.clear();
    picker.input.removeAttribute("aria-describedby");
    if (playing === keyOf(sound)) stopPlayback();
    if (!editing.commit(result.edit)) {
      notice = t(
        "sounds.changedMeanwhile",
        "The sounds changed while this was being checked. Try again.",
      );
      render();
      return;
    }
    notice = "";
    render();
  }

  async function handleDelete(sound: Sound): Promise<void> {
    if (!editing || busy) return;
    // A replace or import still being checked would be recorded after this
    // delete, on a sound that no longer exists: busy refuses both ways.
    busy = true;
    let result: PrepareSoundEditResult;
    try {
      result = await editing.prepare({
        kind: "delete",
        group: sound.group,
        sample: sound.sample,
      });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      busy = false;
    }
    if (disposed) return;
    if (!result.ok) {
      notice = result.error;
      confirmingDelete = false;
      render();
      return;
    }
    if (playing === keyOf(sound)) stopPlayback();
    if (!editing.commit(result.edit)) {
      notice = t(
        "sounds.changedMeanwhile",
        "The sounds changed while this was being checked. Try again.",
      );
      confirmingDelete = false;
      render();
      return;
    }
    notice = "";
    uiState.selected = null;
    confirmingDelete = false;
    render();
  }

  function renderDeleteConfirm(sound: Sound): void {
    if (!editing) return;
    const { exact, unresolved } = editing.references(sound.group, sound.sample);

    const warning = document.createElement("p");
    warning.className = "sound-browser__delete-warning";
    warning.setAttribute("role", "status");
    const parts = [
      exact > 0
        ? tCount("sounds.referencedByControllers", exact, {
            one: "Used by {{count}} controller.",
            other: "Used by {{count}} controllers.",
          })
        : t("sounds.notReferenced", "Not used by any controller."),
    ];
    if (unresolved > 0) {
      parts.push(
        tCount("sounds.unresolvedControllers", unresolved, {
          one: "{{count}} other controller picks its sound with an expression and may play it.",
          other:
            "{{count}} other controllers pick their sound with an expression and may play it.",
        }),
      );
    }
    warning.textContent = parts.join(" ");

    const confirm = document.createElement("wuik-button");
    confirm.setAttribute("variant", "danger");
    confirm.className = "sound-browser__delete-confirm";
    confirm.textContent =
      exact > 0
        ? tCount("sounds.confirmDeleteWithCount", exact, {
            one: "Confirm delete (used by {{count}} controller)",
            other: "Confirm delete (used by {{count}} controllers)",
          })
        : t("sounds.confirmDelete", "Confirm delete");
    confirm.addEventListener("click", () => {
      void handleDelete(sound);
    });

    const cancel = document.createElement("wuik-button");
    cancel.setAttribute("variant", "secondary");
    cancel.className = "sound-browser__delete-cancel";
    cancel.textContent = t("sounds.cancel", "Cancel");
    cancel.addEventListener("click", () => {
      confirmingDelete = false;
      renderSelectedPanel();
    });

    selectedPanel.append(warning, confirm, cancel);
  }

  // ---- rendering ---------------------------------------------------------

  function render(): void {
    // Rebuilding the list would drop the focused row or group: put focus back.
    const focused = (document.activeElement as HTMLElement | null)?.dataset;
    const selector =
      focused?.key !== undefined
        ? `.sound-browser__sound[data-key="${focused.key}"]`
        : focused?.groupIndex !== undefined
          ? `.sound-browser__group-toggle[data-group-index="${focused.groupIndex}"]`
          : undefined;
    renderContent();
    const target =
      selector === undefined
        ? null
        : panel.querySelector<HTMLElement>(selector);
    if (target) focusKitControl(target);
  }

  function renderContent(): void {
    heading.textContent = t("sounds.browserHeading", "Sounds ({{count}})", {
      count: String(totalCount()),
    });
    status.textContent =
      notice !== ""
        ? notice
        : playing === null
          ? ""
          : t("sounds.nowPlaying", "Playing {{key}}", { key: playing });

    // A selection whose sound is gone (deleted, or an Undo removed it).
    if (findSound(uiState.selected) === undefined) {
      uiState.selected = null;
      confirmingDelete = false;
    }
    importSection?.syncDefaults();
    renderSelectedPanel();

    body.replaceChildren();
    if (files.sndIssue) {
      const error = document.createElement("div");
      error.className = "sound-browser__error";
      const problem = createProblemView({
        code: "load.soundFile",
        params: {},
        detail: files.sndIssue,
      });
      error.append(problem.element);
      body.appendChild(error);
    } else if (groups().length === 0) {
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

  const unsubscribe = onLocaleChange(() => {
    importSection?.retranslate();
    render();
  });
  teardownByRoot.set(root, () => {
    disposed = true;
    stopPlayback();
    unsubscribe();
  });
}
