import fs from "fs";
import os from "os";
import puppeteer from "puppeteer";

function getChromeCandidates() {
  const envCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
  ].filter(Boolean);

  const platform = os.platform();

  if (platform === "darwin") {
    return [
      ...envCandidates,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }

  if (platform === "win32") {
    return [
      ...envCandidates,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
  }

  return [
    ...envCandidates,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
}

function resolveChromeExecutablePath() {
  const candidates = getChromeCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function launchBrowser(options = {}) {
  const executablePath = resolveChromeExecutablePath();
  const launchOptions = {
    headless: "new",
    ...options,
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return puppeteer.launch(launchOptions);
}

export { launchBrowser, resolveChromeExecutablePath };
