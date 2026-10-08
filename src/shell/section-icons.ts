// 18 px stroke icons for the sidebar, one per section. Static literals only.
import type { SectionId } from "./sections.ts";

const PATHS: Record<SectionId, string> = {
  identity: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  sprites: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4",
  sounds: "M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6",
  palettes:
    "M12 4a8 8 0 1 0 0 16c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3 8 8 0 0 0-8-9Z",
  states: "M5 6h6v4H5zM13 14h6v4h-6zM11 8h4v6M8 10v4h5",
  commands: "M4 7h16v10H4zM8 11h.01M12 11h.01M16 11h.01M8 14h8",
  animations: "M5 4h14v16H5zM5 9h14M5 15h14M9 4v16M15 4v16",
  output: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
};

/** An `<svg slot="icon">` element for `id`. */
export function createSectionIcon(id: SectionId): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("slot", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[id]);
  svg.appendChild(path);
  return svg;
}
