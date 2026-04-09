import { z } from "zod";

export const VOID_ORDER_CATEGORIES = [
    "CUSTOMER_WALK_OUT",
    "ORDER_ERROR",
    "DUPLICATE_ORDER",
    "STAFF_ERROR",
    "OTHER",
] as const;

export type VoidOrderCategory = (typeof VOID_ORDER_CATEGORIES)[number];

export const VoidOrderSchema = z.object({
    orderId: z.string().min(1),
    voidCategory: z.enum(VOID_ORDER_CATEGORIES),
    reason: z.string().trim().min(15, "Reason must be at least 15 characters"),
});

export type VoidOrderInput = z.infer<typeof VoidOrderSchema>;
