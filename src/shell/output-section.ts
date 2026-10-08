// The Export section's body (UX flow 001, step 5): every problem found, each
// with a way to reach the faulty element, then the files that would be
// exported. The Export button itself lives in the toolbar.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { tCount } from "../i18n/plural.ts";
import type { ExportController } from "../save/export-controller.ts";
import type { ValidationIssue } from "../validation/character-validation.ts";
import type { ValidationStore } from "../validation/validation-store.ts";
import { sectionTitle } from "./section-text.ts";

export interface OutputSectionOptions {
  validation: ValidationStore;
  controller: ExportController;
  /** Takes the user to the faulty element of `issue`. */
  onGoToIssue: (issue: ValidationIssue) => void;
}

function severityLabel(issue: ValidationIssue): string {
  return issue.severity === "error"
    ? t("output.severity.error", "Error")
    : t("output.severity.warning", "Warning");
}

/** Renders the section into `root` and keeps it current; returns a function that stops that. */
export function renderOutputSection(
  root: HTMLElement,
  options: OutputSectionOptions,
): () => void {
  const { validation, controller } = options;
  root.replaceChildren();
  root.classList.add("output-section");

  const problemsHeading = document.createElement("h2");
  const summary = document.createElement("p");
  summary.className = "output-section__summary";
  const problemList = document.createElement("ul");
  problemList.className = "output-section__problems";
  const filesHeading = document.createElement("h2");
  const filesNote = document.createElement("p");
  filesNote.className = "output-section__note";
  const fileList = document.createElement("ul");
  fileList.className = "output-section__files";
  root.append(
    problemsHeading,
    summary,
    problemList,
    filesHeading,
    filesNote,
    fileList,
  );

  function render(): void {
    problemsHeading.textContent = t("output.problems", "Problems");
    filesHeading.textContent = t("output.files", "Files to export");

    const issues = validation.issues;
    const totals = validation.totals();
    if (issues.length === 0) {
      summary.textContent = validation.hasRun
        ? t("output.noProblem", "No problem found.")
        : "";
    } else {
      summary.textContent = [
        tCount("output.errors", totals.errors, {
          one: "{{count}} error",
          other: "{{count}} errors",
        }),
        tCount("output.warnings", totals.warnings, {
          one: "{{count}} warning",
          other: "{{count}} warnings",
        }),
      ].join(", ");
    }

    problemList.replaceChildren(
      ...issues.map((issue) => {
        const item = document.createElement("li");
        item.className = `output-section__problem output-section__problem--${issue.severity}`;
        item.dataset.issue = issue.id;
        const badge = document.createElement("wuik-badge");
        badge.setAttribute(
          "variant",
          issue.severity === "error" ? "error" : "warning",
        );
        badge.setAttribute("label", severityLabel(issue));
        const text = document.createElement("span");
        text.className = "output-section__message";
        text.textContent = `${sectionTitle(issue.section)} — ${issue.message}`;
        item.append(badge, text);
        if (issue.section !== "output") {
          const go = document.createElement("wuik-button");
          go.setAttribute("variant", "secondary");
          go.dataset.action = "go-to-issue";
          go.textContent = t("output.goTo", "Show");
          go.setAttribute(
            "aria-label",
            t("output.goToLabel", "Show: {{message}}", {
              message: issue.message,
            }),
          );
          go.addEventListener("click", () => options.onGoToIssue(issue));
          item.appendChild(go);
        }
        return item;
      }),
    );

    const files = controller.files;
    if (files === null) {
      filesNote.textContent = t(
        "output.noFiles",
        "The files cannot be prepared until the problem above is fixed.",
      );
      fileList.replaceChildren();
      return;
    }
    filesNote.textContent = t(
      "output.filesNote",
      "Use Export in the toolbar to download all of them.",
    );
    fileList.replaceChildren(
      ...files.map((file) => {
        const item = document.createElement("li");
        item.className = "output-section__file";
        const name = document.createElement("span");
        name.textContent = t(
          "save.fileNameWithStatus",
          "{{fileName}} ({{status}})",
          {
            fileName: file.fileName,
            status: file.unchanged
              ? t("save.unchanged", "unchanged")
              : t("save.modified", "modified"),
          },
        );
        const download = document.createElement("wuik-button");
        download.setAttribute("variant", "secondary");
        download.dataset.action = "download-file";
        download.textContent = t("save.download", "Download");
        download.setAttribute(
          "aria-label",
          t("save.downloadFile", "Download {{fileName}}", {
            fileName: file.fileName,
          }),
        );
        download.addEventListener("click", () => controller.download(file));
        item.append(name, download);
        return item;
      }),
    );
  }

  render();
  const stops = [
    validation.subscribe(render),
    controller.subscribe(render),
    onLocaleChange(render),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
