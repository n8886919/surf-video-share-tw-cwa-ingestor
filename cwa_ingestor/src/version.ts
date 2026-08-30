import { readFile } from "node:fs/promises";

export function parseAppVersion(packageJson: unknown): string {
  if (
    typeof packageJson !== "object"
    || packageJson === null
    || !("version" in packageJson)
    || typeof packageJson.version !== "string"
    || packageJson.version.length === 0
  ) {
    throw new Error("App package metadata does not contain a version");
  }

  return packageJson.version;
}

export async function loadAppVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as unknown;
  return parseAppVersion(packageJson);
}
