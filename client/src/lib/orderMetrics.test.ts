import { describe, expect, it } from "vitest";
import {
  aggregateEarningsHistory,
  aggregateOrdersBreakdown,
  normalizeOrderDate,
  formatMonthKey,
} from "./orderMetrics";
import { Order } from "@/types/order";

describe("orderMetrics - Dashboard Chart Data Aggregation (#1473)", () => {
  const baseOrder: Order = {
    orderId: "ord-1",
    buyer: "G_BUYER",
    farmer: "G_FARMER",
    token: "XLM",
    amount: BigInt(100_000_000), // 10.0 XLM
    status: "Completed",
    timestamp: 1717200000, // 2024-06-01
  };

  it("normalizes unix seconds, unix milliseconds, and date strings correctly", () => {
    // 2024-06-01T00:00:00Z in seconds = 1717200000
    const fromSec = normalizeOrderDate(1717200000);
    expect(fromSec).not.toBeNull();
    expect(fromSec?.getUTCFullYear()).toBe(2024);
    expect(fromSec?.getUTCMonth()).toBe(5); // June

    // Milliseconds
    const fromMs = normalizeOrderDate(1717200000000);
    expect(fromMs?.getUTCFullYear()).toBe(2024);

    // Invalid input
    expect(normalizeOrderDate(0)).toBeNull();
    expect(normalizeOrderDate("invalid")).toBeNull();
  });

  it("returns empty array for empty datasets so dashboard can show an honest empty state", () => {
    expect(aggregateEarningsHistory([])).toEqual([]);
    expect(aggregateOrdersBreakdown([])).toEqual([]);
  });

  it("strictly excludes non-completed orders (Pending, Refunded) from earnings", () => {
    const orders: Order[] = [
      { ...baseOrder, orderId: "1", status: "Pending", amount: BigInt(500_000_000), timestamp: 1717200000 },
      { ...baseOrder, orderId: "2", status: "Refunded", amount: BigInt(300_000_000), timestamp: 1717200000 },
      { ...baseOrder, orderId: "3", status: "Completed", amount: BigInt(200_000_000), timestamp: 1717200000 },
    ];

    const earnings = aggregateEarningsHistory(orders);
    expect(earnings).toHaveLength(1);
    expect(earnings[0].month).toBe("Jun");
    // Only order 3 (20.0 XLM) is counted
    expect(earnings[0].gross).toBe(20.0);
    expect(earnings[0].net).toBe(19.4);
  });

  it("aggregates multiple completed orders in the same month", () => {
    const orders: Order[] = [
      { ...baseOrder, orderId: "1", amount: BigInt(100_000_000), timestamp: 1717200000 }, // June 1
      { ...baseOrder, orderId: "2", amount: BigInt(150_000_000), timestamp: 1718000000 }, // June 10
    ];

    const earnings = aggregateEarningsHistory(orders);
    expect(earnings).toHaveLength(1);
    expect(earnings[0].month).toBe("Jun");
    expect(earnings[0].gross).toBe(25.0);
    expect(earnings[0].net).toBe(24.25);
  });

  it("correctly buckets across month and year boundaries", () => {
    // 2025-11-15: 1763164800 (Nov 2025)
    // 2026-01-10: 1768003200 (Jan 2026)
    const orders: Order[] = [
      { ...baseOrder, orderId: "1", amount: BigInt(100_000_000), timestamp: 1763164800 },
      { ...baseOrder, orderId: "2", amount: BigInt(300_000_000), timestamp: 1768003200 },
    ];

    const earnings = aggregateEarningsHistory(orders);
    expect(earnings).toHaveLength(2);
    // Across years, labels should include year context (e.g. Nov '25, Jan '26)
    expect(earnings[0].month).toBe("Nov '25");
    expect(earnings[0].gross).toBe(10.0);

    expect(earnings[1].month).toBe("Jan '26");
    expect(earnings[1].gross).toBe(30.0);
  });

  it("aggregates order breakdown by status across months", () => {
    const orders: Order[] = [
      { ...baseOrder, orderId: "1", status: "Completed", timestamp: 1717200000 },
      { ...baseOrder, orderId: "2", status: "Pending", timestamp: 1717200000 },
      { ...baseOrder, orderId: "3", status: "Refunded", timestamp: 1717200000 },
      { ...baseOrder, orderId: "4", status: "Completed", timestamp: 1719792000 }, // July 1
    ];

    const breakdown = aggregateOrdersBreakdown(orders);
    expect(breakdown).toHaveLength(2);

    expect(breakdown[0].month).toBe("Jun");
    expect(breakdown[0].completed).toBe(1);
    expect(breakdown[0].pending).toBe(1);
    expect(breakdown[0].refunded).toBe(1);

    expect(breakdown[1].month).toBe("Jul");
    expect(breakdown[1].completed).toBe(1);
    expect(breakdown[1].pending).toBe(0);
    expect(breakdown[1].refunded).toBe(0);
  });
});
