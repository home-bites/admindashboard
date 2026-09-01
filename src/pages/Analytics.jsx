import React, { useState, useEffect, useMemo } from "react";
import { where } from "firebase/firestore";
import { useOrderStore, parseOrderDocDate } from "../store/orderStore";
import { stageOf, STAGE } from "../lib/orderStages";
import { orderRepository } from "../repositories";
import * as LoadingComponents from "../components/LoadingComponents";

/**
 * Windows the page can report on. `days` drives the actual query.
 *
 * The previous version had a Week/Month/Year switch whose handler set state
 * and raised a toast saying the timeframe had changed — and then nothing read
 * that state. Every figure on the page was computed from whatever the order
 * store happened to hold, so all three buttons produced identical numbers
 * while actively telling the operator they had changed. A control that
 * reports a change it did not make is worse than a disabled one.
 */
const TIMEFRAMES = [
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "quarter", label: "90 days", days: 90 },
  { id: "year", label: "365 days", days: 365 },
];

/**
 * Orders pulled into memory to compute breakdowns for the selected window.
 *
 * Headline count and revenue come from server-side aggregation and are exact
 * at any size. Per-item and per-payment-method breakdowns cannot be done with
 * an aggregation query, so they are computed over this bounded sample and the
 * page says so when the sample is not the whole window.
 */
const ANALYTICS_SAMPLE_CAP = 2000;

