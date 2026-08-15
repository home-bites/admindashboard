import React, { useState, useEffect } from "react";
import * as repos from "../repositories";
import { useUiStore } from "../store/uiStore";

export /**
 * Human-readable age of a rider's last position report.
 *
 * The radar previously showed only an online dot, which stays green off a
 * stale `isOnline` flag long after the handset stopped reporting. Age is the
 * honest signal: a rider "online" but last seen 20 minutes ago is a rider
 * whose phone is in a pocket with no signal.
 */
function minsAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const LiveCommandCenter = () => {
  const { addToast } = useUiStore();
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRider, setSelectedRider] = useState(null);

  useEffect(() => {
    const unsubOrders = repos.orderRepository.subscribeToAll((items) => {
      const active = (items || []).filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled');
      setOrders(active);
    });

    const unsubRiders = repos.deliveryPartnerRepository.subscribeToAll((items) => {
      setRiders(items || []);
      setLoading(false);
    });

    return () => {
      if (typeof unsubOrders === 'function') unsubOrders();
      if (typeof unsubRiders === 'function') unsubRiders();
    };
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Live Command Radar</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time rider location tracking, order status radar, and dispatch control tower.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 font-bold text-xs">
            {orders.length} Active In-Flight Orders
          </div>
          <div className="px-3.5 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400 font-bold text-xs">
            {riders.filter(r => r.isOnline).length} Riders Online
          </div>
          {riders.filter(r => typeof r.batteryLevel === "number" && r.batteryLevel <= 15).length > 0 && (
            <div className="px-3.5 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 font-bold text-xs">
              {riders.filter(r => typeof r.batteryLevel === "number" && r.batteryLevel <= 15).length} Low Battery
            </div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Spatial Radar Map Visualizer */}
        <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-6 relative overflow-hidden flex flex-col justify-between min-h-[420px]">
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400">radar</span>
              <span className="text-xs font-bold text-white uppercase tracking-wider">Metropolitan Zone 1 Telemetry Radar</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              GPS STREAM: LIVE (2.4s interval)
            </span>
          </div>

          {/* Radar Circles Visualizer */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-96 h-96 border border-emerald-500/40 rounded-full animate-ping"></div>
            <div className="w-64 h-64 border border-emerald-500/40 rounded-full"></div>
            <div className="w-32 h-32 border border-emerald-500/40 rounded-full"></div>
          </div>

          {/* Rider Nodes Simulated Spatial Map */}
          <div className="relative my-12 grid grid-cols-2 sm:grid-cols-3 gap-4 z-10">
            {riders.slice(0, 6).map((rider, idx) => (
              <div
                key={rider.id || idx}
                onClick={() => setSelectedRider(rider)}
                className={`p-3 rounded-xl border backdrop-blur-md cursor-pointer transition-all duration-200 ${
                  selectedRider?.id === rider.id
                    ? "bg-emerald-500/20 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500/30"
                    : "bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate">{rider.name || `Rider #${idx + 1}`}</span>
                  <span className={`w-2 h-2 rounded-full ${rider.isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                </div>
                {/* Real telemetry, or an honest gap.
                    Both figures here used to be literals — every rider showed
                    "24 km/h" and "92%" whatever their handset was doing. A
                    dispatcher reading a full battery on a rider about to go
                    dark is worse off than one shown nothing at all. */}
                <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">
                    {rider.lastActiveAt
                      ? `Seen ${minsAgo(rider.lastActiveAt)}`
                      : "No fix yet"}
                  </span>
                  {typeof rider.batteryLevel === "number" ? (
                    <span
                      className={
                        rider.batteryLevel <= 15
                          ? "text-red-400 font-bold"
                          : rider.batteryLevel <= 30
                            ? "text-amber-400"
                            : "text-slate-400"
                      }
                      title={
                        rider.batteryLevel <= 15
                          ? "This rider may go offline mid-delivery"
                          : "Handset battery"
                      }
                    >
                      {rider.batteryLevel <= 15 ? "\u26a0 " : ""}
                      {rider.batteryLevel}%
                    </span>
                  ) : (
                    <span className="text-slate-600">Battery n/a</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="z-10 flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <span>Click any rider card to inspect telemetry log &amp; active order assignment</span>
            <span className="text-emerald-400 font-semibold">100% Signal Quality</span>
          </div>
        </div>

        {/* Live Active Orders Queue */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">In-Flight Live Orders ({orders.length})</h3>
            <span className="text-xs font-bold text-emerald-600">Auto-Dispatch</span>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {orders.length > 0 ? (
              orders.map(order => (
                <div key={order.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">Order #{order.id.slice(-6)}</span>
                    <span className="font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px]">{order.status || 'Preparing'}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{order.customerName || 'Customer'}</div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Items: {(order.items || []).length}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">₹{order.totalAmount || order.total || 0}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                No active in-flight orders right now
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
export default LiveCommandCenter;
