import http from "node:http";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

const {
    SETTLEMENT_API_BASE_URL = "http://host.docker.internal:3000",
    SETTLEMENT_WORKER_TOKEN = "",
    WORKER_POLL_INTERVAL_MS = "1500",
    WORKER_METRICS_PORT = "9464",
    WORKER_JENGA_RECONCILE_EVERY_LOOPS = "20",
    WORKER_JENGA_DRIFT_CHECK_EVERY_LOOPS = "40",
} = process.env;

if (!SETTLEMENT_WORKER_TOKEN) {
    console.error("Missing SETTLEMENT_WORKER_TOKEN for settlement worker.");
    process.exit(1);
}

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "settlement_worker_" });

const jobsProcessed = new Counter({
    name: "settlement_jobs_processed_total",
    help: "Total settlement jobs processed by worker",
    registers: [registry],
});

const jobsFailed = new Counter({
    name: "settlement_jobs_failed_total",
    help: "Total settlement jobs failed by worker",
    registers: [registry],
});

const jobsRetried = new Counter({
    name: "settlement_jobs_retried_total",
    help: "Total settlement jobs put back for retry",
    registers: [registry],
});

const jobsDeadLetter = new Counter({
    name: "settlement_jobs_dead_letter_total",
    help: "Total settlement jobs moved to dead-letter state",
    registers: [registry],
});

const queueDepthGauge = new Gauge({
    name: "settlement_queue_depth",
    help: "Pending settlement queue depth",
    registers: [registry],
});

const unresolvedDriftGauge = new Gauge({
    name: "jenga_unresolved_drift_count",
    help: "Current unresolved drift tickets detected in Jenga ops",
    registers: [registry],
});

const unresolvedOverSlaGauge = new Gauge({
    name: "jenga_unresolved_over_sla_count",
    help: "Current unresolved Jenga tickets older than SLA",
    registers: [registry],
});

const httpServer = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
        res.statusCode = 200;
        res.setHeader("Content-Type", registry.contentType);
        res.end(await registry.metrics());
        return;
    }
    res.statusCode = 200;
    res.end("ok");
});

httpServer.listen(Number(WORKER_METRICS_PORT), () => {
    console.log(`Settlement worker metrics listening on :${WORKER_METRICS_PORT}`);
});

async function processSingleJob() {
    const response = await fetch(`${SETTLEMENT_API_BASE_URL}/api/payments/settlements/process`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-worker-token": SETTLEMENT_WORKER_TOKEN,
        },
        body: JSON.stringify({ maxJobs: 1 }),
    });

    if (!response.ok) {
        jobsFailed.inc();
        const text = await response.text();
        console.error("Worker process endpoint failed:", response.status, text);
        return;
    }

    const payload = await response.json();
    if (typeof payload.pendingCount === "number") {
        queueDepthGauge.set(payload.pendingCount);
    }
    if (payload.processedCount > 0) {
        jobsProcessed.inc(payload.processedCount);
    }
    if (payload.retriedCount > 0) {
        jobsRetried.inc(payload.retriedCount);
    }
    if (payload.deadLetterCount > 0) {
        jobsDeadLetter.inc(payload.deadLetterCount);
    }
}

async function runJengaReconcile() {
    const response = await fetch(`${SETTLEMENT_API_BASE_URL}/api/cron/jenga-reconcile`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-worker-token": SETTLEMENT_WORKER_TOKEN,
        },
        body: JSON.stringify({ limit: 20 }),
    });
    if (!response.ok) {
        const text = await response.text();
        console.warn("Jenga reconcile endpoint failed:", response.status, text);
        return;
    }
    const payload = await response.json().catch(() => ({}));
    if ((payload?.resolved || 0) > 0) {
        console.info("[jenga.reconcile] auto-resolved", payload.resolved);
    }
}

async function runJengaDriftCheck() {
    const response = await fetch(`${SETTLEMENT_API_BASE_URL}/api/cron/jenga-drift`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-worker-token": SETTLEMENT_WORKER_TOKEN,
        },
        body: JSON.stringify({ limit: 20 }),
    });
    if (!response.ok) {
        const text = await response.text();
        console.warn("Jenga drift endpoint failed:", response.status, text);
        return;
    }
    const payload = await response.json().catch(() => ({}));
    if (typeof payload?.unresolvedDriftCount === "number") {
        unresolvedDriftGauge.set(payload.unresolvedDriftCount);
    }
    if (typeof payload?.unresolvedOverSlaCount === "number") {
        unresolvedOverSlaGauge.set(payload.unresolvedOverSlaCount);
    }
    if ((payload?.driftCreated || 0) > 0) {
        console.info("[jenga.drift] created", payload.driftCreated);
    }
}

async function loop() {
    const sleepMs = Math.max(500, Number(WORKER_POLL_INTERVAL_MS) || 1500);
    const reconcileEvery = Math.max(1, Number(WORKER_JENGA_RECONCILE_EVERY_LOOPS) || 20);
    const driftEvery = Math.max(1, Number(WORKER_JENGA_DRIFT_CHECK_EVERY_LOOPS) || 40);
    let loops = 0;
    while (true) {
        try {
            await processSingleJob();
            loops += 1;
            if (loops % reconcileEvery === 0) {
                await runJengaReconcile();
            }
            if (loops % driftEvery === 0) {
                await runJengaDriftCheck();
            }
        } catch (err) {
            jobsFailed.inc();
            console.error("Worker loop error:", err);
        }
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
}

void loop();

