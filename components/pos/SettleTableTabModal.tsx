"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  getTableDailyTabSummary,
  settleTableTabAndCreateOrder,
  settleSelectedOrders,
} from "@/lib/actions/pos.actions";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from "@/lib/actions/paystack.actions";
import { openPaystackWithAccessCode } from "@/lib/paystack-inline";
import { Loader2, RefreshCw } from "lucide-react";

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack";

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "pdq", label: "PDQ / Card" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "paystack", label: "Paystack" },
];

interface SettleTableTabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (order: any) => void;
}

export function SettleTableTabModal({
  isOpen,
  onClose,
  onEdit,
}: SettleTableTabModalProps) {
  const router = useRouter();
  const [tableNumber, setTableNumber] = useState<number>(1);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<any | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderPaymentMethods, setOrderPaymentMethods] = useState<Record<string, PaymentMethod>>({});
  const [isPaystackReady, setIsPaystackReady] = useState(false);

  const parseOrderItems = (order: any) => {
    if (!order?.items) return [];
    if (typeof order.items === "string") {
      try {
        return JSON.parse(order.items);
      } catch {
        return [];
      }
    }
    return Array.isArray(order.items) ? order.items : [];
  };

  const refreshSummary = async () => {
    if (!tableNumber || tableNumber < 1) return;
    const result = await getTableDailyTabSummary(tableNumber, date);
    setSummary(result);
  };

  const handleLoadSummary = async () => {
    try {
      setError(null);
      setSuccessMessage(null);
      setIsLoadingSummary(true);

      if (!tableNumber || tableNumber < 1) {
        throw new Error("Please enter a valid table number.");
      }

      const result = await getTableDailyTabSummary(tableNumber, date);
      setSummary(result);
      setSelectedOrderIds([]);
      setExpandedOrderId(null);

      if (!result.orders || result.orders.length === 0) {
        setError("No unpaid orders found for this table on the selected date.");
      }
    } catch (err) {
      console.error("Failed to load table tab summary:", err);
      setSummary(null);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load table summary. Please try again."
      );
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleToggleOrder = (orderId: string) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
  };

  const handleToggleSelection = (orderId: string) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    );
  };

  const handleSelectAll = () => {
    if (!summary?.orders?.length) return;
    const allIds = summary.orders.map((order: any) => order.$id);
    setSelectedOrderIds((current) =>
      current.length === allIds.length ? [] : allIds
    );
  };

  const setOrderPaymentMethod = (orderId: string, method: PaymentMethod) => {
    setOrderPaymentMethods((current) => ({ ...current, [orderId]: method }));
  };

  const buildOrderMethod = (orderId: string) => {
    return orderPaymentMethods[orderId] || paymentMethod;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPaystack = () => {
      if ((window as any).PaystackPop) {
        setIsPaystackReady(true);
      }
    };

    checkPaystack();
    const interval = window.setInterval(checkPaystack, 250);
    return () => window.clearInterval(interval);
  }, []);

  const handlePaystackFlow = async (orderIds: string[], amount: number) => {
    const syntheticOrderId = `tab-${tableNumber}-${date}-${Date.now()}`;
    const uniqueEmail = `${syntheticOrderId}@ampm.co.ke`;
    const initResult = await initializePaystackTransaction({
      email: uniqueEmail,
      amount,
      orderId: syntheticOrderId,
      metadata: {
        tableNumber,
        date,
        type: "table_tab",
        orders: orderIds,
      },
    });

    if (!initResult.success || !initResult.access_code) {
      throw new Error(initResult.error || "Failed to initialize payment");
    }

    return new Promise<string>((resolve, reject) => {
      openPaystackWithAccessCode(initResult.access_code!, {
        onSuccess: async (reference) => {
          try {
            const verifyResult = await verifyPaystackTransaction(reference);
            if (!verifyResult.success || verifyResult.data?.status !== "success") {
              reject(new Error("Payment verification failed."));
              return;
            }
            const expectedKobo = Math.round(amount * 100);
            const paidKobo = Math.round((verifyResult.data.amount || 0) * 100);
            if (Math.abs(paidKobo - expectedKobo) > 2) {
              reject(new Error("Payment amount mismatch."));
              return;
            }
            resolve(reference);
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Verification failed"));
          }
        },
        onCancel: () => reject(new Error("Payment cancelled.")),
        onError: (msg) => reject(new Error(msg)),
      });
    });
  };

  const handleSettleOrders = async (orderIds: string[], overrideMethod?: PaymentMethod) => {
    try {
      setError(null);
      setSuccessMessage(null);
      setIsProcessingPayment(true);

      const orderIdsToSettle = orderIds.slice();
      const amount = summary.orders
        .filter((order: any) => orderIdsToSettle.includes(order.$id))
        .reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);

      const selectedPaymentMethod = overrideMethod || paymentMethod;
      let paymentReference = `manual-${selectedPaymentMethod}-${Date.now()}`;

      if (selectedPaymentMethod === "paystack" && !isPaystackReady) {
        throw new Error("Paystack checkout is still loading. Please wait a moment and try again.");
      }

      if (selectedPaymentMethod === "paystack") {
        paymentReference = await handlePaystackFlow(orderIdsToSettle, amount);
      }

      const settleResult = await settleSelectedOrders({
        orderIds: orderIdsToSettle,
        paymentMethod: selectedPaymentMethod,
        paymentReference,
      });

      if (!settleResult.success) {
        throw new Error(settleResult.message || "Failed to settle selected orders.");
      }

      setSuccessMessage(`Payment successful. ${settleResult.updatedCount} order(s) settled.`);
      await refreshSummary();
      if (settleResult.consolidatedOrderId && settleResult.consolidatedOrderId !== orderIdsToSettle[0]) {
        router.push(`/pos/receipt/${settleResult.consolidatedOrderId}`);
      }
    } catch (err) {
      console.error("Failed to settle selected orders:", err);
      setError(err instanceof Error ? err.message : "Failed to settle selected orders.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleChargeSelected = async () => {
    if (!selectedOrderIds.length) {
      setError("Select orders to charge.");
      return;
    }
    await handleSettleOrders(selectedOrderIds);
  };

  const handleChargeFullTab = async () => {
    if (!summary?.orders?.length) {
      setError("There is no unpaid tab to settle for this table.");
      return;
    }
    if (paymentMethod === "paystack") {
      try {
        if (!isPaystackReady) {
          throw new Error("Paystack checkout is still loading. Please wait a moment and try again.");
        }

        setError(null);
        setSuccessMessage(null);
        setIsProcessingPayment(true);

        const orderIds = summary.orders.map((order: any) => order.$id);
        const amount = summary.totalAmount || 0;
        const paymentReference = await handlePaystackFlow(orderIds, amount);

        const settleResult = await settleTableTabAndCreateOrder({
          tableNumber,
          date,
          paymentReference,
          paymentMethod: "paystack",
        });

        if (!settleResult.success || !settleResult.consolidatedOrderId) {
          throw new Error(settleResult.message || "Failed to finalize payment.");
        }

        setSuccessMessage(`Full tab charged successfully. ${settleResult.updatedCount} orders settled.`);
        await refreshSummary();
        router.push(`/pos/receipt/${settleResult.consolidatedOrderId}`);
      } catch (err) {
        console.error("Failed to settle full tab:", err);
        setError(err instanceof Error ? err.message : "Failed to settle full tab.");
      } finally {
        setIsProcessingPayment(false);
      }
      return;
    }

    await handleSettleOrders(summary.orders.map((order: any) => order.$id));
  };

  const handlePayOrder = async (orderId: string) => {
    const orderMethod = buildOrderMethod(orderId);
    await handleSettleOrders([orderId], orderMethod);
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setSummary(null);
    setIsLoadingSummary(false);
    setIsProcessingPayment(false);
    setExpandedOrderId(null);
    setSelectedOrderIds([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Settle Table Tab</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Review unpaid orders, split bills when needed, and settle using the
            payment method that matches the customer's choice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr,0.8fr] gap-4 mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-neutral-400 mb-1 block">Table Number</label>
                <input
                  type="number"
                  min={1}
                  value={tableNumber}
                  onChange={(e) => setTableNumber(Number.parseInt(e.target.value || "0", 10))}
                  className="w-full bg-neutral-800 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-sm text-neutral-400 mb-1 block">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={handleLoadSummary}
                  disabled={isLoadingSummary}
                  className="w-full bg-emerald-600 hover:bg-emerald-500"
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Load Tab
                    </>
                  )}
                </Button>
              </div>
            </div>

            {summary && (
              <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm text-neutral-400">Tab Summary</p>
                    <p className="text-lg font-semibold text-white">Table {summary.tableNumber} • {summary.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-neutral-400">Unpaid orders</p>
                    <p className="text-2xl font-bold text-emerald-400">{summary.orderCount}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Subtotal</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(summary.subtotal || 0)}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Total Due</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-400">{formatCurrency(summary.totalAmount || 0)}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Default payment method</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {paymentOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPaymentMethod(option.value)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${paymentMethod === option.value ? "bg-emerald-500 text-slate-900" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {summary && summary.orders && summary.orders.length > 0 ? (
              <div className="space-y-4">
                {summary.orders.map((order: any) => {
                  const items = parseOrderItems(order);
                  const selected = selectedOrderIds.includes(order.$id);
                  const orderMethod = buildOrderMethod(order.$id);

                  return (
                    <div key={order.$id} className="rounded-[2rem] border border-white/10 bg-slate-950/70 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer" onClick={() => handleToggleOrder(order.$id)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelection(order.$id);
                            }}
                            className={`w-10 h-10 grid place-items-center rounded-2xl border text-sm transition ${selected ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-neutral-300"}`}
                          >
                            {selected ? "✓" : ""}
                          </button>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">Order #{order.orderNumber || order.$id}</p>
                            <p className="text-xs text-neutral-500 truncate">{order.customerName || "Walk-in Customer"} • {new Date(order.orderTime).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-emerald-400">{formatCurrency(order.totalAmount || 0)}</p>
                          <span className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-300">{orderMethod.toUpperCase()}</span>
                        </div>
                      </div>

                      {expandedOrderId === order.$id && (
                        <div className="border-t border-white/10 px-4 pb-4">
                          <div className="space-y-4 pt-4">
                            {items.length === 0 ? (
                              <p className="text-sm text-neutral-400">This order has no items.</p>
                            ) : (
                              <div className="space-y-3">
                                {items.map((item: any, itemIdx: number) => (
                                  <div
                                    key={`${order.$id}-ln-${itemIdx}-${item.$id}-${item.name}`}
                                    className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-slate-900/80 p-4"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-white">{item.quantity}× {item.name}</p>
                                      {item.description && <p className="text-xs text-neutral-500 mt-1 line-clamp-1">{item.description}</p>}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold text-emerald-400">{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</p>
                                      <p className="text-xs text-neutral-500">{formatCurrency(item.price)} ea</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm text-neutral-400 uppercase tracking-[0.2em]">Charge this order</p>
                                  <p className="mt-2 text-white text-sm">{formatCurrency(order.totalAmount || 0)}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {paymentOptions.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => setOrderPaymentMethod(order.$id, option.value)}
                                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${orderMethod === option.value ? "bg-emerald-500 text-slate-900" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <Button
                                type="button"
                                className="bg-emerald-600 hover:bg-emerald-500"
                                onClick={() => handlePayOrder(order.$id)}
                                disabled={isProcessingPayment}
                              >
                                {isProcessingPayment ? (
                                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing</>
                                ) : (
                                  <>Pay Order</>
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="border-white/15"
                                onClick={() => {
                                  onEdit?.(order);
                                  onClose();
                                }}
                              >
                                Edit in POS
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : summary ? (
              <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 text-center text-sm text-neutral-400">
                No unpaid orders found for this table on the selected date.
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5">
              <p className="text-sm text-neutral-400 uppercase tracking-[0.2em]">Why this works</p>
              <ul className="mt-4 space-y-3 text-sm text-neutral-300">
                <li>• Review individual orders before the final payment.</li>
                <li>• Split bills by order or consolidate the full tab.</li>
                <li>• Track payment methods per order or for the whole tab.</li>
                <li>• Adjust orders from the POS cart when a guest changes their mind before payment.</li>
              </ul>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5">
              <p className="text-sm text-neutral-400 uppercase tracking-[0.2em]">Actions</p>
              <div className="mt-4 flex flex-col gap-3">
                <Button type="button" variant="outline" onClick={handleSelectAll} disabled={!summary?.orders?.length}>
                  {selectedOrderIds.length === (summary?.orders?.length || 0) ? "Clear Selection" : "Select All"}
                </Button>
                <Button
                  type="button"
                  onClick={handleChargeSelected}
                  disabled={!selectedOrderIds.length || isProcessingPayment}
                  className="bg-sky-600 hover:bg-sky-500"
                >
                  {isProcessingPayment ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing</>
                  ) : (
                    <>Charge Selected Orders</>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={handleChargeFullTab}
                  disabled={!summary?.orders?.length || isProcessingPayment}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {isProcessingPayment ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing</>
                  ) : (
                    <>Charge Full Tab</>
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5">
              <p className="text-sm text-neutral-400 uppercase tracking-[0.2em]">Status</p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-white">Selected orders: {selectedOrderIds.length}</p>
                <p className="text-neutral-400">Default payment method: {paymentMethod.toUpperCase()}</p>
              </div>
            </div>
          </div>
        </div>

        {(error || successMessage) && (
          <div className={`mt-4 rounded-[2rem] border p-4 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
            {error ?? successMessage}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

