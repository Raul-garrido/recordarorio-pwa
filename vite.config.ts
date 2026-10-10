/// <reference types="vitest" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/** Emits sw.js with the list of built files to precache, so the app opens offline after the first visit. */
function serviceWorker(): Plugin {
  return {
    name: "recordatorio-sw",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const pub = ["index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
      const precache = ["./", ...[...files, ...pub].map((f) => `./${f}`)];
      const version = createHash("sha256").update(precache.join("|")).update(JSON.stringify(Object.keys(bundle))).digest("hex").slice(0, 10);
      const src = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source: src });
    },
  };
}

// Relative base so the build works on GitHub Pages (/recordarorio-pwa/) or any other static host.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  plugins: [serviceWorker()],
  test: { environment: "node" },
});
