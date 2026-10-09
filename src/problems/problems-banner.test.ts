import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnreadableFile } from "../input/character-file-input.ts";
import {
  type BannerState,
  type ProblemsBanner,
  createProblemsBanner,
} from "./problems-banner.ts";

const sff: UnreadableFile = {
  kind: "sff",
  fileName: "kfm.sff",
  detail: "NotReadableError",
};
const snd: UnreadableFile = {
  kind: "snd",
  fileName: "kfm.snd",
  detail: "NotReadableError",
};

let host: HTMLElement;
let banner: ProblemsBanner;
const onReplace = vi.fn();
const onRetryEngine = vi.fn();

function files(...list: UnreadableFile[]): BannerState {
  return { files: list.map((file) => ({ file, busy: false })) };
}

function action(name: string, scope: ParentNode = host): HTMLElement {
  return scope.querySelector(`[data-action="${name}"]`) as HTMLElement;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  banner = createProblemsBanner(host, { onReplace, onRetryEngine });
});

afterEach(() => {
  banner.destroy();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("problems banner", () => {
  it("is absent from the page while there is nothing to report", () => {
    banner.setState({ files: [] });
    expect(host.childElementCount).toBe(0);
  });

  it("names the count in a labelled region and lists each file with its cause and a Replace button", () => {
    banner.setState(files(sff, snd));
    const region = host.querySelector("section") as HTMLElement;
    const title = host.querySelector("h2") as HTMLElement;
    expect(region.getAttribute("aria-labelledby")).toBe(title.id);
    expect(title.textContent).toBe("2 files could not be read");
    const rows = host.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Couldn't read kfm.sff");
    expect(rows[0].textContent).toContain("The file may be damaged.");
    expect(action("replace-file", rows[0]).textContent).toBe("Replace file");
    expect(host.textContent).toContain(
      "These files are left out of the export until you replace them.",
    );
  });

  it("uses the singular for one file", () => {
    banner.setState(files(sff));
    expect(host.querySelector("h2")?.textContent).toBe(
      "1 file could not be read",
    );
  });

  it("carries no live attribute: appearance is announced by the shell", () => {
    banner.setState(files(sff));
    expect(host.querySelector("[aria-live], [role=alert], [role=status]")).toBe(
      null,
    );
  });

  it("asks to replace the right file", () => {
    banner.setState(files(sff, snd));
    action("replace-file", host.querySelectorAll("li")[1]).click();
    expect(onReplace).toHaveBeenCalledWith(snd);
  });

  it("shows a busy row as Replacing… and ignores a second click, keeping it focusable", () => {
    banner.setState({ files: [{ file: sff, busy: true }] });
    const button = action("replace-file");
    expect(button.textContent).toBe("Replacing…");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    button.click();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("shows the new cause on the row when a replacement failed, and keeps the other rows", () => {
    banner.setState({
      files: [
        {
          file: sff,
          busy: false,
          failure: {
            code: "format.unsupportedVersion",
            params: { fileName: "new.sff", version: "3.0" },
          },
        },
        { file: snd, busy: false },
      ],
    });
    const rows = host.querySelectorAll("li");
    expect(rows[0].textContent).toContain("new.sff uses version 3.0");
    expect(rows[1].textContent).toContain("Couldn't read kfm.snd");
  });

  it("collapses and expands without dismissing: heading and count stay", () => {
    banner.setState(files(sff));
    const toggle = action("toggle-banner");
    expect(toggle.textContent).toBe("Collapse");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    const body = host.querySelector<HTMLElement>(".problems-banner__body");
    expect(body?.hidden).toBe(true);
    expect(host.querySelector("h2")?.textContent).toBe(
      "1 file could not be read",
    );
    expect(action("toggle-banner").textContent).toBe("Expand");
    action("toggle-banner").click();
    expect(
      host.querySelector<HTMLElement>(".problems-banner__body")?.hidden,
    ).toBe(false);
  });

  it("keeps the collapsed state when the list changes", () => {
    banner.setState(files(sff, snd));
    action("toggle-banner").click();
    banner.setState(files(snd));
    expect(
      host.querySelector<HTMLElement>(".problems-banner__body")?.hidden,
    ).toBe(true);
  });

  it("disappears when the last problem is fixed", () => {
    banner.setState(files(sff));
    banner.setState({ files: [] });
    expect(host.childElementCount).toBe(0);
  });

  it("shows the engine first, with one sentence, Retry and its details", () => {
    banner.setState({
      files: [{ file: sff, busy: false }],
      engine: {
        problem: {
          code: "engine.loadFailed",
          params: {},
          detail: "Failed to fetch",
        },
        busy: false,
      },
    });
    expect(host.querySelector("h2")?.textContent).toBe(
      "The editor engine didn't load",
    );
    const sections = [
      ...(host.querySelector(".problems-banner__body")?.children ?? []),
    ];
    expect(sections[0].classList.contains("problems-banner__engine")).toBe(
      true,
    );
    expect(sections[0].textContent).toContain("Check your connection");
    expect(host.querySelector("h3")?.textContent).toBe(
      "1 file could not be read",
    );
    action("retry-engine").click();
    expect(onRetryEngine).toHaveBeenCalledTimes(1);
  });

  it("makes engine Retry idempotent while busy and labels it Retrying…", () => {
    banner.setState({
      files: [],
      engine: {
        problem: { code: "engine.loadFailed", params: {} },
        busy: true,
      },
    });
    const retry = action("retry-engine");
    expect(retry.textContent).toBe("Retrying…");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    retry.click();
    retry.click();
    retry.click();
    expect(onRetryEngine).not.toHaveBeenCalled();
  });

  it("keeps a row's open details across an update", () => {
    banner.setState(files(sff, snd));
    action("toggle-details", host.querySelectorAll("li")[0]).click();
    banner.setState(files(sff));
    expect(host.querySelector<HTMLElement>(".problem__detail")?.hidden).toBe(
      false,
    );
  });

  it("moves focus to the heading on request", () => {
    banner.setState(files(sff));
    banner.focusHeading();
    expect(document.activeElement).toBe(host.querySelector("h2"));
  });
});
