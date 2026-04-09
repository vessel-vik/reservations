import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeOrderAgeMinutes, resolveOrderTimestampMs } from "@/lib/order-time";

describe("order-time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses orderTime when valid", () => {
    const doc = {
      orderTime: "2026-04-08T11:00:00.000Z",
      $createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(computeOrderAgeMinutes(doc)).toBe(60);
  });

  it("falls back to $createdAt when orderTime is invalid", () => {
    const doc = {
      orderTime: "",
      $createdAt: "2026-04-08T11:30:00.000Z",
    };
    expect(computeOrderAgeMinutes(doc)).toBe(30);
  });

  it("resolveOrderTimestampMs prefers orderTime", () => {
    const ms = resolveOrderTimestampMs({
      orderTime: "2026-04-08T10:00:00.000Z",
      $createdAt: "2026-04-08T11:00:00.000Z",
    });
    expect(ms).toBe(new Date("2026-04-08T10:00:00.000Z").getTime());
  });
});
