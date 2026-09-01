import { describe, expect, it } from "vitest";
import { loadAppVersion, parseAppVersion } from "../src/version.js";

describe("app version", () => {
  it("loads the version from the package copied into the runtime image", async () => {
    await expect(loadAppVersion()).resolves.toBe("0.4.0");
  });

  it("fails closed when package metadata has no usable version", () => {
    expect(() => parseAppVersion({})).toThrow("does not contain a version");
    expect(() => parseAppVersion({ version: "" })).toThrow("does not contain a version");
  });
});