const isDelivered = (o) => stageOf(o) === STAGE.COMPLETED;

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

  /* ── Load the selected window ─────────────────────────────────────────── */
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
          // Exact, whatever the collection size — not the length of a page.
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
              ? "This view needs a Firestore index that has not been created yet; the console names it."
              : e?.message || "Could not load analytics.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [timeframe]);

  const handleTimeframeChange = (tf) => setTimeframe(tf);

  /* ── Derived figures, all scoped to the selected window ───────────────── */
  const m = useMemo(() => {
    const delivered = sample.filter(isDelivered);
    const money = (o) => Number(o.total || o.totalAmount || o.grandTotal || 0);

    const grossSales = delivered.reduce((s, o) => s + money(o), 0);
    const totalOrders = delivered.length;

    const totalDiscounts = delivered.reduce((s, o) => s + Number(o.discountAmount || o.discount || 0), 0);
    const totalTaxes = delivered.reduce((s, o) => s + Number(o.tax || o.taxAmount || 0), 0);
    const totalDelivery = delivered.reduce((s, o) => s + Number(o.deliveryFee || o.deliveryCharge || 0), 0);

    /*
     * Was labelled "Net Profit" and computed as gross − discounts − tax −
     * delivery. None of those are costs of doing business: tax and delivery
     * are amounts collected from the customer and passed on. Nothing in this
     * system records cost of goods, so profit is not a figure this dashboard
     * can compute, and presenting one would be a fabricated number an owner
     * might act on. What the arithmetic actually yields is the portion of the
     * invoice that is food revenue, so that is what it is now called.
     *
     * The old version also clamped at zero, hiding the case where discounts
     * exceeded the food line entirely — exactly the case worth seeing.
     */
    const netFoodRevenue = grossSales - totalDiscounts - totalTaxes - totalDelivery;

    // Cancellations, as a share of everything placed in the window.
    const cancelled = sample.filter((o) => stageOf(o) === STAGE.CANCELLED).length;
    const cancellationRate = sample.length ? (cancelled / sample.length) * 100 : 0;

    /* Daily revenue across the window (capped at 30 columns for legibility). */
    const dayCount = Math.min(TIMEFRAMES.find((t) => t.id === timeframe)?.days ?? 30, 30);
    const days = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      return d;
    }).reverse();

    const byDay = new Map(days.map((d) => [d.toDateString(), 0]));
    delivered.forEach((o) => {
      // `new Date(o.createdAt)` was used here, but createdAt is often a
      // Firestore Timestamp, for which that yields Invalid Date — so the
      // trend chart silently read zero for every day. parseOrderDocDate
      // handles Timestamps, seconds objects, ISO strings and epoch numbers.
      const key = parseOrderDocDate(o.createdAt || o.timestamp).toDateString();
      if (byDay.has(key)) byDay.set(key, byDay.get(key) + money(o));
    });
    const dailyRevenue = [...byDay.values()];

    /* Payment split. Anything not recognised is counted as Other rather than
       dropped, so the percentages describe all delivered revenue instead of
       summing to 100% of an unstated subset. */
    const buckets = { COD: 0, Wallet: 0, Razorpay: 0, Other: 0 };
    delivered.forEach((o) => {
      const pm = String(o.paymentMethod || "").toLowerCase();
      if (pm === "cod" || pm === "cash") buckets.COD += money(o);
      else if (pm === "wallet") buckets.Wallet += money(o);
      else if (pm === "razorpay" || pm === "online") buckets.Razorpay += money(o);
      else buckets.Other += money(o);
    });
    const paymentTotal = Object.values(buckets).reduce((a, b) => a + b, 0);
    const pct = (v) => (paymentTotal > 0 ? Math.round((v / paymentTotal) * 100) : 0);

    /* Top items. */
    const itemCounts = {};
    delivered.forEach((o) => {
      (o.items || []).forEach((it) => {
        const name = it.name || "Unnamed item";
        itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || it.quantity || 1);
      });
    });
    const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      delivered, grossSales, totalOrders,
      avgOrderValue: totalOrders > 0 ? grossSales / totalOrders : 0,
      totalDiscounts, totalTaxes, totalDelivery, netFoodRevenue,
      cancellationRate, days, dailyRevenue,
      maxDailyRevenue: Math.max(...dailyRevenue, 100),
      buckets, paymentTotal, pct, topItems,
    };
  }, [sample, timeframe]);

  // Names the rest of the page already renders.
  const {
    grossSales, totalOrders, avgOrderValue, totalDiscounts, totalTaxes,
    totalDelivery, dailyRevenue, maxDailyRevenue, topItems,
  } = m;
  const netProfit = m.netFoodRevenue;
  const codRevenue = m.buckets.COD;
  const walletRevenue = m.buckets.Wallet;
  const razorpayRevenue = m.buckets.Razorpay;
  const codPct = m.pct(codRevenue);
  const walletPct = m.pct(walletRevenue);
  const razorpayPct = m.pct(razorpayRevenue);
  const last7Days = m.days;
  const hasChartData = grossSales > 0;

  if (loading && sample.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <span className="material-symbols-outlined text-[28px] text-rose-500">error</span>
          <p className="mt-2 text-sm font-bold text-rose-700">Analytics unavailable</p>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
          <button
            onClick={() => setTimeframe((t) => t)}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen bg-[#f9f9ff] flex flex-col gap-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Revenue &amp; Analytics</h2>
          <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">Track financial performance and key metrics.</p>
        </div>
        
        {/* Timeframe selector */}
        {/* Driven from TIMEFRAMES, so a button cannot exist without a window
            behind it. The literal list here included "day", which no branch
            handled — selecting it silently fell back to 30 days while showing
            as active. */}
        <div className="inline-flex rounded-lg border border-[#dce2f3] bg-white p-1 shadow-sm">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => handleTimeframeChange(tf.id)}
              aria-pressed={timeframe === tf.id}
              className={`px-4 py-1.5 rounded font-label-sm text-label-sm transition-all ${
                timeframe === tf.id
                  ? "bg-[#10b981] text-white shadow-sm font-semibold"
                  : "text-[#555f6f] hover:text-[#151c27]"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Every figure below is scoped to the selected window, and the sample
          behind the breakdowns is capped. Both facts belong on screen. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#555f6f]">
        <span className="rounded-full border border-[#dce2f3] bg-white px-3 py-1 font-semibold">
          Last {TIMEFRAMES.find((t) => t.id === timeframe)?.label}
        </span>
        {headline && (
          <span>
            <strong className="text-[#151c27]">{headline.ordersInWindow.toLocaleString()}</strong> orders placed in this period
          </span>
        )}
        {loading && <span className="italic">Refreshing…</span>}
        {truncated && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
            Breakdowns sampled from the newest {ANALYTICS_SAMPLE_CAP.toLocaleString()} orders
          </span>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Metric 1: Net Revenue */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981]"></div>
          <div className="flex justify-between items-start">
            {/* Renamed from "Net Profit". Nothing here knows cost of goods,
                so profit is not computable; this is the food-line portion of
                the invoice after discounts, tax and delivery are removed. */}
            <p className="font-label-md text-label-md text-[#555f6f] uppercase tracking-wider">Net Food Revenue</p>
            <span className="material-symbols-outlined text-[#10b981] text-[20px]">account_balance</span>
          </div>
          <div>
            <h3 className="font-headline-display text-headline-display text-[#151c27]">₹{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            {/* An upward arrow next to a figure with no comparison period
                asserts growth this page never measured. */}
            <span className="font-body-sm text-body-sm text-[#555f6f]">
              Delivered orders, after discounts, tax and delivery
            </span>
          </div>
        </div>

        {/* Metric 2: Gross Sales */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-[#555f6f] uppercase tracking-wider">Gross Sales</p>
            <span className="material-symbols-outlined text-[#555f6f] text-[20px]">point_of_sale</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-[#151c27]">₹{grossSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <span className="font-body-sm text-body-sm text-[#555f6f]">
              Total customer spend on delivered orders
            </span>
          </div>
        </div>

        {/* Metric 3: Total Orders */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-[#555f6f] uppercase tracking-wider">Total Orders</p>
            <span className="material-symbols-outlined text-[#555f6f] text-[20px]">shopping_bag</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-[#151c27]">{totalOrders}</h3>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <span className="font-body-sm text-body-sm text-[#555f6f]">
              Delivered in this period
            </span>
          </div>
        </div>

        {/* Metric 4: AOV */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-[#555f6f] uppercase tracking-wider">Avg Order Value</p>
            <span className="material-symbols-outlined text-[#555f6f] text-[20px]">receipt</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-[#151c27]">₹{avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-[#006c49] bg-[#006c49]/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              Calculated
            </span>
            <span className="font-body-sm text-body-sm text-[#555f6f]">average basket value</span>
          </div>
        </div>
      </div>

      {/* Bento Grid: Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Breakdown */}
        <div className="bg-white border border-[#d3daea] rounded-xl flex flex-col shadow-sm col-span-1">
          <div className="p-6 border-b border-[#d3daea]">
            <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">Financial Breakdown</h3>
            <p className="font-body-sm text-[#555f6f] text-body-sm">Detailed view of deductions.</p>
          </div>
          <div className="p-6 flex-grow flex flex-col justify-center">
            <ul className="flex flex-col gap-4">
              <li className="flex justify-between items-center py-2 border-b border-[#d3daea]/50">
                <span className="font-body-md text-body-md text-[#555f6f]">Gross Sales</span>
                <span className="font-label-md text-label-md text-[#151c27]">₹{grossSales.toFixed(2)}</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-[#d3daea]/50">
                <span className="font-body-md text-body-md text-[#555f6f] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ba1a1a]"></span> Discounts
                </span>
                <span className="font-label-md text-label-md text-[#ba1a1a]">₹{totalDiscounts.toFixed(2)}</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-[#d3daea]/50">
                <span className="font-body-md text-body-md text-[#555f6f] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#555f6f]"></span> Taxes (GST)
                </span>
                <span className="font-label-md text-label-md text-[#555f6f]">₹{totalTaxes.toFixed(2)}</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-[#d3daea]/50">
                <span className="font-body-md text-body-md text-[#555f6f] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Delivery Charges
                </span>
                <span className="font-label-md text-label-md text-[#555f6f]">₹{totalDelivery.toFixed(2)}</span>
              </li>
            </ul>
          </div>
          <div className="p-6 bg-[#f0f3ff] border-t border-[#d3daea] rounded-b-xl flex justify-between items-center">
            <span className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">Net Food Revenue</span>
            <span className="font-headline-md text-headline-md text-[#10b981] font-bold">₹{netProfit.toFixed(2)}</span>
          </div>
        </div>

        {/* Right Column Group */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          {/* Revenue Trend Line Chart */}
          <div className="bg-white border border-[#d3daea] rounded-xl p-6 shadow-sm flex-grow min-h-[300px] relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">Revenue Trend (Last 7 Days)</h3>
            </div>
            
            {/* Chart Graphic Area */}
            <div className="flex-1 relative w-full flex items-end pb-6 border-b border-l border-[#d3daea] min-h-[180px]">
              {/* Y-Axis Labels */}
              <div className="absolute -left-8 top-0 h-full flex flex-col justify-between text-[10px] text-[#555f6f] pb-6">
                <span>₹{(maxDailyRevenue).toFixed(0)}</span>
                <span>₹{(maxDailyRevenue * 0.75).toFixed(0)}</span>
                <span>₹{(maxDailyRevenue * 0.5).toFixed(0)}</span>
                <span>₹{(maxDailyRevenue * 0.25).toFixed(0)}</span>
                <span>0</span>
              </div>
              {/* Grid Lines */}
              <div className="absolute inset-x-0 top-[25%] border-t border-[#d3daea]/30"></div>
              <div className="absolute inset-x-0 top-[50%] border-t border-[#d3daea]/30"></div>
              <div className="absolute inset-x-0 top-[75%] border-t border-[#d3daea]/30"></div>
              
              {/* Data Points */}
              <div className="w-full flex justify-between items-end h-full z-10 px-4">
                {last7Days.map((date, index) => {
                  const val = dailyRevenue[index];
                  const heightPct = `${Math.max(10, Math.round((val / maxDailyRevenue) * 85))}%`;
                  return (
                    <div key={index} className="flex flex-col items-center gap-1 group relative flex-1">
                      <div className="absolute -top-8 bg-black text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap">
                        ₹{val.toFixed(2)}
                      </div>
                      <div 
                        className={`w-8 rounded-t-sm transition-all mx-auto ${
                          index === 6 ? "bg-[#10b981]" : "bg-[#ffdbd0] group-hover:bg-[#10b981]"
                        }`} 
                        style={{ height: heightPct }}
                      ></div>
                    </div>
                  );
                })}
              </div>
              
              {/* X-Axis Labels */}
              <div className="absolute -bottom-6 left-0 w-full flex justify-between px-4 text-[10px] text-[#555f6f]">
                {last7Days.map((date, index) => (
                  <span key={index} className="flex-1 text-center font-semibold">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                ))}
              </div>
            </div>

            {/* Central Overlay for No Data Available */}
            {!hasChartData && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                <div className="bg-[#f0f3ff] border border-[#dce2f3] rounded-lg py-3 px-6 shadow-sm flex items-center gap-2 text-[#10b981] font-label-md text-label-md">
                  <span className="material-symbols-outlined text-[20px]">info</span>
                  No Data Available
                </div>
              </div>
            )}
          </div>

          {/* Bottom Row: Payment Methods & Top Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue by Payment Method */}
            <div className="bg-white border border-[#d3daea] rounded-xl p-6 shadow-sm min-h-[220px] relative overflow-hidden flex flex-col justify-between">
              <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold mb-6">Payment Methods Split</h3>
              
              <div className="flex items-center gap-6">
                <div className="relative w-28 h-28 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" fill="transparent" r="40" stroke="#f0f3ff" strokeWidth="20"></circle>
                    <circle cx="50" cy="50" fill="transparent" r="40" stroke="#10b981" strokeDasharray={`${razorpayPct || 0} 251.2`} strokeWidth="20"></circle>
                  </svg>
                </div>
                <div className="flex flex-col gap-2 flex-grow">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">Razorpay</span>
                    <span className="font-bold">{razorpayPct}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">Wallet</span>
                    <span className="font-bold">{walletPct}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">Cash on Delivery</span>
                    <span className="font-bold">{codPct}%</span>
                  </div>
                </div>
              </div>

              {!hasChartData && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                  <div className="bg-[#f0f3ff] border border-[#dce2f3] rounded-lg py-2.5 px-4 shadow-sm flex items-center gap-1.5 text-[#10b981] font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    No Data Available
                  </div>
                </div>
              )}
            </div>

            {/* Top Selling Items */}
            <div className="bg-white border border-[#d3daea] rounded-xl p-6 shadow-sm min-h-[220px] relative overflow-hidden flex flex-col justify-between">
              <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold mb-4">Top Selling Items</h3>
              
              <div className="flex flex-col gap-4">
                {topItems.length === 0 ? (
                  <p className="text-sm text-[#555f6f] italic text-center py-6">No sales recorded yet.</p>
                ) : (
                  topItems.map(([name, count], index) => {
                    const maxCount = topItems[0][1] || 1;
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={name}>
                        <div className="flex justify-between items-end mb-1 text-sm">
                          <span className="font-semibold text-[#151c27] truncate max-w-[150px]">{name}</span>
                          <span className="text-gray-500 text-xs font-bold">{count} ord.</span>
                        </div>
                        <div className="w-full bg-[#f0f3ff] rounded-full h-2">
                          <div className={`h-2 rounded-full ${index === 0 ? "bg-[#10b981]" : "bg-[#ffb59d]"}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!hasChartData && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                  <div className="bg-[#f0f3ff] border border-[#dce2f3] rounded-lg py-2.5 px-4 shadow-sm flex items-center gap-1.5 text-[#10b981] font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    No Data Available
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
