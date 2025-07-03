// package-release.js
const fs      = require("fs");
const archiver= require("archiver");

const manifest= JSON.parse(fs.readFileSync("manifest.json","utf8"));
const zipName = `collaboration-plugin.zip`;

const output  = fs.createWriteStream(zipName);
const archive = archiver("zip",{ zlib:{ level:9 } });

output.on("close", ()=> console.log(`✔ ${zipName} (${archive.pointer()} bytes)`));
archive.on("error", err=>{ throw err; });

archive.pipe(output);

// root plugin files
["manifest.json","main.js","styles.css","data.json"]
  .forEach(f=> archive.file(f,{ name: f }));


archive.finalize();