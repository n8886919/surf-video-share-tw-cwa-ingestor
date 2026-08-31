import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function dimensions(path: URL): Promise<{ width: number; height: number }> {
  const image = await readFile(path);
  expect(image.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe("Home Assistant App branding", () => {
  it("ships the checked-in square PNG as both the store icon and logo", async () => {
    const iconPath = new URL("../icon.png", import.meta.url);
    const logoPath = new URL("../logo.png", import.meta.url);
    const [icon, logo, iconDimensions, logoDimensions] = await Promise.all([
      readFile(iconPath),
      readFile(logoPath),
      dimensions(iconPath),
      dimensions(logoPath),
    ]);

    expect(icon).toEqual(logo);
    expect(iconDimensions).toEqual({ width: 512, height: 512 });
    expect(logoDimensions).toEqual(iconDimensions);
  });
});
