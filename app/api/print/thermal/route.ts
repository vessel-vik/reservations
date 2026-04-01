import { NextRequest, NextResponse } from 'next/server';
import { getOrder, getOrdersByTable } from '@/lib/actions/pos.actions';
import { Order } from '@/types/pos.types';

/**
 * Thermal Printer API Endpoint
 * Generates ESC/POS commands for thermal receipt printers
 * Supports USB and Network printers
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId, printerType = 'usb', tableNumber, lineWidth = 32, terminalName, characterSet } = body;
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

        // Generate ESC/POS commands (as a byte array)
        const escposCommands = orders.length === 1
            ? generateESCPOSReceipt(orders[0], config)
            : generateESCPOSReceiptForOrders(tableNumber ?? null, orders, config);

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

/**
 * Generate ESC/POS commands for thermal receipt
 * Standard 80mm thermal paper format
 */
function generateESCPOSReceipt(order: Order, config: any): number[] {
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
    commands.push(ESC, 0x40); // ESC @ - Initialize
    commands.push(ESC, 0x61, 0x01); // Center align

    // Header - Restaurant Name
    commands.push(ESC, 0x21, 0x30); // Double height + width
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10); // Normal + bold
    commands.push(...encode('LOUNGE\n'));
    commands.push(ESC, 0x21, 0x00); // Normal

    // Address
    commands.push(...encode('Northern Bypass, Thome\n'));
    commands.push(...encode('After Windsor, Nairobi\n'));
    commands.push(...encode('Tel: +254 757 650 125\n'));
    commands.push(...encode('info@ampm.co.ke\n'));

    if (config.terminalName) {
        commands.push(...encode(center(`Terminal: ${config.terminalName}`, lineWidth) + '\n'));
    }

    // Separator
    commands.push(...encode(separator));

    // Order Details (Left align)
    commands.push(ESC, 0x61, 0x00); // Left align
    commands.push(...encode(`Order #: ${order.orderNumber}\n`));
    commands.push(...encode(`Date: ${new Date(order.orderTime).toLocaleDateString('en-KE')}\n`));
    commands.push(...encode(`Time: ${new Date(order.orderTime).toLocaleTimeString('en-KE')}\n`));
    commands.push(...encode(`Server: ${order.waiterName}\n`));

    // Table & Party Info
    if (order.tableNumber) {
        commands.push(ESC, 0x21, 0x10); // Bold
        commands.push(...encode(`Table: ${order.tableNumber}`));
        commands.push(...encode(`  Guests: ${order.guestCount || 'N/A'}\n`));
        commands.push(ESC, 0x21, 0x00); // Normal
    } else {
        commands.push(...encode(`Type: ${order.type || 'Dine-in'}\n\n`));
    }

    commands.push(...encode(separator));

    // Items header
    // Dynamic spacing for 4 columns: Qty(3) Item(Variable) Unit(9) Total(9)
    const qtyW = 3;
    const unitW = 9;
    const totalW = 9;
    const nameW = lineWidth - qtyW - unitW - totalW;
    
    const header = pad('Qty', qtyW) + pad('Item', nameW) + pad('Unit', unitW).padStart(unitW, ' ') + pad('Total', totalW).padStart(totalW, ' ');
    commands.push(...encode(header + '\n'));
    commands.push(...encode(separator));

    // Items - Format: "1 x Jager  1,500.00  1,500.00"
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    items.forEach((item: any) => {
        const qty = String(item.quantity) + 'x';
        const name = item.name.substring(0, nameW - 1);
        const unitPrice = item.price.toLocaleString('en-KE', { minimumFractionDigits: 2 });
        const totalPrice = (item.price * item.quantity).toLocaleString('en-KE', { minimumFractionDigits: 2 });
        
        const line = pad(qty, qtyW) + pad(name, nameW) + unitPrice.padStart(unitW, ' ') + totalPrice.padStart(totalW, ' ');
        commands.push(...encode(line + '\n'));
    });

    commands.push(...encode(separator));

    // Totals
    commands.push(...encode(pad('Subtotal:', lineWidth - 15) + order.totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(15, ' ') + '\n'));
    commands.push(...encode(center('*Prices include VAT', lineWidth) + '\n'));
    commands.push(...encode(equals));

    // Grand Total (Bold + Centered)
    commands.push(ESC, 0x61, 0x01); // Center align
    commands.push(ESC, 0x21, 0x30); // Double height + width
    commands.push(...encode(`GRAND TOTAL\n`));
    commands.push(ESC, 0x21, 0x10); // Bold + Normal height
    commands.push(...encode(`KSh ${order.totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}\n`));
    commands.push(ESC, 0x21, 0x00); // Normal
    
    commands.push(ESC, 0x61, 0x01); // Center align
    commands.push(...encode(equals));

    // Payment status (Center)
    commands.push(ESC, 0x61, 0x01); // Center align
    commands.push(ESC, 0x21, 0x10); // Bold
    commands.push(...encode('PAID - THANK YOU\n'));
    commands.push(ESC, 0x21, 0x00); // Normal

    // QR Code (if supported)
    commands.push(...encode('\n'));
    commands.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // QR Code model
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08); // QR Code size
    commands.push(
        GS,
        0x28,
        0x6B,
        String.fromCharCode(order.orderNumber.length + 3).charCodeAt(0),
        0x00,
        0x31,
        0x50,
        0x30,
        ...encode(order.orderNumber)
    ); // QR Data
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30); // Print QR

    commands.push(...encode('\n'));
    commands.push(...encode('Scan for order details\n'));
    commands.push(...encode('& loyalty points\n'));

    // Footer
    commands.push(...encode('\n'));
    commands.push(...encode('Thank you for choosing AM | PM\n'));
    commands.push(...encode('We hope to see you again soon\n'));

    // Cut paper
    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // Full cut

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

        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        items.forEach((item: any) => {
            const qty = String(item.quantity) + 'x';
            const name = item.name.substring(0, nameW - 1);
            const unitPrice = item.price.toLocaleString('en-KE', { minimumFractionDigits: 2 });
            const totalPrice = (item.price * item.quantity).toLocaleString('en-KE', { minimumFractionDigits: 2 });
            
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
