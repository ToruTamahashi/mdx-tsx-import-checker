import * as esbuild from "esbuild";
import { writeFileSync } from "fs";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/cli.js",
  // Node.js 組み込みモジュールは外部のまま（バンドル不要）
  external: ["fs", "path", "child_process", "os", "util", "stream", "events"],
  // ソースマップ（デバッグ用）
  sourcemap: true,
  // バンドルサイズの最小化
  minify: false,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);

  // バンドル後に shebang を確認・保証する
  // esbuild は shebang を保持するが念のため先頭行を確認
  const { readFileSync } = await import("fs");
  const out = readFileSync("dist/cli.js", "utf-8");
  if (!out.startsWith("#!/usr/bin/env node")) {
    writeFileSync("dist/cli.js", "#!/usr/bin/env node\n" + out);
  }

  console.log("Build complete: dist/cli.js");
}
