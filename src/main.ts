import { appVersion } from "./version.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.textContent = `Character Editor — v${appVersion}`;
}
