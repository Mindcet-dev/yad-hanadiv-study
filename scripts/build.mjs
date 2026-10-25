// Builds dist/ for GitHub Pages: the artifact source (site-src/index.html) + the Firebase adapter (live/).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";

const DOMAIN = "yad-hanadiv-study.mindcet.io";
let html = readFileSync("site-src/index.html", "utf8");

// Uploaded files are linked as "/_blob/<id>" inside Claude; point them at Firebase Storage instead.
html = html
  .replace(/\/_blob\/\$\{esc\(encodeURIComponent\(([^)]+)\)\)\}/g, "${esc(__blobUrl($1))}")
  .replace(/"\/_blob\/"\s*\+\s*encodeURIComponent\(([^)]+)\)/g, "__blobUrl($1)");
if (html.includes("/_blob/")) throw new Error("Unhandled /_blob/ reference in site-src/index.html; extend the rewrite in scripts/build.mjs");

// The adapter must run before the page's own (first) inline script.
const first = html.indexOf("<script>");
if (first < 0) throw new Error("No inline <script> found in site-src/index.html");
const live = `<script src="config.js"></script>\n<script src="shim.js"></script>\n`;
html = html.slice(0, first) + live + html.slice(first);
html = html.replace(/<meta name="claude:[^>]*>\n?/g, "");

// Artifacts are published as fragments; give the live page its own document skeleton.
if (!/<!doctype/i.test(html)) {
  html = `<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
writeFileSync("dist/index.html", html);
cpSync("live", "dist", { recursive: true });
cpSync("seed", "dist/seed", { recursive: true });
writeFileSync("dist/CNAME", DOMAIN + "\n");
writeFileSync("dist/.nojekyll", "");
console.log("Built dist/ for", DOMAIN);
