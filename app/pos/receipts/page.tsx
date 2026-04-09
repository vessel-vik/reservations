"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintOpsCenter } from "@/components/admin/PrintOpsCenter";

export default function POSReceiptsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Receipt Log</h1>
            <p className="text-sm text-neutral-400">
              All paid receipt print jobs are logged here for audit and reprint.
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to POS
          </Link>
        </div>

        <PrintOpsCenter defaultTab="receipt" />
      </div>
    </div>
  );
}

