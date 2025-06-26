const fs   = require("fs");
const path = require("path");

// TODO: update this to match your actual vault path
const VAULT_PLUGIN_DIR = 
  "C:/Users/CSStudent/Documents/Obsidian Vault/.obsidian/plugins/collaboration-plugin";

const filesToCopy = [
  { src: "main.js",                                         dest: "main.js" },
  { src: "manifest.json",                                   dest: "manifest.json" },
  { src: "styles.css",                                      dest: "styles.css" },
  { src: "data.json",                                       dest: "data.json" },
  { src: "networking/socket/dist/server.bundle.cjs",        dest: "networking/socket/dist/server.bundle.cjs" },
];

for (const {src, dest} of filesToCopy) {
  const fullSrc = path.join(__dirname, src);
  const fullDst = path.join(VAULT_PLUGIN_DIR, dest);
  fs.mkdirSync(path.dirname(fullDst), { recursive: true });
  fs.copyFileSync(fullSrc, fullDst);
  console.log(`Copied ${src} → ${fullDst}`);
}
