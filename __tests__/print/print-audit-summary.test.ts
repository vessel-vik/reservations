import { describe, expect, it } from "vitest";
import { computePrintAuditSummary } from "@/app/api/pos/print-audit/summary/route";

describe("computePrintAuditSummary", () => {
  it("computes category SLO, failure rates, and trend bins", () => {
    const rows = [
      {
        printJobId: "j1",
        category: "docket",
        jobType: "captain_docket",
        status: "queued",
        timestamp: "2026-04-09T10:00:00.000Z",
      },
      {
        printJobId: "j1",
        category: "docket",
        jobType: "captain_docket",
        status: "completed",
        timestamp: "2026-04-09T10:00:10.000Z",
      },
      {
        printJobId: "j2",
        category: "update",
        jobType: "kitchen_delta",
        status: "queued",
        timestamp: "2026-04-09T10:10:00.000Z",
      },
      {
        printJobId: "j2",
        category: "update",
        jobType: "kitchen_delta",
        status: "failed",
        timestamp: "2026-04-09T10:10:12.000Z",
        errorMessage: "Printer not reachable",
        terminalId: "term-a",
      },
      {
        printJobId: "j3",
        category: "receipt",
        jobType: "receipt",
        status: "queued",
        timestamp: "2026-04-09T11:00:00.000Z",
      },
      {
        printJobId: "j3",
        category: "receipt",
        jobType: "receipt",
        status: "completed",
        timestamp: "2026-04-09T11:00:08.000Z",
      },
    ] as any[];

    const out = computePrintAuditSummary(rows, 24);
    expect(out.total).toBe(6);
    expect(out.byCategory.docket.completed).toBe(1);
    expect(out.byCategory.update.failed).toBe(1);
    expect(out.byCategorySlo.docket.samples).toBe(1);
    expect(out.byCategorySlo.docket.p95LatencyMs).toBe(10_000);
    expect(out.byCategorySlo.receipt.p95LatencyMs).toBe(8_000);
    expect(out.failureRatesByJobType.find((x) => x.jobType === "kitchen_delta")?.failureRate).toBe(1);
    expect(out.topErrors[0]?.message).toContain("Printer not reachable");
    expect(out.topFailingTerminals[0]?.terminalId).toBe("term-a");
    expect(out.queueHealth.breachedJobs).toBeGreaterThanOrEqual(1);
    expect(out.queueHealth.breachAging.gt90s).toBeGreaterThanOrEqual(1);
    expect(out.queueHealth.adaptiveThresholdsMs.receipt).toBe(60_000);
    expect(typeof out.queueHealth.breachedByCategory.update).toBe("number");
    expect(out.trendHourly.length).toBe(24);
  });
});

