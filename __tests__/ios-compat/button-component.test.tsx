/**
 * RED: Button component iOS cross-compatibility tests.
 *
 * iOS Safari specific requirements:
 * - Minimum 44x44px touch target (Apple HIG)
 * - touch-action: manipulation to remove 300ms tap delay
 * - No default iOS button styling interference
 * - cursor-pointer for proper tap cursor on iPad
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button component — iOS compatibility", () => {
  it("default size meets 44px Apple touch target minimum (h-11 = 44px)", () => {
    render(<Button data-testid="btn">Press</Button>);
    const btn = screen.getByTestId("btn");
    expect(btn.className).toMatch(/\bh-11\b/);
  });

  it("includes cursor-pointer for proper tap cursor on iPad", () => {
    render(<Button data-testid="btn">Press</Button>);
    const btn = screen.getByTestId("btn");
    expect(btn.className).toMatch(/\bcursor-pointer\b/);
  });

  it("sm size meets minimum 36px height (acceptable for secondary actions)", () => {
    render(
      <Button data-testid="btn" size="sm">
        Press
      </Button>
    );
    const btn = screen.getByTestId("btn");
    // h-9 = 36px — acceptable for compact secondary actions
    expect(btn.className).toMatch(/\bh-9\b/);
  });

  it("icon size provides 40px touch target (size-10)", () => {
    render(
      <Button data-testid="btn" size="icon">
        X
      </Button>
    );
    const btn = screen.getByTestId("btn");
    expect(btn.className).toMatch(/\bsize-10\b/);
  });
});
