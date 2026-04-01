"use client";

import { Info, HelpCircle, Layout, Type, Scissors, ExternalLink, Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";

interface PrinterCalibrationInfoProps {
    vendorId?: number;
    productId?: number;
}

export function PrinterCalibrationInfo({ vendorId, productId }: PrinterCalibrationInfoProps) {
    const [copied, setCopied] = useState(false);

    const isLinux = typeof window !== 'undefined' && (
        window.navigator.platform.toLowerCase().includes('linux') || 
        window.navigator.userAgent.toLowerCase().includes('linux')
    );

    const vidHex = vendorId ? vendorId.toString(16).padStart(4, '0') : '04b8';
    const pidHex = productId ? productId.toString(16).padStart(4, '0') : '0202';

    const udevRule = `echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="${vidHex}", ATTR{idProduct}=="${pidHex}", MODE="0666", GROUP="plugdev", RUN+="/bin/sh -c \\"echo -n %k > /sys/bus/usb/drivers/usblp/unbind\\""' | sudo tee /etc/udev/rules.d/99-printer.rules && sudo udevadm control --reload-rules && sudo udevadm trigger`;

    const handleCopy = () => {
        navigator.clipboard.writeText(udevRule);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-emerald-900">Printer Calibration Guide</h3>
            </div>
            
            <div className="p-4 space-y-6">
                {/* Line Width */}
                <section className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                        <Layout className="w-4 h-4" />
                        <h4>Line Width (Paper Size)</h4>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                        Matches your thermal paper width. If the text is cutting off on the right, try a smaller number. If it looks too narrow with large margins, try a larger number.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="p-2 bg-gray-50 rounded border border-gray-100 italic text-[10px]">
                            <strong>32 chars:</strong> Standard 58mm POS paper
                        </div>
                        <div className="p-2 bg-gray-50 rounded border border-gray-100 italic text-[10px]">
                            <strong>42 chars:</strong> Standard 80mm POS paper
                        </div>
                    </div>
                </section>

                {/* Character Set */}
                <section className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                        <Type className="w-4 h-4" />
                        <h4>Character Encoding</h4>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                        Determines how local symbols (like KSh) are printed. <strong>Standard (US)</strong> works for most E-POS and Epson printers. 
                    </p>
                </section>

                {/* Hardware Troubleshooting */}
                <section className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                        <HelpCircle className="w-4 h-4" />
                        <h4>Hardware Tips</h4>
                    </div>
                    <ul className="text-xs text-gray-600 space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span><strong>No Print?</strong> Check if the USB cable is tight and the "Online" light is on.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span><strong>Garbage Text?</strong> Ensure you aren't using a "Network" config for a USB printer.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span><strong>No Cut?</strong> Some older printers don't support the auto-cutter command.</span>
                        </li>
                    </ul>
                </section>

                {/* OS Specific Permission Fixes */}
                <section className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                        <Terminal className="w-4 h-4" />
                        <h4>Resolve "Access Denied"</h4>
                    </div>

                    {isLinux ? (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                                    Step 1: Grant Permissions
                                </p>
                                <div className="relative group">
                                    <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                                        {udevRule}
                                    </pre>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(udevRule);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        className="absolute top-2 right-2 p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
                                    >
                                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-gray-100 border-dashed">
                                <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                                    Step 2: Unload Kernel Driver (If "Unable to claim" appears)
                                </p>
                                <p className="text-[10px] text-gray-500 mb-1">
                                    Linux often catches the printer with a default driver (usblp) that prevents the browser from using it. Run this to release it:
                                </p>
                                <pre className="p-2 bg-emerald-900 text-emerald-100 rounded-lg text-[10px] font-mono">
                                    sudo modprobe -r usblp
                                </pre>
                                <p className="text-[10px] text-gray-500 italic">
                                    * Run this if you see "Unable to claim interface" or "Already claimed" errors.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-600 leading-relaxed">
                                On Windows, you must replace the default driver with <strong>WinUSB</strong> using Zadig.
                            </p>
                            <a
                                href="https://zadig.akeo.ie/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors group"
                            >
                                <span>Download Zadig (Windows)</span>
                                <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
