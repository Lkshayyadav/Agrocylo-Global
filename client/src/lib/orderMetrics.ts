import { Order } from "@/types/order";

export interface MonthlyEarningsBucket {
  month: string;
  gross: number;
  net: number;
}

export interface MonthlyOrdersBucket {
  month: string;
  completed: number;
  pending: number;
  refunded: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Safely converts an order timestamp (seconds or milliseconds Unix epoch) to a Date.
 */
export function normalizeOrderDate(timestamp: number | string | Date): Date | null {
  if (!timestamp) return null;
  let num: number;
  if (typeof timestamp === "string") {
    num = Number(timestamp);
    if (isNaN(num)) {
      const parsed = Date.parse(timestamp);
      return isNaN(parsed) ? null : new Date(parsed);
    }
  } else if (typeof timestamp === "number") {
    num = timestamp;
  } else if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? null : timestamp;
  } else {
    return null;
  }

  // If timestamp is in seconds (e.g. Unix seconds < 10000000000), multiply by 1000
  const ms = num < 10_000_000_000 ? num * 1000 : num;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format month label with year context when spanning year boundaries (e.g. "Nov '25", "Jan '26").
 */
export function formatMonthKey(date: Date, includeYear = false): string {
  const month = MONTH_NAMES[date.getUTCMonth()];
  if (includeYear) {
    const yearShort = String(date.getUTCFullYear()).slice(-2);
    return `${month} '${yearShort}`;
  }
  return month;
}

/**
 * Computes monthly earnings from completed orders only (#1473).
 * Excludes pending, refunded, and cancelled orders.
 * Returns an empty array if there are no completed orders to prevent fabricated reporting.
 */
export function aggregateEarningsHistory(orders: Order[]): MonthlyEarningsBucket[] {
  const completed = orders.filter((o) => o.status === "Completed");
  if (completed.length === 0) {
    return [];
  }

  // Sort orders by timestamp ascending
  const validOrders = completed
    .map((o) => ({ order: o, date: normalizeOrderDate(o.timestamp) }))
    .filter((item): item is { order: Order; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validOrders.length === 0) {
    return [];
  }

  // Check if dates span multiple years
  const firstYear = validOrders[0].date.getUTCFullYear();
  const lastYear = validOrders[validOrders.length - 1].date.getUTCFullYear();
  const spansMultipleYears = firstYear !== lastYear;

  // Aggregate by Year-Month bucket
  const buckets = new Map<string, { label: string; gross: number; sortKey: number }>();

  for (const { order, date } of validOrders) {
    const year = date.getUTCFullYear();
    const monthIdx = date.getUTCMonth();
    const bucketKey = `${year}-${String(monthIdx).padStart(2, "0")}`;
    const sortKey = year * 100 + monthIdx;
    const label = formatMonthKey(date, spansMultipleYears);

    const amountXlm = Number(order.amount ?? 0) / 1e7;

    const existing = buckets.get(bucketKey) ?? { label, gross: 0, sortKey };
    existing.gross += amountXlm;
    buckets.set(bucketKey, existing);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((b) => ({
      month: b.label,
      gross: Number(b.gross.toFixed(2)),
      net: Number((b.gross * 0.97).toFixed(2)),
    }));
}

/**
 * Computes monthly order counts breakdown across all statuses (#1473).
 * Returns empty array if no orders exist with valid timestamps.
 */
export function aggregateOrdersBreakdown(orders: Order[]): MonthlyOrdersBucket[] {
  if (orders.length === 0) {
    return [];
  }

  const validOrders = orders
    .map((o) => ({ order: o, date: normalizeOrderDate(o.timestamp) }))
    .filter((item): item is { order: Order; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validOrders.length === 0) {
    return [];
  }

  const firstYear = validOrders[0].date.getUTCFullYear();
  const lastYear = validOrders[validOrders.length - 1].date.getUTCFullYear();
  const spansMultipleYears = firstYear !== lastYear;

  const buckets = new Map<
    string,
    { label: string; completed: number; pending: number; refunded: number; sortKey: number }
  >();

  for (const { order, date } of validOrders) {
    const year = date.getUTCFullYear();
    const monthIdx = date.getUTCMonth();
    const bucketKey = `${year}-${String(monthIdx).padStart(2, "0")}`;
    const sortKey = year * 100 + monthIdx;
    const label = formatMonthKey(date, spansMultipleYears);

    const entry = buckets.get(bucketKey) ?? {
      label,
      completed: 0,
      pending: 0,
      refunded: 0,
      sortKey,
    };

    if (order.status === "Completed") {
      entry.completed += 1;
    } else if (order.status === "Pending") {
      entry.pending += 1;
    } else if (order.status === "Refunded") {
      entry.refunded += 1;
    }

    buckets.set(bucketKey, entry);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((b) => ({
      month: b.label,
      completed: b.completed,
      pending: b.pending,
      refunded: b.refunded,
    }));
}
