"use client";

import { useState, useEffect } from "react";
import { AlertCircle, RotateCcw, Clock, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fetchWithSession } from "@/lib/fetch-with-session";

interface MenuItemVersion {
    $id: string;
    itemId: string;
    versionNumber: number;
    snapshot: string;
    timestamp: string;
    publishedBy: string;
    publisherId: string;
}

interface VersionHistoryPanelProps {
    itemId: string;
    onRevert: (snapshot: any) => void;
    isLoading?: boolean;
}

export function VersionHistoryPanel({ itemId, onRevert, isLoading }: VersionHistoryPanelProps) {
    const [versions, setVersions] = useState<MenuItemVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
    const [expandedField, setExpandedField] = useState<string | null>(null);

    useEffect(() => {
        fetchVersionHistory();
    }, [itemId]);

    const fetchVersionHistory = async () => {
        try {
            setLoading(true);
            const response = await fetchWithSession(`/api/menu/items/${itemId}/versions`);

            if (!response.ok) {
                throw new Error("Failed to fetch version history");
            }

            const data = await response.json();
            setVersions(data.versions || []);
        } catch (error) {
            console.error("Error fetching version history:", error);
            toast.error("Failed to load version history");
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = (version: MenuItemVersion) => {
        try {
            const snapshot = JSON.parse(version.snapshot);
            onRevert(snapshot);
        } catch (error) {
            console.error("Error parsing version snapshot:", error);
            toast.error("Failed to revert version");
        }
    };

    if (loading || isLoading) {
        return (
            <div className="p-4 text-center text-neutral-400">
                Loading version history...
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <div className="p-4 text-center text-neutral-400">
                No version history available
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10">
                <Clock className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Publish History</h3>
                <span className="text-xs text-neutral-400">({versions.length})</span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
                {versions.map((version) => (
                    <div
                        key={version.$id}
                        className="border border-white/5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors"
                    >
                        <button
                            onClick={() => setExpandedVersion(
                                expandedVersion === version.$id ? null : version.$id
                            )}
                            className="w-full p-3 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3 flex-1 text-left">
                                <RotateCcw className="w-4 h-4 text-neutral-400 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        v{version.versionNumber}
                                    </p>
                                    <p className="text-xs text-neutral-400">
                                        {formatDistanceToNow(new Date(version.timestamp), {
                                            addSuffix: true
                                        })}
                                    </p>
                                </div>
                            </div>
                            <ChevronDown
                                className={`w-4 h-4 text-neutral-400 transition-transform ${
                                    expandedVersion === version.$id ? "rotate-180" : ""
                                }`}
                            />
                        </button>

                        {expandedVersion === version.$id && (
                            <div className="border-t border-white/5 p-3 bg-black/40 space-y-3">
                                {/* Published By */}
                                <div className="flex items-center gap-2 text-xs text-neutral-300">
                                    <User className="w-3 h-3" />
                                    <span>Published by {version.publishedBy}</span>
                                </div>

                                {/* Snapshot Preview */}
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-neutral-300">Fields:</p>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {Object.entries(
                                            JSON.parse(version.snapshot)
                                        ).map(([key, value]) => (
                                            <div
                                                key={key}
                                                className="text-xs bg-black/60 rounded p-2 cursor-pointer hover:bg-black/80"
                                                onClick={() => setExpandedField(
                                                    expandedField === key ? null : key
                                                )}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-neutral-400">{key}:</span>
                                                    <ChevronDown
                                                        className={`w-3 h-3 text-neutral-500 transition-transform ${
                                                            expandedField === key
                                                                ? "rotate-180"
                                                                : ""
                                                        }`}
                                                    />
                                                </div>
                                                {expandedField === key && (
                                                    <div className="mt-1 text-emerald-300 whitespace-pre-wrap break-words">
                                                        {typeof value === "string"
                                                            ? value
                                                            : JSON.stringify(value, null, 2)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Revert Button */}
                                <div className="pt-2 border-t border-white/5">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRevert(version)}
                                        className="w-full text-xs"
                                    >
                                        <RotateCcw className="w-3 h-3 mr-1.5" />
                                        Revert to v{version.versionNumber}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
