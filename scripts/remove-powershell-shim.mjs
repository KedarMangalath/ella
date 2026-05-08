import { rm } from "node:fs/promises";
import path from "node:path";

if (process.platform === "win32" && process.env.APPDATA) {
  const shim = path.join(process.env.APPDATA, "npm", "ella.ps1");
  await rm(shim, { force: true });
}
