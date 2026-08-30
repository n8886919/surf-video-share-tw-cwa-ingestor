import { loadConfig } from "./config.js";
import { structuredLog, redactMessage } from "./logging.js";
import { CwaRunner } from "./runner.js";

try {
  const config = await loadConfig();
  structuredLog("info", "app_started", { version: "0.1.0" });
  await new CwaRunner(config).runForever();
} catch (error) {
  structuredLog("error", "app_fatal", { message: redactMessage(error) });
  process.exitCode = 1;
}
