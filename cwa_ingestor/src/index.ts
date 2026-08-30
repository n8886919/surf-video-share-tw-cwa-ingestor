import { loadConfig } from "./config.js";
import { structuredLog, redactMessage } from "./logging.js";
import { CwaRunner } from "./runner.js";
import { loadAppVersion } from "./version.js";

try {
  const config = await loadConfig();
  structuredLog("info", "app_started", { version: await loadAppVersion() });
  await new CwaRunner(config).runForever();
} catch (error) {
  structuredLog("error", "app_fatal", { message: redactMessage(error) });
  process.exitCode = 1;
}
