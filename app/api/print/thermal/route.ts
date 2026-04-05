import { NextRequest, NextResponse } from 'next/server';
import { getOrder, getOrdersByTable } from '@/lib/actions/pos.actions';
import { Order } from '@/types/pos.types';

function safeParseOrderItems(order: Order): any[] {
    try {
        const raw = order.items as unknown;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        return [];
    } catch {
        return [];
    }
}

/**
 * Thermal Printer API Endpoint
 * Generates ESC/POS commands for thermal receipt printers
 * Supports USB and Network printers
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId, printerType = 'usb', tableNumber, lineWidth = 32, terminalName, characterSet, jobType } = body;
        const config = { lineWidth, terminalName, characterSet };

        if (!orderId && typeof tableNumber === 'undefined') {
            return NextResponse.json(
                { error: 'Order ID or table number is required' },
                { status: 400 }
            );
        }

        let orders: Order[] = [];
        let order: Order | null = null;

        // If a table number is provided, aggregate all open orders for that table
        if (typeof tableNumber !== 'undefined') {
            const parsedTableNumber = Number(tableNumber);
            if (Number.isNaN(parsedTableNumber)) {
                return NextResponse.json(
                    { error: 'Invalid table number' },
                    { status: 400 }
                );
            }

            orders = await getOrdersByTable(parsedTableNumber, true);
        }

        // If a single order is requested, fetch it
        if (orderId) {
            try {
                order = await getOrder(orderId);
            } catch (fetchError) {
                console.error('Error fetching order:', fetchError);
                order = null;
            }

            // If order not found and it's a test order, create a mock order
            if (!order && orderId.startsWith('TEST-')) {
                order = createMockOrder(orderId);
            }

            if (order) {
                orders = [order];
            }
        }

        if (!orders || orders.length === 0) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }

        // Generate ESC/POS commands based on job type
        let escposCommands: number[];

        if (jobType === 'kitchen_docket' || jobType === 'captain_docket') {
            const singleOrder = orders[0];
            if (!singleOrder) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }
            escposCommands = generateESCPOSKitchenDocket(singleOrder, config);
        } else if (jobType === 'kitchen_delta') {
            const deltaItems = (body as { deltaItems?: unknown }).deltaItems;
            if (!orderId) {
                return NextResponse.json({ error: 'orderId is required for kitchen_delta' }, { status: 400 });
            }
            if (!Array.isArray(deltaItems) || deltaItems.length === 0) {
                return NextResponse.json({ error: 'deltaItems (non-empty array) is required' }, { status: 400 });
            }
            const singleOrder = orders[0];
            if (!singleOrder) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }
            const normalizedDelta = (deltaItems as { name?: string; quantity?: number; price?: number }[]).map((d) => ({
                name: String(d?.name || 'Item').slice(0, 80),
                quantity: Math.max(1, Math.floor(Number(d?.quantity) || 1)),
                price: typeof d?.price === 'number' ? d.price : undefined,
            }));
            escposCommands = generateESCPOSKitchenDelta(singleOrder, normalizedDelta, config);
        } else {
            // Full receipt or table summary
            escposCommands = orders.length === 1
                ? generateESCPOSReceipt(orders[0], config)
                : generateESCPOSReceiptForOrders(tableNumber ?? null, orders, config);
        }

        return NextResponse.json({
            success: true,
            commands: escposCommands,
            order: {
                orderNumber: orders[0].orderNumber,
                total: orders.reduce((sum, o) => sum + o.totalAmount, 0)
            }
        });

    } catch (error) {
        console.error('Thermal print error:', error);
        return NextResponse.json(
            { error: 'Failed to generate thermal print', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

function generateESCPOSReceipt(order: Order, config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 48; // 80mm at high density = 48 chars
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const center = (str: string, len: number) => {
        const space = Math.max(0, Math.floor((len - str.length) / 2));
        return ' '.repeat(space) + str;
    };
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const lpad = (str: string, len: number) => str.slice(-len).padStart(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';

    const now = new Date(order.orderTime || Date.now());
    const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Init
    commands.push(ESC, 0x40);

    // Two-column header: address left | brand center | contact right
    const colW = Math.floor(lineWidth / 3);
    const headerRows = [
        ['Northern Bypass, Thome', 'AM | PM', 'Tel: +254 757 650 125'],
        ['After Windsor, Nairobi', 'LOUNGE', 'info@ampm.co.ke'],
        ['', '', config.terminalName ? `Terminal: ${config.terminalName}` : ''],
    ];
    commands.push(ESC, 0x61, 0x00); // left
    headerRows.forEach(([left, mid, right]) => {
        if (!left && !mid && !right) return;
        const l = rpad(left, colW);
        const m = center(mid, colW);
        const r = lpad(right, colW);
        commands.push(...encode(l + m + r + '\n'));
    });

    commands.push(...encode(separator));
    commands.push(ESC, 0x61, 0x00); // left

    // Order details
    commands.push(...encode(`ORD #: ${order.orderNumber} | Date: ${dateStr} | Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName} | Table: ${order.tableNumber ?? '—'} | Guests: ${order.guestCount ?? 1}\n`));
    commands.push(...encode(separator));

    // Column header: QTY / ITEM DESCRIPTION / TOTAL (KSh)
    const qtyW = 5; const totalColW = 12;
    const descW = lineWidth - qtyW - totalColW;
    commands.push(ESC, 0x21, 0x08); // underline
    commands.push(...encode(rpad('QTY', qtyW) + rpad('ITEM DESCRIPTION', descW) + lpad('TOTAL (KSh)', totalColW) + '\n'));
    commands.push(ESC, 0x21, 0x00);
    commands.push(...encode(separator));

    const items = safeParseOrderItems(order);
    items.forEach((item: any) => {
        const qty = `${Math.max(1, Number(item?.quantity) || 1)}x`;
        const rawName = String(item?.name || 'Item');
        const price = Number(item?.price || 0);
        const qty_ = Number(item?.quantity) || 1;
        const lineTotal = price * qty_;
        const totalStr = lineTotal.toLocaleString('en-KE', { minimumFractionDigits: 0 });

        // Long names wrap to next line
        if (rawName.length > descW - 1) {
            commands.push(...encode(rpad(qty, qtyW) + rpad(rawName.slice(0, descW - 1), descW) + lpad(totalStr, totalColW) + '\n'));
            let remaining = rawName.slice(descW - 1);
            while (remaining.length > 0) {
                commands.push(...encode(rpad('', qtyW) + rpad(remaining.slice(0, descW), descW) + '\n'));
                remaining = remaining.slice(descW);
            }
        } else {
            commands.push(...encode(rpad(qty, qtyW) + rpad(rawName, descW) + lpad(totalStr, totalColW) + '\n'));
        }
    });

    commands.push(...encode(separator));

    // Subtotal + VAT
    const totalAmt = typeof order.totalAmount === 'number' ? order.totalAmount : 0;
    const vatRate = 0.16;
    const subtotalExVat = totalAmt / (1 + vatRate);
    const vatAmt = totalAmt - subtotalExVat;

    const subtotalStr = subtotalExVat.toLocaleString('en-KE', { minimumFractionDigits: 2 });
    const vatStr = vatAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 });

    commands.push(...encode(rpad('Subtotal:', lineWidth - 12) + lpad(subtotalStr, 12) + '\n'));
    commands.push(...encode(rpad('VAT (16%):', lineWidth - 12) + lpad(vatStr, 12) + '\n'));
    commands.push(...encode(separator));

    // GRAND TOTAL — double-height bold
    commands.push(ESC, 0x61, 0x00); // left
    commands.push(ESC, 0x21, 0x30); // double-height bold
    const grandLabel = 'GRAND TOTAL: KSh';
    const grandAmt = totalAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 });
    commands.push(...encode(`${grandLabel} ${grandAmt}\n`));
    commands.push(ESC, 0x21, 0x00);

    // PAID line
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(ESC, 0x21, 0x10); // bold
    commands.push(...encode('PAID - THANK YOU\n'));
    commands.push(ESC, 0x21, 0x00);

    // QR code — encodes orderId
    commands.push(...encode('\n'));
    const qrData = order.$id || order.orderNumber;
    const qrLen = qrData.length;
    commands.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08);        // size
    commands.push(GS, 0x28, 0x6B, (qrLen + 3) & 0xFF, 0x00, 0x31, 0x50, 0x30, ...encode(qrData));
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);        // print

    // Footer
    commands.push(...encode('\n'));
    commands.push(ESC, 0x61, 0x01);
    commands.push(...encode('Thank you for choosing AM | PM.\n'));
    commands.push(...encode('We hope to see you again soon.\n'));

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // cut
    return commands;
}

function generateESCPOSReceiptForOrders(tableNumber: number | null, orders: Order[], config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 32;

    const ESC = 0x1B;
    const GS = 0x1D;
    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const pad = (str: string, len: number) => str.padEnd(len, ' ');
    const center = (str: string, len: number) => {
        const space = Math.max(0, Math.floor((len - str.length) / 2));
        return ' '.repeat(space) + str;
    };
    const separator = '-'.repeat(lineWidth) + '\n';
    const equals = '='.repeat(lineWidth) + '\n';

    // Initialize printer
    commands.push(ESC, 0x40); // ESC @
    commands.push(ESC, 0x61, 0x01); // Center align

    // Header
    commands.push(ESC, 0x21, 0x30); // Double height + width
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10); // Normal + bold
    commands.push(...encode('LOUNGE\n'));
    commands.push(ESC, 0x21, 0x00); // Normal

    // Tab Header
    commands.push(...encode(separator));
    commands.push(ESC, 0x21, 0x10); // Bold
    commands.push(...encode(center(`TAB${tableNumber !== null ? ` - Table ${tableNumber}` : ''}`, lineWidth) + '\n'));
    commands.push(ESC, 0x21, 0x00); // Normal
    commands.push(...encode(separator));

    if (config.terminalName) {
        commands.push(...encode(center(`Terminal: ${config.terminalName}`, lineWidth) + '\n'));
    }

    // Orders
    let grandTotal = 0;
    orders.forEach((order) => {
        const orderTotal = order.totalAmount;
        grandTotal += orderTotal;

        commands.push(ESC, 0x61, 0x00); // Left align
        commands.push(...encode(`Order: ${order.orderNumber}\n`));
        commands.push(...encode(`Date: ${new Date(order.orderTime).toLocaleDateString('en-KE')} ${new Date(order.orderTime).toLocaleTimeString('en-KE')}\n`));

        // Items - Dynamic spacing for 4 columns
        const qtyW = 3;
        const unitW = 9;
        const totalW = 9;
        const nameW = lineWidth - qtyW - unitW - totalW;

        const items = safeParseOrderItems(order);
        items.forEach((item: any) => {
            const q = Math.max(0, Number(item?.quantity) || 0) || 1;
            const qty = String(q) + 'x';
            const name = String(item?.name ?? 'Item').substring(0, Math.max(1, nameW - 1));
            const price = typeof item?.price === 'number' && !Number.isNaN(item.price) ? item.price : 0;
            const unitPrice = price.toLocaleString('en-KE', { minimumFractionDigits: 2 });
            const totalPrice = (price * q).toLocaleString('en-KE', { minimumFractionDigits: 2 });

            const line = pad(qty, qtyW) + pad(name, nameW) + unitPrice.padStart(unitW, ' ') + totalPrice.padStart(totalW, ' ');
            commands.push(...encode(line + '\n'));
        });

        commands.push(...encode(pad('Order Total:', lineWidth - 15) + orderTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(15, ' ') + '\n'));
        commands.push(...encode(separator));
    });

    // Grand Total
    commands.push(ESC, 0x61, 0x01); // Center align
    commands.push(ESC, 0x21, 0x30); // Double height + width
    commands.push(...encode(`GRAND TOTAL\n`));
    commands.push(ESC, 0x21, 0x10); // Bold + Normal height
    commands.push(...encode(`KSh ${grandTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}\n`));
    commands.push(ESC, 0x21, 0x00); // Normal
    
    commands.push(ESC, 0x61, 0x01); // Center align
    commands.push(...encode(equals));

    // Footer
    commands.push(...encode('\n'));
    commands.push(...encode('Thank you for choosing AM | PM\n'));
    commands.push(...encode('Please settle your tab at the counter.\n'));

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // Full cut

    return commands;
}

function generateESCPOSKitchenDelta(order: Order, deltaItems: { name: string; quantity: number; price?: number }[], config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 32;
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';
    const timeStr = new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    commands.push(ESC, 0x40);
    commands.push(ESC, 0x61, 0x01); // center

    // Header
    commands.push(ESC, 0x21, 0x30);
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10);
    commands.push(...encode('CAPTAIN ORDER\n'));
    commands.push(ESC, 0x21, 0x00);
    if (config.terminalName) {
        commands.push(...encode(`Terminal: ${config.terminalName}\n`));
    }

    commands.push(...encode(separator));

    // ADDITION banner — inverted print
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(ESC, 0x21, 0x10); // bold
    commands.push(0x1D, 0x42, 0x01); // GS B 1 — reverse video on
    commands.push(...encode(' *** ADDITION - NOT A FULL ORDER *** \n'));
    commands.push(0x1D, 0x42, 0x00); // GS B 0 — reverse video off
    commands.push(ESC, 0x21, 0x00);

    commands.push(ESC, 0x61, 0x00); // left
    commands.push(...encode(`Order #: ${order.orderNumber}\n`));
    commands.push(...encode(`Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName}\n`));
    commands.push(...encode(`Table: #${order.tableNumber ?? '—'}\n`));
    commands.push(...encode(separator));

    commands.push(ESC, 0x21, 0x10);
    commands.push(...encode('NEW ITEMS ONLY\n'));
    commands.push(ESC, 0x21, 0x00);

    deltaItems.forEach((row) => {
        const qty = `${row.quantity}x`;
        const name = row.name.substring(0, Math.max(4, lineWidth - qty.length - 2));
        commands.push(...encode(`${qty} ${name}\n`));
    });

    const additionTotal = deltaItems.reduce((s, d) => s + (d.price ?? 0) * d.quantity, 0);
    if (additionTotal > 0) {
        commands.push(...encode(separator));
        const totalLine = rpad('ADDITION:', lineWidth - 12) +
            additionTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(12, ' ');
        commands.push(ESC, 0x21, 0x10);
        commands.push(...encode(totalLine + '\n'));
        commands.push(ESC, 0x21, 0x00);
    }

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00);
    return commands;
}

function generateESCPOSKitchenDocket(order: Order, config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 32;
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const lpad = (str: string, len: number) => str.slice(0, len).padStart(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';

    const now = new Date(order.orderTime || Date.now());
    const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Init
    commands.push(ESC, 0x40);
    commands.push(ESC, 0x61, 0x01); // center

    // Header
    commands.push(ESC, 0x21, 0x30); // double-height bold
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10); // bold normal height
    commands.push(...encode('CAPTAIN ORDER\n'));
    commands.push(ESC, 0x21, 0x00); // normal
    if (config.terminalName) {
        commands.push(...encode(`Terminal: ${config.terminalName}\n`));
    }

    commands.push(...encode(separator));
    commands.push(ESC, 0x61, 0x00); // left

    // Order metadata
    commands.push(...encode(`Order #: ${order.orderNumber}\n`));
    commands.push(...encode(`Date: ${dateStr}\n`));
    commands.push(...encode(`Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName}\n`));
    commands.push(...encode(`Type: ${order.type || 'dine_in'}  |  Table: #${order.tableNumber ?? '—'}\n`));
    commands.push(...encode(separator));

    // Items header
    const qtyW = 4; const priceW = 9;
    const nameW = lineWidth - qtyW - priceW;
    commands.push(ESC, 0x21, 0x08); // underline
    commands.push(...encode(rpad('Qty', qtyW) + rpad('Item', nameW) + lpad('Price', priceW) + '\n'));
    commands.push(ESC, 0x21, 0x00);
    commands.push(...encode(separator));

    const items = safeParseOrderItems(order);
    items.forEach((item: any) => {
        const qty = `${Math.max(1, Number(item?.quantity) || 1)}x`;
        const name = rpad(String(item?.name || 'Item'), nameW);
        const price = (Number(item?.price || 0) * Math.max(1, Number(item?.quantity) || 1))
            .toLocaleString('en-KE', { minimumFractionDigits: 2 });
        commands.push(...encode(rpad(qty, qtyW) + name + lpad(price, priceW) + '\n'));
    });

    commands.push(...encode(separator));

    // Total
    const totalAmt = typeof order.totalAmount === 'number' ? order.totalAmount : 0;
    commands.push(ESC, 0x21, 0x10); // bold
    const totalLabel = rpad('TOTAL:', lineWidth - 12);
    const totalVal = totalAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(12, ' ');
    commands.push(...encode(totalLabel + totalVal + '\n'));
    commands.push(ESC, 0x21, 0x00);

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // cut
    return commands;
}

function formatKES(amount: number): string {
    return `KSh ${(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Create a mock order for testing purposes
 */
