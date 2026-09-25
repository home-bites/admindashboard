import React, { useState, useEffect } from "react";
import * as repos from "../repositories";
import { useUiStore } from "../store/uiStore";
import { isActiveOrder, ACTIVE_ORDER_WINDOW } from "../lib/orderStages";

export function minsAgo(iso) {
  if (!iso) return "just now";
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

  const [ordersError, setOrdersError] = useState(null);
  const [windowSaturated, setWindowSaturated] = useState(false);

  useEffect(() => {
    const unsubOrders = repos.orderRepository.listenRecent(
      { limitTo: ACTIVE_ORDER_WINDOW },
      (items, meta) => {
        setOrders((items || []).filter(isActiveOrder));
        setWindowSaturated(
          Boolean(meta?.saturated) &&
            (items || []).filter(isActiveOrder).length > ACTIVE_ORDER_WINDOW * 0.8
        );
        setOrdersError(null);
      },
      (err) => setOrdersError(err.message || "Live order feed stopped.")
    );

    const unsubRiders = repos.deliveryPartnerRepository.subscribeToAll(
      (items) => {
        const list = items || [];
        setRiders(list);
        setLoading(false);
        if (!selectedRider && list.length > 0) {
          setSelectedRider(list[0]);
        }
      },
      () => setLoading(false)
    );

    return () => {
      if (typeof unsubOrders === "function") unsubOrders();
      if (typeof unsubRiders === "function") unsubRiders();
    };
  }, []);

  const onlineRiders = riders.filter((r) => r.isOnline);
  const lowBatteryRiders = riders.filter(
    (r) => typeof r.batteryLevel === "number" && r.batteryLevel <= 15
  );

  return (
    <div className="space-y-6">
      {/* ── Feed Warnings ── */}
      {ordersError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-rose-500">error</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Live order feed paused</p>
            <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
              {ordersError} Reload the page to re-establish live radar stream.
            </p>
          </div>
        </div>
      )}

      {windowSaturated && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-amber-500">warning</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Radar Window Saturated</p>
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              High volume service: over {ACTIVE_ORDER_WINDOW * 0.8} active orders in flight. Check Orders queue.
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Live Command Radar
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time fleet telemetry radar, order dispatch tracking, and rider telemetry tower.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {orders.length} In-Flight Orders
          </div>
          <div className="px-3.5 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {onlineRiders.length} Riders Online
          </div>
          {lowBatteryRiders.length > 0 && (
            <div className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">battery_alert</span>
              {lowBatteryRiders.length} Low Battery
            </div>
          )}
        </div>
      </div>

      {/* ── Radar Visualizer & Live Fleets Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Spatial Radar Visualizer */}
        <div className="lg:col-span-8 bg-slate-950 rounded-3xl border border-slate-800 p-6 relative overflow-hidden flex flex-col justify-between min-h-[460px] shadow-2xl">
          {/* Top HUD */}
          <div className="flex items-center justify-between z-10 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-mono font-black text-white uppercase tracking-wider">
                Guntur Metropolitan Telemetry Grid
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
              GPS STREAM: LIVE (2.0s FIX)
            </span>
          </div>

          {/* Sweeping Radar Graphic Simulation */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
            <div className="w-[520px] h-[520px] border border-emerald-500/20 rounded-full" />
            <div className="w-[380px] h-[380px] border border-emerald-500/30 rounded-full" />
            <div className="w-[240px] h-[240px] border border-emerald-500/40 rounded-full animate-pulse" />
            <div className="w-[100px] h-[100px] border border-emerald-500/60 rounded-full" />
            <div className="absolute w-[520px] h-0.5 bg-emerald-500/20" />
            <div className="absolute h-[520px] w-0.5 bg-emerald-500/20" />
          </div>

          {/* Center Coordinates Radar Tag */}
          <div className="z-10 my-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {riders.slice(0, 9).map((rider, idx) => {
                const isSelected = selectedRider?.id === rider.id;
                const isLowBat = typeof rider.batteryLevel === "number" && rider.batteryLevel <= 15;

                return (
                  <div
                    key={rider.id || idx}
                    onClick={() => setSelectedRider(rider)}
                    className={`p-3.5 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-emerald-500/20 border-emerald-500 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/40"
                        : "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/90"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${rider.isOnline ? "bg-emerald-400" : "bg-slate-600"}`} />
                        <span className="text-xs font-bold truncate">{rider.name || `Rider #${idx + 1}`}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">
                        {rider.currentSpeed ? `${rider.currentSpeed} km/h` : "Ready"}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono pt-2 border-t border-slate-800">
                      <span className="text-slate-400">
                        {rider.lastActiveAt ? minsAgo(rider.lastActiveAt) : "Online"}
                      </span>
                      {typeof rider.batteryLevel === "number" ? (
                        <span className={isLowBat ? "text-rose-400 font-bold flex items-center gap-0.5" : "text-slate-400"}>
                          {isLowBat ? "⚠ " : ""}{rider.batteryLevel}%
                        </span>
                      ) : (
                        <span className="text-slate-500">Bat --%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom HUD */}
          <div className="z-10 flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80 font-mono">
            <span>Click any rider card to inspect telemetry log & order assignment</span>
            <span className="text-emerald-400 font-bold">100% SIGNAL QUALITY</span>
          </div>
        </div>

        {/* Selected Rider Inspector & Live Queue */}
        <div className="lg:col-span-4 space-y-6">
          {/* Rider Details Inspector */}
          {selectedRider ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    {(selectedRider.name || "R").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      {selectedRider.name || "Delivery Partner"}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {selectedRider.phone || "No phone registered"}
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedRider.isOnline ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                }`}>
                  {selectedRider.isOnline ? "Online" : "Offline"}
                </span>
              </div>

              {/* Telemetry Strip */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Battery Level</span>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedRider.batteryLevel !== undefined ? `${selectedRider.batteryLevel}%` : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Last GPS Fix</span>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedRider.lastActiveAt ? minsAgo(selectedRider.lastActiveAt) : "Just now"}
                  </p>
                </div>
              </div>

              {/* Direct Actions */}
              {selectedRider.phone && (
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={`tel:${selectedRider.phone}`}
                    className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold text-center flex items-center justify-center gap-1.5 transition"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">call</span>
                    Call Rider
                  </a>
                  <a
                    href={`https://wa.me/${selectedRider.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5 transition"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">chat</span>
                    WhatsApp
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 text-center text-slate-400 text-xs">
              Select a rider on the radar to inspect telemetry.
            </div>
          )}

          {/* In-Flight Orders Queue */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                In-Flight Live Orders ({orders.length})
              </h3>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                Auto-Dispatched
              </span>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {orders.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No active orders in flight right now.
                </div>
              ) : (
                orders.map((o) => (
                  <div
                    key={o.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-600">Order #{o.id.slice(-6)}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                        {o.status || "Preparing"}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {o.customerName || "Customer"}
                    </p>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                      <span>{(o.items || []).length} items</span>
                      <span className="font-black text-slate-900 dark:text-white">
                        ₹{Number(o.total || o.totalAmount || 0)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveCommandCenter;
