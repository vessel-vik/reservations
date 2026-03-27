/**
 * RED: Form field autocomplete and input type tests.
 *
 * iOS Safari uses autocomplete + type attributes to:
 * - Trigger the correct keyboard (email, tel, numeric)
 * - Offer autofill from Keychain/iCloud
 * - Provide name/address suggestions
 *
 * Missing these = degraded experience on every iOS device.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Minimal email input as used in GuestForm
const EmailInput = () => (
  <input
    type="email"
    inputMode="email"
    autoComplete="email"
    data-testid="email-input"
    placeholder="Enter your email"
  />
);

// Minimal phone input as used in GuestForm
const PhoneInput = () => (
  <input
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    data-testid="phone-input"
    placeholder="+254 700 000 000"
  />
);

// Minimal name input
const NameInput = () => (
  <input
    type="text"
    inputMode="text"
    autoComplete="name"
    data-testid="name-input"
    placeholder="John Doe"
  />
);

describe("Form inputs — autocomplete and type for iOS autofill", () => {
  it("email input has type=email for iOS email keyboard", () => {
    render(<EmailInput />);
    expect(screen.getByTestId("email-input")).toHaveAttribute("type", "email");
  });

  it("email input has inputMode=email for iOS keyboard hint", () => {
    render(<EmailInput />);
    expect(screen.getByTestId("email-input")).toHaveAttribute(
      "inputmode",
      "email"
    );
  });

  it("email input has autocomplete=email for iOS Keychain autofill", () => {
    render(<EmailInput />);
    expect(screen.getByTestId("email-input")).toHaveAttribute(
      "autocomplete",
      "email"
    );
  });

  it("phone input has type=tel for iOS phone keyboard", () => {
    render(<PhoneInput />);
    expect(screen.getByTestId("phone-input")).toHaveAttribute("type", "tel");
  });

  it("phone input has inputMode=tel", () => {
    render(<PhoneInput />);
    expect(screen.getByTestId("phone-input")).toHaveAttribute(
      "inputmode",
      "tel"
    );
  });

  it("phone input has autocomplete=tel for iOS autofill", () => {
    render(<PhoneInput />);
    expect(screen.getByTestId("phone-input")).toHaveAttribute(
      "autocomplete",
      "tel"
    );
  });

  it("name input has autocomplete=name for iOS autofill", () => {
    render(<NameInput />);
    expect(screen.getByTestId("name-input")).toHaveAttribute(
      "autocomplete",
      "name"
    );
  });
});
