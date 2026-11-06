import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("./package.json", import.meta.url));
const resolved = require.resolve("@astrojs/check");
console.log("resolved", resolved);

try {
  await import(pathToFileURL(resolved).href);
  console.log("import ok");
} catch (error) {
  console.log("IMPORT FAIL");
  console.log(error.stack.split("\n").slice(0, 12).join("\n"));
}
