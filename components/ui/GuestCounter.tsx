"use client";

import React from "react";
import { Minus, Plus, Users } from "lucide-react";

interface GuestCounterProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    label?: string;
}

export const GuestCounter = ({
    value,
    onChange,
    min = 1,
    max = 20,
    label = "Number of Guests",
}: GuestCounterProps) => {
    const handleIncrement = () => {
        if (value < max) {
            onChange(value + 1);
        }
    };

    const handleDecrement = () => {
        if (value > min) {
            onChange(value - 1);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {label && (
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-500" />
                    {label}
                </label>
            )}
            <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 p-2 rounded-xl">
                <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={value <= min}
                    className="p-3 hover:bg-slate-700/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 bg-slate-700/30"
                    aria-label="Decrease guests"
                >
                    <Minus className="w-5 h-5 text-gray-200" />
                </button>

                <div className="flex-1 text-center">
                    <span className="text-2xl font-bold text-white tabular-nums">
                        {value}
                    </span>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                        {value === 1 ? "Guest" : "Guests"}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={value >= max}
                    className="p-3 hover:bg-slate-700/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 bg-slate-700/30"
                    aria-label="Increase guests"
                >
                    <Plus className="w-5 h-5 text-gray-200" />
                </button>
            </div>
            {value >= max && (
                <p className="text-xs text-amber-500/80 text-center">
                    For larger groups, please contact us directly.
                </p>
            )}
        </div>
    );
};
