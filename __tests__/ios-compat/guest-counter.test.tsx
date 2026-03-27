/**
 * RED: GuestCounter touch target tests.
 *
 * iOS HIG requires interactive elements to be at least 44x44pt.
 * The increment/decrement buttons must meet this to be usable on iPhone.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestCounter } from "@/components/ui/GuestCounter";

describe("GuestCounter — iOS touch compatibility", () => {
  it("decrement button has adequate touch target class (p-3 min 44px)", () => {
    render(<GuestCounter value={3} onChange={() => {}} />);
    const decrementBtn = screen.getByLabelText("Decrease guests");
    // p-3 (12px padding) + icon (20px) = 44px total touch target
    expect(decrementBtn.className).toMatch(/\bp-3\b/);
  });

  it("increment button has adequate touch target class (p-3 min 44px)", () => {
    render(<GuestCounter value={3} onChange={() => {}} />);
    const incrementBtn = screen.getByLabelText("Increase guests");
    expect(incrementBtn.className).toMatch(/\bp-3\b/);
  });

  it("decrement button is type=button preventing iOS form submission on tap", () => {
    render(<GuestCounter value={3} onChange={() => {}} />);
    const decrementBtn = screen.getByLabelText("Decrease guests");
    expect(decrementBtn).toHaveAttribute("type", "button");
  });

  it("increment button is type=button preventing iOS form submission on tap", () => {
    render(<GuestCounter value={3} onChange={() => {}} />);
    const incrementBtn = screen.getByLabelText("Increase guests");
    expect(incrementBtn).toHaveAttribute("type", "button");
  });

  it("fires onChange when increment tapped", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GuestCounter value={3} onChange={onChange} />);
    await user.click(screen.getByLabelText("Increase guests"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("fires onChange when decrement tapped", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GuestCounter value={3} onChange={onChange} />);
    await user.click(screen.getByLabelText("Decrease guests"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("disables decrement at min value — prevents negative guests on iOS tap spam", () => {
    render(<GuestCounter value={1} onChange={() => {}} min={1} />);
    expect(screen.getByLabelText("Decrease guests")).toBeDisabled();
  });

  it("disables increment at max value — prevents overflow on iOS tap spam", () => {
    render(<GuestCounter value={20} onChange={() => {}} max={20} />);
    expect(screen.getByLabelText("Increase guests")).toBeDisabled();
  });
});
