// __tests__/kitchen-print-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import {
    computeKitchenDelta,
    linesFromCartItems,
    mergeKitchenSnapshotIntoSpecialInstructions,
    parseLastKitchenSnapshot,
    stripKitchenPrintedLines,
} from '@/lib/kitchen-print-snapshot';

describe('kitchen-print-snapshot', () => {
    it('computes delta only for new qty', () => {
        const snap = [{ i: 'a', q: 2 }];
        const proposed = [{ $id: 'a', quantity: 5, name: 'Beer' }];
        const { deltaItems, newSnapshot } = computeKitchenDelta(snap, proposed);
        expect(deltaItems).toEqual([{ name: 'Beer', quantity: 3 }]);
        // n must be absent — names are not stored in snapshots
        expect(newSnapshot).toEqual([{ i: 'a', q: 5 }]);
    });

    it('prints full qty for new line id', () => {
        const { deltaItems } = computeKitchenDelta([], [{ $id: 'x', quantity: 2, name: 'Wine' }]);
        expect(deltaItems).toEqual([{ name: 'Wine', quantity: 2 }]);
    });

    it('parses and merges snapshot lines in specialInstructions', () => {
        // Parser must still handle legacy data that contains n
        const si = 'TAB note\n[KITCHEN_PRINTED]{"v":1,"lines":[{"i":"a","q":1,"n":"A"}]}';
        expect(parseLastKitchenSnapshot(si)).toEqual([{ i: 'a', q: 1, n: 'A' }]);
        const merged = mergeKitchenSnapshotIntoSpecialInstructions(si, [{ i: 'a', q: 2 }]);
        expect(merged).toContain('TAB note');
        expect(merged).toContain('[KITCHEN_PRINTED]');
        expect(stripKitchenPrintedLines(merged)).not.toContain('[KITCHEN_PRINTED]');
    });

    it('linesFromCartItems strips name — snapshot under 950 chars for 20 items', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({
            $id: `item${String(i).padStart(16, '0')}`,
            quantity: 2,
            name: `Long Item Name ${i}`,
        }));
        const lines = linesFromCartItems(items);
        // No n field
        expect(lines[0]).not.toHaveProperty('n');
        const si = mergeKitchenSnapshotIntoSpecialInstructions('TAB - Table 1', lines);
        expect(si.length).toBeLessThanOrEqual(950);
    });
});
