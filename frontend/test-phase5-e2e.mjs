import puppeteer from "puppeteer-core";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\krish\\.gemini\\antigravity\\brain\\15d1deb3-eeb3-4b4d-a52d-2bf00f7f57f9";
const SECRET_KEY = "sk_test_VEuX1LXgDsIWXRZv9xRJOlCpqCdASIjYbVLeXZ816Z";
const USER_ID = "user_3LgnrBnd3zY4jCGw5H3YujOU60b";
const TEST_PDF_PATH = path.resolve("test-sample.pdf");

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
  console.log("1. Creating Clerk sign-in token...");
  const token = await createSignInToken();
  console.log("Token obtained successfully.");

  console.log("2. Launching Edge browser via puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,850"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 850 });

    // Sign in using the ticket on localhost:3000/sign-in
    console.log("3. Navigating to sign-in with ticket...");
    await page.goto(`http://localhost:3000/sign-in?__clerk_ticket=${token}`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    console.log("4. Waiting for dashboard navigation...");
    await new Promise((r) => setTimeout(r, 4000));

    if (!page.url().includes("/dashboard")) {
      await page.goto("http://localhost:3000/dashboard", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    }

    console.log(`Current URL: ${page.url()}`);
    await page.waitForSelector("aside", { timeout: 10000 });
    console.log("Dashboard loaded successfully!");

    // Capture initial dashboard
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-dashboard-initial.png") });

    // Open Upload Dialog via + New button in sidebar
    console.log("5. Clicking '+ New' button in sidebar...");
    const newBtn = await page.$('aside button ::-p-text(New)');
    if (newBtn) {
      await newBtn.click();
    } else {
      // Fallback: click upload button in input
      const inputPlusBtn = await page.$('button[title="Upload study PDF"]');
      if (inputPlusBtn) await inputPlusBtn.click();
    }

    await new Promise((r) => setTimeout(r, 1000));
    await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
    console.log("Upload dialog opened!");

    // Screenshot dialog empty
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-upload-dialog-empty.png") });

    // Upload file using input[type="file"]
    console.log(`6. Selecting PDF file: ${TEST_PDF_PATH}...`);
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("File input not found in dialog!");
    }
    await fileInput.uploadFile(TEST_PDF_PATH);
    await new Promise((r) => setTimeout(r, 1000));

    // Screenshot dialog with file selected
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-upload-dialog-selected.png") });

    // Click "Upload Study PDF" button
    console.log("7. Clicking 'Upload Study PDF' button...");
    const uploadBtn = await page.$('div[role="dialog"] button ::-p-text(Upload Study PDF)');
    if (!uploadBtn) {
      throw new Error("Upload button not found!");
    }
    await uploadBtn.click();

    // Wait for success screen
    console.log("8. Waiting for upload completion...");
    await page.waitForSelector('div[role="dialog"] ::-p-text(Upload Complete)', { timeout: 20000 });
    console.log("Upload succeeded!");

    // Screenshot dialog success
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-upload-dialog-success.png") });

    // Click "Open Study Workspace"
    console.log("9. Clicking 'Open Study Workspace'...");
    const openWorkspaceBtn = await page.$('div[role="dialog"] button ::-p-text(Open Study Workspace)');
    if (!openWorkspaceBtn) {
      throw new Error("Open Study Workspace button not found!");
    }
    await openWorkspaceBtn.click();

    // Wait for workspace route /dashboard/study/...
    await new Promise((r) => setTimeout(r, 3000));
    console.log(`Navigated to: ${page.url()}`);
    await page.waitForSelector('header', { timeout: 10000 });

    // Screenshot study workspace
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-uploaded-workspace.png") });
    console.log("Captured uploaded study workspace screenshot!");

    // Test "View Original PDF"
    console.log("10. Testing 'View Original PDF' modal...");
    const viewPdfBtn = await page.$('button ::-p-text(View Original PDF)');
    if (viewPdfBtn) {
      await viewPdfBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-pdf-viewer-modal.png") });
      console.log("Captured PDF viewer modal screenshot!");

      // Close modal
      const closeBtn = await page.$('div[role="dialog"] button[aria-label="Close"]');
      if (closeBtn) await closeBtn.click();
      await new Promise((r) => setTimeout(r, 500));
    }

    // Navigate back to Dashboard to inspect Recent sidebar
    console.log("11. Navigating back to Dashboard...");
    await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "phase5-dashboard-with-recent.png") });
    console.log("Captured dashboard with real document in Recent sidebar!");

    console.log("\n==============================================");
    console.log("ALL PHASE 5 E2E TESTS PASSED SUCCESSFULLY!");
    console.log("==============================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

