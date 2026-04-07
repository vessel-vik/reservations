/**
 * Thermal Printer Client Utility
 * Handles communication with thermal printers via USB/Network
 */

export interface PrinterConfig {
    type: 'usb' | 'network';
    vendorId?: number;
    productId?: number;
    ipAddress?: string;
    port?: number;
    deviceName?: string;
    // New persistent calibration settings
    terminalName?: string;
    lineWidth?: number; // Default 32, max 48
    characterSet?: string; // e.g. 'PC437'
}

const STORAGE_KEY = 'ampm_pos_printer_config';

export interface DetectedDevice {
    vendorId: number;
    productId: number;
    productName?: string;
    manufacturerName?: string;
    serialNumber?: string;
}

export class ThermalPrinterClient {
    private config: PrinterConfig;

    constructor(config: PrinterConfig) {
        this.config = config;
    }

    /**
     * Save printer configuration to local storage
     */
    static saveConfig(config: PrinterConfig): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    /**
     * Load printer configuration from local storage
     */
    static loadConfig(): PrinterConfig | null {
        if (typeof window === 'undefined') return null;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Failed to parse saved printer config:', e);
            return null;
        }
    }

    /**
     * Enumerate all connected USB devices
     * Helps identify printer vendor/product IDs
     */
    static async enumerateUSBDevices(): Promise<DetectedDevice[]> {
        try {
            if (!('usb' in navigator)) {
                throw new Error('Web USB API not supported. Use Chrome/Edge browser.');
            }

            const devices = await (navigator as any).usb.getDevices();
            return devices.map((device: any) => ({
                vendorId: device.vendorId,
                productId: device.productId,
                productName: device.productName,
                manufacturerName: device.manufacturerName,
                serialNumber: device.serialNumber
            }));
        } catch (error) {
            console.error('USB enumeration failed:', error);
            throw error;
        }
    }

    /**
     * Attempt to find a previously authorized printer
     * or a standard POS printer currently connected.
     */
    static async autoDetect(): Promise<DetectedDevice | null> {
        try {
            if (typeof navigator === 'undefined' || !('usb' in navigator)) return null;
            const devices = await (navigator as any).usb.getDevices();
            if (devices.length === 0) return null;

            // 1. Look for a device that matches our known common printers
            const knownVIDs = Object.values(COMMON_PRINTERS)
                .map((p: any) => p.vendorId)
                .filter(Boolean);
            const commonDevice = devices.find((d: any) => 
                knownVIDs.includes(d.vendorId) || 
                d.productName?.toLowerCase().includes('printer') ||
                d.productName?.toLowerCase().includes('epos') ||
                d.productName?.toLowerCase().includes('tm-')
            );

            if (commonDevice) {
                return {
                    vendorId: commonDevice.vendorId,
                    productId: commonDevice.productId,
                    productName: commonDevice.productName,
                    manufacturerName: commonDevice.manufacturerName
                };
            }

            // 2. Return the first available device if only one is present
            if (devices.length === 1) {
                return {
                    vendorId: devices[0].vendorId,
                    productId: devices[0].productId,
                    productName: devices[0].productName,
                    manufacturerName: devices[0].manufacturerName
                };
            }

            return null;
        } catch (error) {
            console.error('Auto-detect failed:', error);
            return null;
        }
    }

    /**
     * Request user to select a USB device
     * Returns device info for configuration
     */
    static async requestUSBDevice(): Promise<DetectedDevice | null> {
        try {
            if (!('usb' in navigator)) {
                throw new Error('Web USB API not supported. Use Chrome/Edge browser.');
            }

            const device = await (navigator as any).usb.requestDevice({
                filters: [] // Allow any device for discovery
            });

            return {
                vendorId: device.vendorId,
                productId: device.productId,
                productName: device.productName,
                manufacturerName: device.manufacturerName,
                serialNumber: device.serialNumber
            };
        } catch (error) {
            if (error instanceof DOMException && error.name === 'NotFoundError') {
                return null; // User cancelled selection
            }
            console.error('USB device request failed:', error);
            throw error;
        }
    }

    /**
     * Print receipt to thermal printer
     */
    async printReceipt(orderId: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Call our API endpoint to generate ESC/POS commands
            const response = await fetch('/api/print/thermal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    orderId,
                    printerType: this.config.type,
                    terminalName: this.config.terminalName,
                    lineWidth: this.config.lineWidth || 32,
                    characterSet: this.config.characterSet
                })
            });

            if (!response.ok) {
                // API returned an error (e.g. order not found)
                let errorBody: any = {};
                try {
                    errorBody = await response.json();
                } catch {}
                return {
                    success: false,
                    error: errorBody.error || 'Print failed'
                };
            }

            const { commands } = await response.json();

            return this.printRawCommands(commands as number[]);
        } catch (error) {
            console.error('Thermal print error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Captain / kitchen docket (prep slip) for a single order — not a paid receipt.
     */
    async printKitchenDocket(orderId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch('/api/print/thermal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    jobType: 'kitchen_docket',
                    printerType: this.config.type,
                    terminalName: this.config.terminalName,
                    lineWidth: this.config.lineWidth || 32,
                    characterSet: this.config.characterSet,
                }),
            });

            if (!response.ok) {
                let errorBody: any = {};
                try {
                    errorBody = await response.json();
                } catch {}
                return { success: false, error: errorBody.error || 'Docket print failed' };
            }

            const { commands } = await response.json();
            return this.printRawCommands(commands as number[]);
        } catch (error) {
            console.error('Kitchen docket print error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /** Delta slip: only items added since last kitchen print. */
    async printKitchenDelta(
        orderId: string,
        deltaItems: { name: string; quantity: number }[]
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch('/api/print/thermal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    jobType: 'kitchen_delta',
                    deltaItems,
                    printerType: this.config.type,
                    terminalName: this.config.terminalName,
                    lineWidth: this.config.lineWidth || 32,
                    characterSet: this.config.characterSet,
                }),
            });

            if (!response.ok) {
                let errorBody: any = {};
                try {
                    errorBody = await response.json();
                } catch {}
                return { success: false, error: errorBody.error || 'Delta docket failed' };
            }

            const { commands } = await response.json();
            return this.printRawCommands(commands as number[]);
        } catch (error) {
            console.error('Kitchen delta print error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Send pre-built ESC/POS byte commands to the configured printer (USB or network).
     */
    async printRawCommands(commands: number[]): Promise<{ success: boolean; error?: string }> {
        if (!Array.isArray(commands) || commands.length === 0) {
            return { success: false, error: 'No print data from server' };
        }
        try {
            if (this.config.type === 'usb') {
                return await this.printViaUSB(commands);
            }
            return await this.printViaNetwork(commands);
        } catch (error) {
            console.error('printRawCommands error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Check if Web USB API is supported and available
     */
    static checkWebUSBSupport(): { supported: boolean; reason?: string } {
        if (typeof window === 'undefined') {
            return { supported: false, reason: 'Not running in browser environment' };
        }

        if (!('usb' in navigator)) {
            return { supported: false, reason: 'Web USB API not supported in this browser. Use Chrome, Edge, or Opera.' };
        }

        // Check if we're on HTTPS or localhost
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        if (!isSecure) {
            return { supported: false, reason: 'Web USB requires HTTPS or localhost. Current protocol: ' + window.location.protocol };
        }

        return { supported: true };
    }

    /**
     * Print via USB using Web USB API
     * Requires user permission
     */
    private async printViaUSB(commands: number[] | string[]): Promise<{ success: boolean; error?: string }> {
        try {
            // Check Web USB support first
            const usbCheck = ThermalPrinterClient.checkWebUSBSupport();
            if (!usbCheck.supported) {
                throw new Error(usbCheck.reason);
            }

            let device: any;

            // If we have specific vendor/product IDs, try to get the device directly
            if (this.config.vendorId && this.config.productId) {
                try {
                    const devices = await (navigator as any).usb.getDevices();
                    device = devices.find((d: any) =>
                        d.vendorId === this.config.vendorId &&
                        d.productId === this.config.productId
                    );

                    if (!device) {
                        throw new Error(`Printer not found. Expected Vendor: 0x${this.config.vendorId?.toString(16)}, Product: 0x${this.config.productId?.toString(16)}`);
                    }
                } catch (error) {
                    // If direct access fails, request permission
                    console.log('Direct device access failed, requesting permission...');
                    device = await (navigator as any).usb.requestDevice({
                        filters: [{
                            vendorId: this.config.vendorId,
                            productId: this.config.productId
                        }]
                    });
                }
            } else {
                // No specific IDs, request user selection
                device = await (navigator as any).usb.requestDevice({
                    filters: [] // Allow any device
                });
            }

            // Open device
            if (!device.opened) {
                await device.open();
            }

            // Select configuration if not already selected
            if (device.configuration === null) {
                await device.selectConfiguration(1);
            }

            // Find an OUT endpoint from any interface/alternate interface
            const config = device.configuration;
            if (!config) {
                throw new Error('No USB configuration available on the device');
            }

            type EndpointInfo = { interfaceNumber: number; alternate: number; endpointNumber: number };
            const candidate: EndpointInfo | null = config.interfaces
                .flatMap((iface: any) => iface.alternates.map((alt: any) => ({ iface, alt })))
                .flatMap(({ iface, alt }: any) =>
                    (alt.endpoints || [])
                        .filter((ep: any) => ep.direction === 'out')
                        .map((ep: any) => ({
                            interfaceNumber: iface.interfaceNumber,
                            alternate: alt.alternateSetting,
                            endpointNumber: ep.endpointNumber
                        }))
                )
                .sort((a: any, b: any) => a.endpointNumber - b.endpointNumber)[0] || null;

            if (!candidate) {
                throw new Error('No OUT endpoint found on the selected USB interface. Ensure this is an ESC/POS-compatible printer.');
            }

            // Claim the interface and select the alternate setting just in case
            try {
                await device.claimInterface(candidate.interfaceNumber);
            } catch (claimError: any) {
                // Some browsers may throw if interface is already claimed. Ignore if that's the case.
                const msg = claimError?.message || '';
                if (!msg.includes('claimed') && !msg.includes('already')) {
                    throw claimError;
                }
            }
            await device.selectAlternateInterface(candidate.interfaceNumber, candidate.alternate);

            // Convert commands to bytes and send to the claimed endpoint
            const encoder = new TextEncoder();

            // If the server returns a byte array, send it in one go.
            if (Array.isArray(commands) && typeof commands[0] === 'number') {
                const data = new Uint8Array(commands as number[]);
                await device.transferOut(candidate.endpointNumber, data);
            } else {
                // Legacy: string list commands (ESC/POS text segments)
                for (const command of commands as string[]) {
                    const data = encoder.encode(command);
                    await device.transferOut(candidate.endpointNumber, data);
                }
            }

            await device.close();

            return { success: true };

        } catch (error) {
            console.error('USB print error:', error);

            let errorMessage = 'USB print failed';

            if (error instanceof DOMException) {
                switch (error.name) {
                    case 'NotFoundError':
                        errorMessage = 'No USB device selected. Please select your thermal printer.';
                        break;
                    case 'NotAllowedError':
                        errorMessage = 'USB access denied. Please grant permission and try again.';
                        break;
                    case 'NotSupportedError':
                        errorMessage = 'USB device not supported or not a valid printer.';
                        break;
                    default:
                        errorMessage = `USB error: ${error.message}`;
                }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Print via Network (TCP/IP)
     * Requires server-side proxy or direct network access
     */
    private async printViaNetwork(commands: number[] | string[]): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch('/api/print/network', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    commands,
                    ipAddress: this.config.ipAddress,
                    port: this.config.port || 9100
                })
            });

            if (!response.ok) {
                throw new Error('Network print failed');
            }

            return { success: true };

        } catch (error) {
            console.error('Network print error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Network print failed'
            };
        }
    }

    /**
     * Test printer connection
     */
    async testPrint(): Promise<boolean> {
        try {
            if (this.config.type === 'usb') {
                // Simple test print via USB
                const device = await (navigator as any).usb.requestDevice({ filters: [] });
                await device.open();
                await device.close();
                return true;
            }
            return true;
        } catch (error) {
            console.error('Printer test failed:', error);
            return false;
        }
    }
}

/**
 * Common thermal printer configurations
 */
export const COMMON_PRINTERS = {
    // Epson TM-T88 series
    EPSON_TM_T88: {
        type: 'usb' as const,
        vendorId: 0x04b8,
        productId: 0x0202
    },
    // Star TSP100 series
    STAR_TSP100: {
        type: 'usb' as const,
        vendorId: 0x0519,
        productId: 0x0003
    },
    // E-POS TEP-220MC (widely used; known vendor/product IDs)
    EPOS_TEP_220MC: {
        type: 'usb' as const,
        vendorId: 0x0471,
        productId: 0x0055,
        deviceName: 'E-POS TEP-220MC',
        lineWidth: 42
    },
    // Xprinter / Generic Chinese POS
    XPRINTER: {
        type: 'usb' as const,
        vendorId: 0x1fc9,
        productId: 0x2016,
        deviceName: 'Xprinter'
    },
    // Generic ESC/POS printer
    GENERIC: {
        type: 'usb' as const
    }
};
