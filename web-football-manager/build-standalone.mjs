/**
 * Bundles the compiled ES modules + index.html into ONE self-contained HTML
 * file with all JavaScript inlined as a classic script. The result runs by
 * simply opening it in a browser (file://) — no server, no module loading, no
 * hosting. Useful for handing a private build to someone to test on a phone.
 *
 * Usage: npm run standalone   (runs `tsc` first, then this)
 * Output: web-football-manager.html
 */
import { readFileSync, writeFileSync } from "node:fs";

// dependency order — each file may reference names defined in earlier ones
const order = [
  "dist/engine/rng.js",
  "dist/engine/types.js",
  "dist/engine/formations.js",
  "dist/engine/data.js",
  "dist/engine/match.js",
  "dist/web/main.js",
];

function strip(src) {
  return src
    .split("\n")
    .filter((l) => !/^\s*import\s.*from\s.*;?\s*$/.test(l)) // drop imports
    .filter((l) => !/^\s*\/\/#\s*sourceMappingURL=/.test(l)) // drop sourcemap refs
    .map((l) => l.replace(/^(\s*)export\s+/, "$1")) // strip `export ` keyword
    .join("\n");
}

const bundle = order
  .map((f) => `// ===== ${f} =====\n${strip(readFileSync(f, "utf8"))}`)
  .join("\n\n");

const iife = `(function(){\n"use strict";\n${bundle}\n})();`;

const html = readFileSync("index.html", "utf8").replace(
  /<script type="module" src="dist\/web\/main\.js"><\/script>/,
  `<script>\n${iife}\n</script>`,
);

writeFileSync("web-football-manager.html", html);
console.log(
  `Wrote web-football-manager.html (${(html.length / 1024).toFixed(1)} KB, self-contained)`,
);
