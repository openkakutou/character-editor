// The single source of truth for problems: the sidebar badges, the Output
// section's list and the status announcement all read from here. Problems
// come from independent sources (the document rules, files unreadable at
// load, the last failed export); each replaces only its own share.
import type { SectionId } from "../shell/sections.ts";
import type { ValidationIssue } from "./character-validation.ts";

export interface SectionCounts {
  errors: number;
  warnings: number;
}

export class ValidationStore {
  #bySource = new Map<string, readonly ValidationIssue[]>();
  #listeners = new Set<() => void>();
  #hasRun = false;

  /** False until the first `setIssues` call, so no badge shows before the first validation. */
  get hasRun(): boolean {
    return this.#hasRun;
  }

  get issues(): ValidationIssue[] {
    return [...this.#bySource.values()].flat();
  }

  /** Replaces everything `source` reported. An empty list clears that source. */
  setIssues(source: string, issues: readonly ValidationIssue[]): void {
    this.#hasRun = true;
    this.#bySource.set(source, issues);
    this.#notify();
  }

  /** Forgets every source and returns to "never validated". */
  reset(): void {
    this.#bySource.clear();
    this.#hasRun = false;
    this.#notify();
  }

  countsFor(section: SectionId): SectionCounts {
    const counts = { errors: 0, warnings: 0 };
    for (const issue of this.issues) {
      if (issue.section !== section) continue;
      if (issue.severity === "error") counts.errors += 1;
      else counts.warnings += 1;
    }
    return counts;
  }

  totals(): SectionCounts {
    const counts = { errors: 0, warnings: 0 };
    for (const issue of this.issues) {
      if (issue.severity === "error") counts.errors += 1;
      else counts.warnings += 1;
    }
    return counts;
  }

  /** Calls `listener` after every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

let store = new ValidationStore();

/** The app-wide store. */
export function getValidationStore(): ValidationStore {
  return store;
}

/** Replaces the app-wide store with a fresh one. Test-only. */
export function resetValidationStoreForTests(): void {
  store = new ValidationStore();
}
