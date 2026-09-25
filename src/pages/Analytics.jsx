import React, { useState, useEffect, useMemo } from "react";
import { where } from "firebase/firestore";
import { useOrderStore, parseOrderDocDate } from "../store/orderStore";
import { stageOf, STAGE } from "../lib/orderStages";
import { orderRepository } from "../repositories";
import * as LoadingComponents from "../components/LoadingComponents";

const TIMEFRAMES = [
  { id: "week", label: "Last 7 Days", days: 7 },
  { id: "month", label: "Last 30 Days", days: 30 },
  { id: "quarter", label: "Last 90 Days", days: 90 },
  { id: "year", label: "Last 365 Days", days: 365 },
];

const ANALYTICS_SAMPLE_CAP = 2000;

const isDelivered = (o) => stageOf(o) === STAGE.COMPLETED;

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const Analytics = () => {
  const [timeframe, setTimeframe] = useState("month");
  const { subscribeOrders, disconnectOrders } = useOrderStore();

  const [sample, setSample] = useState([]);
  const [headline, setHeadline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    subscribeOrders();
    return () => disconnectOrders();
  }, [subscribeOrders, disconnectOrders]);

  useEffect(() => {
    let cancelled = false;
    const days = TIMEFRAMES.find((t) => t.id === timeframe)?.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const constraints = [where("createdAt", ">=", since)];
        const [count, page] = await Promise.all([
          orderRepository.countWhere(constraints),
          orderRepository.getPage({
            limitTo: ANALYTICS_SAMPLE_CAP,
            orderByField: "createdAt",
            direction: "desc",
            constraints,
          }),
        ]);
        if (cancelled) return;
        setHeadline({ ordersInWindow: count });
        setSample(page.items);
        setTruncated(page.hasMore);
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.code === "failed-precondition"
              ? "This view needs a Firestore index. Check Firebase console."
              : e?.message || "Could not load analytics."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timeframe]);

  const metrics = useMemo(() => {
    const delivered = sample.filter(isDelivered);
    const money = (o) => Number(o.total || o.totalAmount || o.grandTotal || 0);

    const grossSales = delivered.reduce((s, o) => s + money(o), 0);
    const totalOrders = delivered.length;

    const totalDiscounts = delivered.reduce((s, o) => s + Number(o.discountAmount || o.discount || 0), 0);
    const totalTaxes = delivered.reduce((s, o) => s + Number(o.tax || o.taxAmount || 0), 0);
    const totalDelivery = delivered.reduce((s, o) => s + Number(o.deliveryFee || o.deliveryCharge || 0), 0);
    const netFoodRevenue = grossSales - totalDiscounts - totalTaxes - totalDelivery;

    const cancelledCount = sample.filter((o) => stageOf(o) === STAGE.CANCELLED).length;
    const cancellationRate = sample.length ? ((cancelledCount / sample.length) * 100).toFixed(1) : 0;
    const aov = totalOrders > 0 ? (grossSales / totalOrders).toFixed(0) : 0;

    // Daily breakdown (last 14 days or days in window)
    const dayCount = Math.min(TIMEFRAMES.find((t) => t.id === timeframe)?.days ?? 14, 14);
    const days = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      return d;
    }).reverse();

    const byDay = new Map(days.map((d) => [d.toDateString(), 0]));
    delivered.forEach((o) => {
      const dateVal = parseOrderDocDate(o.createdAt || o.timestamp);
      if (dateVal) {
        const key = dateVal.toDateString();
        if (byDay.has(key)) {
          byDay.set(key, byDay.get(key) + money(o));
        }
      }
    });

    const dailyRevenue = days.map((d) => byDay.get(d.toDateString()) || 0);
    const maxDailyRevenue = Math.max(1, ...dailyRevenue);

    // Payment methods
    const paymentMethods = { upi: 0, online: 0, wallet: 0, cod: 0 };
    delivered.forEach((o) => {
      const m = String(o.paymentMethod || o.paymentMode || "").toLowerCase();
      const val = money(o);
      if (m.includes("wallet")) paymentMethods.wallet += val;
      else if (m.includes("upi")) paymentMethods.upi += val;
      else if (m.includes("cod") || m.includes("cash")) paymentMethods.cod += val;
      else paymentMethods.online += val;
    });

    // Top Items
    const itemMap = new Map();
    delivered.forEach((o) => {
      (o.items || []).forEach((item) => {
        const name = item.name || item.title || "Custom Dish";
        const qty = Number(item.quantity || 1);
        const price = Number(item.price || item.unitPrice || 0) * qty;
        const current = itemMap.get(name) || { qty: 0, rev: 0 };
        itemMap.set(name, { qty: current.qty + qty, rev: current.rev + price });
      });
    });

    const topItems = Array.from(itemMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      grossSales,
      totalOrders,
      totalDiscounts,
      totalTaxes,
      totalDelivery,
      netFoodRevenue,
      cancellationRate,
      aov,
      days,
      dailyRevenue,
      maxDailyRevenue,
      paymentMethods,
      topItems,
    };
  }, [sample, timeframe]);

  return (
    <div className="space-y-6">
      {/* ── Header & Timeframe Switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Financial & Sales Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time revenue accounting, order volume metrics, deductions, and top dish performers.
          </p>
        </div>

        {/* Timeframe pill selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl self-start sm:self-auto">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                timeframe === tf.id
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sampling Info ── */}
      {headline && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
            {headline.ordersInWindow.toLocaleString()} orders placed in this period
          </span>
          {truncated && (
            <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 font-bold text-amber-700 dark:text-amber-300">
              Sampled from the newest {ANALYTICS_SAMPLE_CAP} orders
            </span>
          )}
          {loading && <span className="text-slate-400 font-semibold italic">Refreshing data...</span>}
        </div>
      )}

      {/* ── Executive KPI Bento Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Food Revenue */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Net Food Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">account_balance</span>
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-3">
            {inr(metrics.netFoodRevenue)}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Delivered, after discounts, tax & rider fees</p>
        </div>

        {/* Gross Sales */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gross Sales</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">point_of_sale</span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">
            {inr(metrics.grossSales)}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Total customer invoice volume</p>
        </div>

        {/* Delivered Orders & AOV */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Delivered Orders</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">local_shipping</span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">
            {metrics.totalOrders}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Average Order Value: {inr(metrics.aov)}</p>
        </div>

        {/* Cancellation Rate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cancellation Rate</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">cancel</span>
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-3">
            {metrics.cancellationRate}%
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Of all incoming order attempts</p>
        </div>
      </div>

      {/* ── Revenue Trend Chart & P&L Deductions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Revenue Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Daily Revenue Trend</h3>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Delivered orders revenue over recent days</p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-xl">
              Peak: {inr(metrics.maxDailyRevenue)}
            </span>
          </div>

          {/* Chart Display */}
          <div className="my-6 flex items-end gap-2 h-48 px-2">
            {metrics.days.map((d, idx) => {
              const val = metrics.dailyRevenue[idx] || 0;
              const heightPct = Math.max(8, Math.round((val / metrics.maxDailyRevenue) * 90));
              const dayStr = d.toLocaleDateString("en-IN", { weekday: "short" });
              const dateNum = d.getDate();

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                  {/* Tooltip */}
                  <div className="absolute -top-9 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-md whitespace-nowrap z-20">
                    {inr(val)}
                  </div>

                  <div className="w-full flex items-end justify-center h-36">
                    <div
                      className="w-full max-w-[28px] rounded-t-xl bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:from-emerald-500 group-hover:to-teal-300 transition-all duration-300 shadow-xs"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>

                  <div className="text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">{dayStr}</span>
                    <span className="text-[10px] font-black text-slate-700 dark:text-slate-300">{dateNum}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>Hover on any bar to inspect daily sales total</span>
            <span className="font-semibold text-emerald-600">Calculated on capture</span>
          </div>
        </div>

        {/* Right Col: Deductions & P&L */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
              Financial Deductions (P&L)
            </h3>

            <div className="space-y-3.5 mt-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Gross Customer Spend</span>
                <span className="font-black text-slate-900 dark:text-white">{inr(metrics.grossSales)}</span>
              </div>

              <div className="flex justify-between items-center text-rose-600">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Discounts Given
                </span>
                <span className="font-bold">-{inr(metrics.totalDiscounts)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" /> GST / Taxes
                </span>
                <span className="font-bold">-{inr(metrics.totalTaxes)}</span>
              </div>

              <div className="flex justify-between items-center text-blue-600">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Delivery Partner Fees
                </span>
                <span className="font-bold">-{inr(metrics.totalDelivery)}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-6 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-800 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Net Food Earnings</p>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{inr(metrics.netFoodRevenue)}</p>
            </div>
            <span className="material-symbols-outlined text-2xl text-emerald-600">verified</span>
          </div>
        </div>
      </div>

      {/* ── Payment Methods & Top Dishes Leaderboard ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
            Payment Methods Share
          </h3>

          <div className="space-y-3.5 text-xs">
            {[
              { label: "UPI & Instant QR", val: metrics.paymentMethods.upi, color: "bg-emerald-500" },
              { label: "Razorpay / Cards / NetBanking", val: metrics.paymentMethods.online, color: "bg-blue-500" },
              { label: "HomeBites Wallet", val: metrics.paymentMethods.wallet, color: "bg-purple-500" },
              { label: "Cash on Delivery", val: metrics.paymentMethods.cod, color: "bg-amber-500" },
            ].map((p) => {
              const total = metrics.grossSales || 1;
              const pct = Math.round((p.val / total) * 100);
              return (
                <div key={p.label} className="space-y-1.5">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-700 dark:text-slate-300">{p.label}</span>
                    <span className="text-slate-900 dark:text-white">{inr(p.val)} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Dishes Leaderboard */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
            Top Performing Dishes
          </h3>

          {metrics.topItems.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">No dish breakdown data available yet.</div>
          ) : (
            <div className="space-y-2.5">
              {metrics.topItems.map((item, idx) => {
                const medals = ["🥇", "🥈", "🥉", "4th", "5th"];
                return (
                  <div
                    key={item.name}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold w-6 text-center">{medals[idx]}</span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.qty} portions sold</p>
                      </div>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white">{inr(item.rev)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
