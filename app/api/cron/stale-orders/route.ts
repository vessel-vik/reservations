import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from '@/lib/appwrite.config';
import { Query } from 'node-appwrite';

/** Start of the current calendar day in Africa/Nairobi, as ISO UTC. */
function nairobiStartOfTodayISO(reference = new Date()): string {
    const ymd = reference.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    return new Date(`${ymd}T00:00:00+03:00`).toISOString();
}

/**
 * Daily hygiene: soft-remove abandoned unpaid orders from **before today** (Nairobi).
 * Protected by CRON_SECRET. Set CRON_STALE_ORDERS_BUSINESS_ID for multi-tenant projects.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const businessId = process.env.CRON_STALE_ORDERS_BUSINESS_ID?.trim();
    if (!businessId) {
        return NextResponse.json({
            ok: true,
            skipped: true,
            reason: 'Set CRON_STALE_ORDERS_BUSINESS_ID to your Appwrite businessId (Clerk org id) to run cleanup.',
        });
    }

    const cutoff = nairobiStartOfTodayISO();
    const queries = [
        Query.equal('businessId', businessId),
        Query.equal('paymentStatus', 'unpaid'),
        Query.lessThan('orderTime', cutoff),
        Query.limit(250),
    ];

    let docs: { $id: string; specialInstructions?: string }[] = [];
    try {
        const res = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, queries);
        docs = res.documents as { $id: string; specialInstructions?: string }[];
    } catch (e) {
        console.error('stale-orders list failed:', e);
        return NextResponse.json({ error: 'List failed' }, { status: 500 });
    }

    let updated = 0;
    let failed = 0;

    for (const doc of docs) {
        const tag = '\n[AUTO_STALE_CLEANUP]';
        const prev = String(doc.specialInstructions || '');
        const nextSi = (prev + tag).slice(0, 950);

        try {
            await databases.updateDocument(DATABASE_ID, ORDERS_COLLECTION_ID, doc.$id, {
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                deletedBy: 'cron/stale-orders',
                deletionReason: 'Automated stale open tab (unpaid, before today Nairobi)',
                paymentStatus: 'cancelled',
                specialInstructions: nextSi,
            });
            updated++;
        } catch {
            try {
                await databases.updateDocument(DATABASE_ID, ORDERS_COLLECTION_ID, doc.$id, {
                    paymentStatus: 'cancelled',
                    specialInstructions: nextSi,
                });
                updated++;
            } catch (e2) {
                console.error(`stale-orders skip ${doc.$id}:`, e2);
                failed++;
            }
        }
    }

    return NextResponse.json({
        ok: true,
        cutoff,
        scanned: docs.length,
        updated,
        failed,
    });
}
