/**
 * `@openkakutou/web-ui-kit` ships no type declarations of its own (its
 * components are registered as side-effecting custom-element definitions).
 * This app needs a few typed named imports from it -- the package's own
 * exported `version` string (for the version-guard check), its
 * `CommandStack` undo/redo history primitive (backlog item 010), and its
 * `ShortcutManager` keyboard-shortcut primitive (backlog item 011) -- rather
 * than a side-effect-only import, so this minimal ambient declaration
 * exists here until the package publishes its own types.
 */
declare module "@openkakutou/web-ui-kit" {
  export const version: string;

  /** A do/undo pair pushed onto a {@link CommandStack}. Mirrors the package's own `Command` type. */
  export interface Command {
    do(): void;
    undo(): void;
    coalesceKey?: string;
  }

  export interface CommandStackOptions {
    maxSize?: number;
    coalesceWindowMs?: number;
  }

  /** Mirrors the package's own framework-agnostic undo/redo history class. */
  export class CommandStack {
    constructor(options?: CommandStackOptions);
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    push(command: Command): void;
    undo(): boolean;
    redo(): boolean;
    clear(): void;
  }

  /** Mirrors the package's own headless keyboard-shortcut manager. */
  export interface ShortcutAction {
    id: string;
    label: string;
    defaultKey: string;
  }

  export interface ShortcutBinding {
    id: string;
    label: string;
    key: string;
    isDefault: boolean;
  }

  export type RebindResult =
    | { ok: true }
    | { ok: false; reason: "conflict"; conflictWith: string }
    | { ok: false; reason: "unknown-action" };

  export interface RebindOptions {
    swap?: boolean;
  }

  export interface ShortcutManagerOptions {
    storageKey?: string;
    storage?: Storage;
  }

  export type ShortcutChangeDetail = { id: string; key: string };

  export class ShortcutManager extends EventTarget {
    constructor(options?: ShortcutManagerOptions);
    register(action: ShortcutAction): void;
    list(): ShortcutBinding[];
    getBinding(id: string): string | undefined;
    rebind(id: string, key: string, options?: RebindOptions): RebindResult;
    resetToDefault(id: string): RebindResult;
  }
}

declare module "@openkakutou/web-ui-kit/tokens.css" {
  // Side-effect-only CSS import — no exports.
}
