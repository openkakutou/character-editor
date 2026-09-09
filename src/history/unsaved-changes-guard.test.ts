import { describe, expect, it, vi } from "vitest";
import type {
  UnloadEventLike,
  UnloadEventTarget,
} from "./unsaved-changes-guard.ts";
import {
  handleBeforeUnload,
  installUnsavedChangesGuard,
} from "./unsaved-changes-guard.ts";

function fakeEvent(): UnloadEventLike {
  return { preventDefault: vi.fn(), returnValue: "" };
}

describe("handleBeforeUnload", () => {
  it("prevents the default and sets returnValue when there are unsaved changes", () => {
    const event = fakeEvent();

    handleBeforeUnload(event, () => true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe("");
  });

  it("does nothing when there are no unsaved changes", () => {
    const event = fakeEvent();

    handleBeforeUnload(event, () => false);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("propagates an error from the dirty check rather than silently swallowing it", () => {
    const event = fakeEvent();

    expect(() =>
      handleBeforeUnload(event, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });
});

describe("installUnsavedChangesGuard", () => {
  it("registers a beforeunload listener on the given target that reflects isDirty", () => {
    const listeners: Array<(event: UnloadEventLike) => void> = [];
    const target: UnloadEventTarget = {
      addEventListener: (_type, listener) => {
        listeners.push(listener);
      },
    };

    installUnsavedChangesGuard(target, () => true);

    expect(listeners).toHaveLength(1);
    const event = fakeEvent();
    listeners[0](event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not prevent unload when isDirty reports clean", () => {
    const listeners: Array<(event: UnloadEventLike) => void> = [];
    const target: UnloadEventTarget = {
      addEventListener: (_type, listener) => {
        listeners.push(listener);
      },
    };

    installUnsavedChangesGuard(target, () => false);

    const event = fakeEvent();
    listeners[0](event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