function createMockOrder(orderId: string): Order {
    const now = new Date().toISOString();

    return {
        $id: `mock-${orderId}`,
        orderNumber: orderId,
        type: 'dine-in',
        status: 'completed',
        tableNumber: 5,
        customerName: 'Test Customer',
        guestCount: 2,
        waiterName: 'Test Server',
        waiterId: 'test-waiter-id',
        subtotal: 2699.94,
        taxAmount: 431.99,
        serviceCharge: 0,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: 3131.93,
        paymentStatus: 'paid',
        orderTime: now,
        priority: 'normal',
        items: [
            {
                $id: 'mock-item-1',
                name: 'Grilled Chicken Burger',
                price: 1499.50,
                quantity: 1,
                notes: 'Medium rare',
                description: '',
                category: 'Burgers',
                isAvailable: true,
                preparationTime: 15,
                popularity: 0,
                ingredients: [],
                allergens: [],
                calories: 0,
                isVegetarian: false,
                isVegan: false,
                isGlutenFree: false,
            },
            {
                $id: 'mock-item-2',
                name: 'Caesar Salad',
                price: 899.50,
                quantity: 1,
                notes: 'No croutons',
                description: '',
                category: 'Salads',
                isAvailable: true,
                preparationTime: 10,
                popularity: 0,
                ingredients: [],
                allergens: [],
                calories: 0,
                isVegetarian: true,
                isVegan: false,
                isGlutenFree: false,
            },
            {
                $id: 'mock-item-3',
                name: 'Sparkling Water',
                price: 300.94,
                quantity: 1,
                notes: '',
                description: '',
                category: 'Drinks',
                isAvailable: true,
                preparationTime: 2,
                popularity: 0,
                ingredients: [],
                allergens: [],
                calories: 0,
                isVegetarian: true,
                isVegan: true,
                isGlutenFree: true,
            }
        ],
        specialInstructions: 'Test order for printer setup',
        $createdAt: now,
        $updatedAt: now
    };
}
