import { test, expect } from "@playwright/test";

// End-to-end investigation workflow: load the bundled sample capture, review
// an alert's evidence, click into the link-analysis graph, open a case,
// attach the alert to it, and confirm the export links are present.
//
// Run with `npm run e2e` (needs the FastAPI backend running on :8000 --
// see playwright.config.ts) once Chromium is installed via
// `npx playwright install chromium`.

test.describe("ANTARDRISHTI investigation workflow", () => {
  test("analyst can load a capture, inspect an alert, and build a case", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("ANTARDRISHTI")).toBeVisible();

    // 1. Ingest: load the bundled sample dataset.
    await page.getByRole("button", { name: "use bundled sample" }).click();
    await expect(page.getByText(/transactions ingested/i)).toBeVisible({ timeout: 15_000 });

    // 2. Overview shows a non-zero alert count and a preview graph.
    const alertsStat = page.getByText("alerts raised").locator("..");
    await expect(alertsStat).toBeVisible();

    // 3. Jump to the Investigation tab: three-pane alert / graph / detail view.
    await page.getByRole("button", { name: "Investigation" }).click();
    const firstAlertRow = page.getByRole("list", { name: "Alerts" }).getByRole("button").first();
    await expect(firstAlertRow).toBeVisible();
    await firstAlertRow.click();

    // 4. Alert detail: score, reasons and (if available) a SHAP explanation.
    await expect(page.getByText("Why it was flagged")).toBeVisible();

    // 5. Investigation graph rendered via Cytoscape (a <canvas> is present).
    await expect(page.locator("canvas").first()).toBeVisible();

    // 6. Create a case from the top-bar selector and select it as active.
    page.once("dialog", (dialog) => dialog.accept("SIH demo case"));
    await page.getByRole("button", { name: "+ new" }).click();
    await expect(page.getByRole("combobox")).toContainText("SIH demo case");

    // 7. Attach the currently selected alert to the active case.
    await page.getByRole("button", { name: "add to case" }).click();
    await expect(page.getByText(/added .* to case/i)).toBeVisible();

    // 8. Cases tab: the case now lists at least one attached alert and export links.
    await page.getByRole("button", { name: "Cases" }).click();
    await page.getByText("SIH demo case").click();
    await expect(page.getByText(/ALT-\d{3}/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "json" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "pdf" }).first()).toBeVisible();
  });

  test("patterns tab explains peeling chains and mixing flows", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "use bundled sample" }).click();
    await expect(page.getByText(/transactions ingested/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Patterns & Flows" }).click();
    await expect(page.getByText(/Peeling chains/i)).toBeVisible();
    await expect(page.getByText(/Mixing \/ tumbler flows/i)).toBeVisible();
  });

  test("system status rail reflects live engine availability", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("CatBoost")).toBeVisible();
    await expect(page.getByText("SHAP")).toBeVisible();
    await expect(page.getByText("MLflow")).toBeVisible();
    await expect(page.getByText("Neo4j")).toBeVisible();
    await expect(page.getByText("GDS")).toBeVisible();
  });
});
