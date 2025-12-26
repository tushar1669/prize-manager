import { execSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const skipDownload = process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1";

if (skipDownload) {
  console.log("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 set; skipping browser install.");
  process.exit(0);
}

const chromiumPath = chromium.executablePath();

if (fs.existsSync(chromiumPath)) {
  console.log("Playwright chromium already installed.");
  process.exit(0);
}

execSync("npx playwright install --with-deps chromium", { stdio: "inherit" });
