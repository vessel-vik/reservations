"use client";

import { useEffect, useRef, useState } from "react";
import { client } from "@/lib/appwrite-client";
import { parseMenuRealtimeEvents } from "@/lib/pos-menu-product";

const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;
const ORDERS_COLLECTION_ID = process.env.NEXT_PUBLIC_ORDERS_COLLECTION_ID;

interface UseRealtimeOrdersOptions {
  onNewOrder?: (order: unknown) => void;
  onOrderUpdate?: (order: unknown) => void;
  onOrderDelete?: (orderId: string) => void;
}

/**
 * Single subscription to orders collection. Callbacks are read from a ref so parent
 * re-renders (new inline functions) do not tear down / resubscribe — that was causing
 * WebSocket races with Appwrite's client ("already in CLOSING or CLOSED state").
 */
export function useRealtimeOrders(options: UseRealtimeOrdersOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
      setError(
        "Realtime disabled: set NEXT_PUBLIC_DATABASE_ID and NEXT_PUBLIC_ORDERS_COLLECTION_ID (same values as server DATABASE_ID / ORDERS_COLLECTION_ID)."
      );
      setIsConnected(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("🔌 Subscribing to orders realtime…");
        }

        unsubscribe = client.subscribe(
          `databases.${DATABASE_ID}.collections.${ORDERS_COLLECTION_ID}.documents`,
          (response) => {
            if (cancelled) return;
            setIsConnected(true);
            setLastUpdate(new Date());
            setError(null);

            const { isCreate, isUpdate, isDelete } = parseMenuRealtimeEvents(response.events || []);

            if (process.env.NODE_ENV === "development") {
              console.log("📡 Orders realtime:", response.events);
            }

            const { onNewOrder, onOrderUpdate, onOrderDelete } = optsRef.current;
            const payload = response.payload as Record<string, unknown> | undefined;

            if (isCreate && payload) {
              onNewOrder?.(payload);
            }
            if (isUpdate && payload) {
              onOrderUpdate?.(payload);
            }
            if (isDelete && payload?.$id != null) {
              onOrderDelete?.(String(payload.$id));
            }
          }
        );
      } catch (err) {
        if (cancelled) return;
        console.error("❌ Realtime subscribe error:", err);
        setIsConnected(false);
        setError(err instanceof Error ? err.message : "Connection failed");
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          /* ignore close races */
        }
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      setIsConnected(false);
    };
  }, []);

  return {
    isConnected,
    lastUpdate,
    error,
  };
}
