/**
 * RED: CSS cross-compatibility rules for iOS Safari and all devices.
 *
 * These tests verify that globals.css contains critical vendor-prefixed
 * and mobile-safe rules. iOS Safari requires:
 * - -webkit-backdrop-filter (backdrop-filter has no effect without it on Safari)
 * - font-size >= 16px on inputs (prevents automatic zoom-on-focus in iOS Safari)
 * - -webkit-tap-highlight-color: transparent (removes blue tap flash)
 * - touch-action: manipulation (removes 300ms tap delay on iOS)
 * - -webkit-overflow-scrolling: touch (smooth momentum scroll)
 * - Safe area env() variables for notch/home-indicator support
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const cssPath = path.resolve(__dirname, "../../app/globals.css");
const css = fs.readFileSync(cssPath, "utf-8");

describe("globals.css — iOS Safari compatibility", () => {
  it("includes -webkit-backdrop-filter for Safari", () => {
    expect(css).toContain("-webkit-backdrop-filter");
  });

  it("prevents iOS input zoom: sets font-size 16px on inputs inside @media", () => {
    // iOS Safari zooms when input font-size < 16px
    expect(css).toMatch(/@media.*max-width[\s\S]*font-size:\s*16px/);
  });

  it("removes iOS tap highlight with -webkit-tap-highlight-color", () => {
    expect(css).toContain("-webkit-tap-highlight-color");
  });

  it("removes 300ms tap delay with touch-action: manipulation on buttons/inputs", () => {
    expect(css).toContain("touch-action: manipulation");
  });

  it("supports safe area insets for notched devices (env(safe-area-inset-*))", () => {
    expect(css).toContain("safe-area-inset");
  });
});
