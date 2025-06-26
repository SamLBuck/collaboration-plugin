const esbuild = require("esbuild");
esbuild.build({
  entryPoints: ["networking/socket/dist/server.cjs"],
  bundle: true,
  platform: "node",
  outfile: "networking/socket/dist/server.bundle.cjs",
  logLevel: "info",
}).catch(() => process.exit(1));
