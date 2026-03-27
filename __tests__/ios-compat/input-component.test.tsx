/**
 * RED: Input component iOS cross-compatibility tests.
 *
 * iOS Safari specific requirements:
 * - font-size >= 16px to prevent auto-zoom on focus (critical UX issue)
 * - autocomplete attribute for autofill support
 * - inputMode for correct soft keyboard type
 * - Minimum touch target height of 44px (Apple HIG)
 * - No user-scalable interference — use CSS, not disabling zoom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";

describe("Input component — iOS compatibility", () => {
  it("renders with min height class satisfying 44px Apple touch target (h-11 = 44px)", () => {
    render(<Input data-testid="inp" />);
    const input = screen.getByTestId("inp");
    // h-11 in Tailwind = 2.75rem = 44px
    expect(input.className).toMatch(/\bh-11\b/);
  });

  it("applies text-base (16px) class to prevent iOS auto-zoom on focus", () => {
    render(<Input data-testid="inp" />);
    const input = screen.getByTestId("inp");
    // text-sm (14px) triggers iOS zoom; must be text-base (16px) at minimum
    expect(input.className).toMatch(/\btext-base\b/);
  });

  it("accepts and passes through autocomplete attribute", () => {
    render(<Input data-testid="inp" autoComplete="email" />);
    const input = screen.getByTestId("inp");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("accepts and passes through inputMode for correct iOS soft keyboard", () => {
    render(<Input data-testid="inp" inputMode="email" />);
    const input = screen.getByTestId("inp");
    expect(input).toHaveAttribute("inputmode", "email");
  });
});
