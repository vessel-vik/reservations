import { describe, expect, it } from "vitest";
import { normalizeRequeueReason } from "@/lib/print-requeue-reason";

describe("normalizeRequeueReason", () => {
  it("returns fallback when empty", () => {
    expect(normalizeRequeueReason("", "system_queue")).toBe("system_queue");
  });

  it("keeps allowed values", () => {
    expect(normalizeRequeueReason("admin_receipt_reprint", "system_queue")).toBe("admin_receipt_reprint");
  });

  it("normalizes casing and trims", () => {
    expect(normalizeRequeueReason("  PAPER_JAM  ", "system_queue")).toBe("paper_jam");
  });

  it("maps unknown values to other", () => {
    expect(normalizeRequeueReason("weird-custom-reason", "system_queue")).toBe("other");
  });
});

