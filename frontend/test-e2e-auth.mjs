import puppeteer from "puppeteer-core";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\krish\\.gemini\\antigravity\\brain\\ce229b16-3490-4a23-9a30-3ee8127816a3";
const SECRET_KEY = "sk_test_VEuX1LXgDsIWXRZv9xRJOlCpqCdASIjYbVLeXZ816Z";
const USER_ID = "user_3LgnrBnd3zY4jCGw5H3YujOU60b"; // Krish

async function createSignInToken() {
  const resp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  const data = await resp.json();
  if (!data.token) {
    throw new Error(`Failed to create sign-in token: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function run() {
  console.log("Creating Clerk sign-in token...");
  const token = await createSignInToken();
  console.log("Token obtained successfully.");

  console.log("Launching Edge browser via puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,850"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 850 });

    // Sign in using the ticket on localhost:3000/sign-in
    console.log("Signing in using Clerk ticket on http://localhost:3000/sign-in...");
    await page.goto(`http://localhost:3000/sign-in?__clerk_ticket=${token}`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for redirect to dashboard or navigate to /dashboard
    console.log("Waiting for navigation to /dashboard...");
    await new Promise((r) => setTimeout(r, 4000));

    if (!page.url().includes("/dashboard")) {
      await page.goto("http://localhost:3000/dashboard", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    }

    console.log(`Current page URL: ${page.url()}`);

    // Wait for greeting or sidebar to render
    await page.waitForSelector("aside", { timeout: 10000 });
    console.log("Sidebar detected!");

    // Capture Screen 1: Dashboard
    const dashboardScreenshot = path.join(ARTIFACT_DIR, "screenshot-dashboard.png");
    await page.screenshot({ path: dashboardScreenshot });
    console.log(`Captured dashboard screenshot at: ${dashboardScreenshot}`);

    // Test typing a custom topic and submitting
    console.log("Testing search input with custom topic...");
    const inputSelector = 'input[placeholder="Class 10th Biology Heredity"]';
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, "Class 10th Periodic Classification");
    await new Promise((r) => setTimeout(r, 500));

    // Submit form
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1000));

    const modalScreenshot = path.join(ARTIFACT_DIR, "screenshot-dashboard-modal.png");
    await page.screenshot({ path: modalScreenshot });
    console.log(`Captured new topic modal screenshot at: ${modalScreenshot}`);

    // Navigate to Study Workspace: Life Processes
    console.log("Navigating to /dashboard/study/life-processes...");
    await page.goto("http://localhost:3000/dashboard/study/life-processes", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.waitForSelector("header", { timeout: 10000 });
    console.log("Study workspace loaded!");

    // Capture Screen 2: Study Workspace (Notes view with circular bio-cycle diagram)
    const studyNotesScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-notes.png");
    await page.screenshot({ path: studyNotesScreenshot });
    console.log(`Captured study notes screenshot at: ${studyNotesScreenshot}`);

    // Test clicking Questions tab
    console.log("Switching to Questions tab...");
    const questionsBtn = await page.$('nav[aria-label="Study workspace tools"] button ::-p-text(Questions)');
    if (questionsBtn) {
      await questionsBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      const questionsScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-questions.png");
      await page.screenshot({ path: questionsScreenshot });
      console.log(`Captured questions tab screenshot at: ${questionsScreenshot}`);
    }

    // Test clicking Flashcards tab
    console.log("Switching to Flashcards tab...");
    const flashcardsBtn = await page.$('nav[aria-label="Study workspace tools"] button ::-p-text(Flashcards)');
    if (flashcardsBtn) {
      await flashcardsBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      const flashcardsScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-flashcards.png");
      await page.screenshot({ path: flashcardsScreenshot });
      console.log(`Captured flashcards tab screenshot at: ${flashcardsScreenshot}`);
    }

    // Test clicking Quiz tab
    console.log("Switching to Quiz tab...");
    const quizBtn = await page.$('nav[aria-label="Study workspace tools"] button ::-p-text(Quiz)');
    if (quizBtn) {
      await quizBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      const quizScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-quiz.png");
      await page.screenshot({ path: quizScreenshot });
      console.log(`Captured quiz tab screenshot at: ${quizScreenshot}`);
    }

    // Test clicking AI Talk tab
    console.log("Switching to AI Talk tab...");
    const aiTalkBtn = await page.$('nav[aria-label="Study workspace tools"] button ::-p-text(AI Talk)');
    if (aiTalkBtn) {
      await aiTalkBtn.click();
      await new Promise((r) => setTimeout(r, 800));
      const aiTalkScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-aitalk.png");
      await page.screenshot({ path: aiTalkScreenshot });
      console.log(`Captured AI talk tab screenshot at: ${aiTalkScreenshot}`);
    }

    // Test Mobile View of Study Workspace
    console.log("Testing mobile viewport of Study Workspace (375x812)...");
    await page.setViewport({ width: 375, height: 812 });
    await new Promise((r) => setTimeout(r, 500));
    const mobileStudyScreenshot = path.join(ARTIFACT_DIR, "screenshot-study-mobile.png");
    await page.screenshot({ path: mobileStudyScreenshot });
    console.log(`Captured mobile study workspace screenshot at: ${mobileStudyScreenshot}`);

    // Test Mobile Dashboard
    console.log("Testing mobile viewport of Dashboard (375x812)...");
    await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 500));
    const mobileDashboardScreenshot = path.join(ARTIFACT_DIR, "screenshot-dashboard-mobile.png");
    await page.screenshot({ path: mobileDashboardScreenshot });
    console.log(`Captured mobile dashboard screenshot at: ${mobileDashboardScreenshot}`);

    console.log("\n==============================================");
    console.log("All live E2E browser tests completed successfully!");
    console.log("==============================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

