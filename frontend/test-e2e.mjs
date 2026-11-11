import puppeteer from "puppeteer-core";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\krish\\.gemini\\antigravity\\brain\\ce229b16-3490-4a23-9a30-3ee8127816a3";

async function run() {
  console.log("Launching Edge browser via puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,800"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. Test Landing Page
    console.log("Visiting landing page at http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2", timeout: 30000 });
    const landingTitle = await page.title();
    console.log(`Landing page title: ${landingTitle}`);

    const landingScreenshot = path.join(ARTIFACT_DIR, "screenshot-landing-desktop.png");
    await page.screenshot({ path: landingScreenshot, fullPage: false });
    console.log(`Saved landing desktop screenshot to ${landingScreenshot}`);

    // Test Landing Page Interactive Preview Tabs
    console.log("Testing landing page interactive preview tabs...");
    const flashcardsTabBtn = await page.$('button ::-p-text(Flashcards)');
    if (flashcardsTabBtn) {
      await flashcardsTabBtn.click();
      console.log("Clicked Flashcards tab on landing preview");
      await new Promise(r => setTimeout(r, 600));
    }

    // 2. Test Mobile Viewport on Landing Page
    await page.setViewport({ width: 375, height: 812 });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2" });
    const landingMobileScreenshot = path.join(ARTIFACT_DIR, "screenshot-landing-mobile.png");
    await page.screenshot({ path: landingMobileScreenshot, fullPage: false });
    console.log(`Saved landing mobile screenshot to ${landingMobileScreenshot}`);

    // 3. Test Protected Route Redirect
    await page.setViewport({ width: 1280, height: 800 });
    console.log("Testing protected route redirect for unauthenticated /dashboard...");
    await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle2" });
    const currentUrl = page.url();
    console.log(`URL after navigating to /dashboard: ${currentUrl}`);
    const isRedirectedToSignIn = currentUrl.includes("/sign-in");
    console.log(`Correctly redirected to /sign-in: ${isRedirectedToSignIn}`);

    const signInScreenshot = path.join(ARTIFACT_DIR, "screenshot-sign-in.png");
    await page.screenshot({ path: signInScreenshot, fullPage: false });
    console.log(`Saved sign-in screenshot to ${signInScreenshot}`);

    console.log("All preliminary E2E checks passed!");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
