import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useOrderStore } from "../store/orderStore";
import * as LoadingComponents from "../components/LoadingComponents";

export const Analytics = () => {
  const { addToast } = useUiStore();
  const [timeframe, setTimeframe] = useState("month");
  const { orders, subscribeOrders, disconnectOrders, loading } = useOrderStore();

  useEffect(() => {
    subscribeOrders();
    return () => disconnectOrders();
  }, [subscribeOrders, disconnectOrders]);

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    addToast(`Timeframe changed to ${tf}`, "info");
  };

  // --- Real-time Financial Calculations ---
  const deliveredOrders = orders.filter(o => o.status === "Delivered");
  
  // Gross Sales (total customer invoices)
  const grossSales = deliveredOrders.reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
  
  // Total Orders count
  const totalOrders = deliveredOrders.length;
  
  // Average Order Value (AOV)
  const avgOrderValue = totalOrders > 0 ? (grossSales / totalOrders) : 0;
  
  // Breakdown
  const totalDiscounts = deliveredOrders.reduce((sum, o) => sum + Number(o.discountAmount || o.discount || 0), 0);
  const totalTaxes = deliveredOrders.reduce((sum, o) => sum + Number(o.tax || o.taxAmount || 0), 0);
  const totalDelivery = deliveredOrders.reduce((sum, o) => sum + Number(o.deliveryFee || o.deliveryCharge || 0), 0);
  
  // Net Profit (gross sales minus tax, delivery, discounts)
  const netProfit = Math.max(0, grossSales - totalDiscounts - totalTaxes - totalDelivery);

  // --- 7-Day Revenue Trend Chart Calculations ---
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  }).reverse();

  const dailyRevenue = last7Days.map(date => {
    const dateStr = date.toDateString();
    return orders
      .filter(o => o.status === "Delivered" && o.createdAt && new Date(o.createdAt).toDateString() === dateStr)
      .reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
  });

  const maxDailyRevenue = Math.max(...dailyRevenue, 100);

  // --- Payment Methods Split ---
  const codRevenue = orders.filter(o => o.status === "Delivered" && (o.paymentMethod === "COD" || o.paymentMethod === "Cash")).reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
  const walletRevenue = orders.filter(o => o.status === "Delivered" && o.paymentMethod === "Wallet").reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
  const razorpayRevenue = orders.filter(o => o.status === "Delivered" && o.paymentMethod === "Razorpay").reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
  
  const totalRev = codRevenue + walletRevenue + razorpayRevenue || 1;
  const codPct = Math.round((codRevenue / totalRev) * 100);
  const walletPct = Math.round((walletRevenue / totalRev) * 100);
  const razorpayPct = Math.round((razorpayRevenue / totalRev) * 100);

  // --- Top Selling Items ---
  const itemCounts = {};
  orders.forEach(o => {
    if (o.status === "Delivered" && o.items) {
      o.items.forEach(item => {
        const name = item.name;
        const qty = Number(item.qty || item.quantity || 1);
        itemCounts[name] = (itemCounts[name] || 0) + qty;
      });
    }
  });

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const hasChartData = grossSales > 0;

  if (loading && orders.length === 0) {
    return <LoadingComponents.LoadingPage />;
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
        <div className="inline-flex rounded-lg border border-[#dce2f3] bg-white p-1 shadow-sm">
          {["day", "week", "month", "year"].map((tf) => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-4 py-1.5 rounded font-label-sm text-label-sm capitalize transition-all ${
                timeframe === tf
                  ? "bg-[#10b981] text-white shadow-sm font-semibold"
                  : "text-[#555f6f] hover:text-[#151c27]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Metric 1: Net Revenue */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981]"></div>
          <div className="flex justify-between items-start">
            <p className="font-label-md text-label-md text-[#555f6f] uppercase tracking-wider">Net Profit</p>
            <span className="material-symbols-outlined text-[#10b981] text-[20px]">account_balance</span>
          </div>
          <div>
            <h3 className="font-headline-display text-headline-display text-[#151c27]">₹{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-[#006c49] bg-[#006c49]/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              Live Data
            </span>
            <span className="font-body-sm text-body-sm text-[#555f6f]">from delivered orders</span>
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
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-[#006c49] bg-[#006c49]/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              Active
            </span>
            <span className="font-body-sm text-body-sm text-[#555f6f]">total customer spend</span>
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
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-[#006c49] bg-[#ecfdf5] px-2 py-0.5 rounded-full">
              Real-time
            </span>
            <span className="font-body-sm text-body-sm text-[#555f6f]">delivered orders count</span>
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
            <span className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">Net Profit</span>
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
