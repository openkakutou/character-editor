import { waitForVisualReady } from "@openkakutou/web-ui-kit/testing/visual-preset";
import { expect, test } from "@playwright/test";

/**
 * Visual-regression baselines for this app's three real rendered surfaces
 * (backlog item 016) — the sprite browser's decoded sprite preview, the
 * palette editor's live-recolored sprite preview, and the animation
 * editor's Clsn1/Clsn2 box overlay — all driven through the app's real New
 * Character Wizard ("basic" template), not a hand-authored folder fixture:
 * the wizard round-trips a real character through the actual `character`
 * WASM save/load path (.vibe/decisions/013), ending up indistinguishable
 * from an imported one, with one real decoded sprite (group 0, image 0)
 * and one real animation frame referencing it. See
 * .vibe/decisions/017-visual-regression-fixture-via-wizard-not-folder-upload.md
 * for why this suite doesn't need a real folder-based fixture the way
 * lifebar-editor's/stage-editor's own equivalents do.
 */

async function createBasicCharacter(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/");
  await page.locator('[data-action="open-wizard"]').click();
  await page
    .locator('wuik-radio-group input[type="radio"][value="basic"]')
    .click();
  await page.locator('input[data-field="wizard-name"]').fill("Visual Test");
  await page.locator('[data-action="create-character"]').click();
  await expect(page.locator(".sprite-browser")).toBeVisible();
}

test.describe("sprite browser", () => {
  test("matches its baseline after expanding a group and decoding a real sprite", async ({
    page,
  }) => {
    await createBasicCharacter(page);

    const group = page.locator(".sprite-browser__group").first();
    await group.locator(".sprite-browser__group-toggle").click();
    await group
      .locator('.sprite-browser__sprite[data-group="0"][data-image="0"]')
      .click();

    const preview = page.locator(".sprite-browser__preview");
    await expect(preview.locator(".sprite-browser__canvas")).toBeVisible();

    await waitForVisualReady(page);
    await expect(preview).toHaveScreenshot("sprite-browser-decoded-sprite.png");
  });
});

test.describe("palette editor", () => {
  test("matches its baseline after recoloring a swatch, live in the preview", async ({
    page,
  }) => {
    await createBasicCharacter(page);

    const panel = page.locator(".palette-editor");
    await panel.locator(".palette-editor__new-blank").click();

    // Index 244 -- the palette index the fixture sprite's pixels reference
    // most (confirmed by decoding it once against a synthetic index-mapped
    // palette), so recoloring it visibly changes a large, unmistakable area
    // of the preview rather than a few scattered pixels a screenshot diff
    // could miss.
    const swatch = panel
      .locator(".palette-editor__grid .palette-editor__swatch")
      .nth(244);
    await swatch.click();

    // Drives the native color input the same way a real user's pick does:
    // sets its value and fires the "input" event `<wuik-color-picker>`
    // itself listens for (see its own source in web-ui-kit), since headless
    // Chromium has no OS color-picker dialog for Playwright to drive
    // through a click alone.
    const colorInput = panel.locator('wuik-color-picker input[type="color"]');
    await colorInput.evaluate((el: HTMLInputElement) => {
      el.value = "#3399ff";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Confirms the recolor actually committed (not a no-op) before trusting
    // the screenshot below -- reads the swatch's `aria-label`, not
    // `.style.background`: jsdom re-serializes a hex color assigned to
    // `background` as `rgb(...)`, the same reason this app's own unit
    // tests read color state this way (see docs/testing.md).
    await expect(swatch).toHaveAttribute("aria-label", /#3399ff/i);

    const preview = panel.locator(".palette-editor__preview");
    await expect(
      preview.locator(".palette-editor__preview-canvas"),
    ).toBeVisible();

    await waitForVisualReady(page);
    await expect(preview).toHaveScreenshot(
      "palette-editor-recolored-preview.png",
    );
  });
});

test.describe("animation editor", () => {
  test("matches its baseline after adding, dragging, and resizing Clsn boxes", async ({
    page,
  }) => {
    await createBasicCharacter(page);

    const animationPanel = page.locator(".animation-editor__animation").first();
    await animationPanel.locator(".animation-editor__animation-toggle").click();

    const frame = animationPanel.locator(".animation-editor__frame").first();
    await frame.locator('[data-action="toggle-clsn"]').click();

    const clsnEditor = animationPanel.locator(".animation-editor__clsn-editor");
    await expect(clsnEditor.locator(".animation-editor__canvas")).toBeVisible();

    await clsnEditor.locator('[data-action="add-clsn1"]').click();
    await clsnEditor.locator('[data-action="add-clsn2"]').click();

    // Drags the Clsn1 box's body via a real pointer gesture, dispatched
    // in-page. Playwright's CDP-based page.mouse drag was already found
    // unreliable in this exact headless setup for this exact interaction
    // (see docs/testing.md's animation editor real-browser verification
    // notes); direct PointerEvent dispatch exercises the identical
    // wireMoveDrag listener a real drag would, deterministically.
    const clsn1Box = clsnEditor
      .locator(".animation-editor__box--clsn1")
      .first();
    await clsn1Box.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: startX,
          clientY: startY,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: startX + 15,
          clientY: startY + 10,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: startX + 15,
          clientY: startY + 10,
        }),
      );
    });

    // Resizes the Clsn2 box via its bottom-right ("se") corner handle, same
    // in-page-dispatch technique.
    const clsn2Handle = clsnEditor
      .locator(
        ".animation-editor__box--clsn2 .animation-editor__box-handle--se",
      )
      .first();
    await clsn2Handle.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: startX,
          clientY: startY,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: startX + 20,
          clientY: startY + 15,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: startX + 20,
          clientY: startY + 15,
        }),
      );
    });

    // Scoped to the viewport itself (the sprite canvas plus the Clsn box
    // overlay), not the whole `.animation-editor__clsn-editor` wrapper
    // (which also includes the numeric box-fields list/buttons below it)
    // -- a real color/geometry regression in the tiny overlay would
    // otherwise be diluted under the shared preset's diff-pixel-ratio
    // threshold by all that unrelated surrounding chrome.
    const viewport = clsnEditor.locator(".animation-editor__viewport");
    await waitForVisualReady(page);
    await expect(viewport).toHaveScreenshot("animation-editor-clsn-boxes.png");
  });
});
