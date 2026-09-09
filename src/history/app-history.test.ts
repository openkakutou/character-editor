import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAppHistory,
  isDirty,
  markClean,
  pushHistoryCommand,
  resetAppHistoryForTests,
} from "./app-history.ts";

beforeEach(() => {
  resetAppHistoryForTests();
});

describe("getAppHistory", () => {
  it("returns the same shared CommandStack instance across calls", () => {
    expect(getAppHistory()).toBe(getAppHistory());
  });

  it("starts with nothing to undo or redo", () => {
    const history = getAppHistory();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("calling undo/redo when there is nothing recorded is a safe no-op, not an error", () => {
    const history = getAppHistory();
    expect(() => history.undo()).not.toThrow();
    expect(() => history.redo()).not.toThrow();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });
});

describe("pushHistoryCommand", () => {
  it("applies the command immediately and records it on the shared stack", () => {
    const doFn = vi.fn();
    const undoFn = vi.fn();

    pushHistoryCommand({ do: doFn, undo: undoFn });

    expect(doFn).toHaveBeenCalledTimes(1);
    expect(getAppHistory().canUndo).toBe(true);
  });

  it("marks the document dirty", () => {
    expect(isDirty()).toBe(false);

    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });

    expect(isDirty()).toBe(true);
  });
});

describe("isDirty / markClean", () => {
  it("starts clean before any push", () => {
    expect(isDirty()).toBe(false);
  });

  it("becomes clean again after markClean, even with history still on the stack", () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });

    markClean();

    expect(isDirty()).toBe(false);
    // Marking clean is not the same as clearing history — undo is still
    // possible, it just no longer counts as "unsaved" on its own.
    expect(getAppHistory().canUndo).toBe(true);
  });

  it("becomes dirty again if a further edit is pushed after markClean", () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });
    markClean();

    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });

    expect(isDirty()).toBe(true);
  });
});

describe("resetAppHistoryForTests", () => {
  it("clears both history and dirty state", () => {
    pushHistoryCommand({ do: vi.fn(), undo: vi.fn() });

    resetAppHistoryForTests();

    expect(getAppHistory().canUndo).toBe(false);
    expect(isDirty()).toBe(false);
  });
});
