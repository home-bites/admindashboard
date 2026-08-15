import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase/firebaseConfig';
import LiveDeliveryMap from '../components/LiveDeliveryMap';
import { useDeliveryPartnerStore } from '../store/deliveryPartnerStore';
import { useUiStore } from '../store/uiStore';

/**
 * Live orders that are out with a rider.
 *
 * This page previously rendered two hardcoded rows — "John Doe" and
 * "Jane Smith" at invented addresses — and its OTP button called alert()
 * and flipped a local flag. Nothing here touched Firestore, so it showed
 * the same two fictional deliveries whatever was actually happening, and
 * "verifying" a code changed nothing anywhere.
 *
 * A page that looks like it works is worse than one that is obviously
 * unfinished: someone could have marked a real delivery complete here and
 * believed it.
 *
 * ---
 *
 * Layout note. This was built with MUI's `<Grid xs={12} md={4}>`, which is
 * the *v5* API. The project is on MUI v9, where Grid took the Grid2 shape and
 * those props no longer exist — breakpoints are read from `size={{...}}`.
 * Unknown props are ignored silently, so both columns fell back to full width
 * and stacked on top of the map. That is the overlap.
 *
 * Rather than correct the prop, this is now Tailwind like the other
 * twenty-nine pages. Fixing `size=` would have squared up the columns but left
 * a page with MUI's type scale, spacing unit and shadows sitting next to
 * pages that use none of them — aligned, but still visibly from a different
 * product.
 */

/** Statuses that mean "the food has left the kitchen". */
const LIVE_STATUSES = ['ready', 'out_for_delivery', 'outfordelivery', 'assigned'];

const STATUS_STYLES = {
  ready:            { label: 'Ready',            dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  assigned:         { label: 'Assigned',         dot: 'bg-sky-500',     pill: 'bg-sky-50 text-sky-700 border-sky-200' },
  out_for_delivery: { label: 'Out for delivery', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  outfordelivery:   { label: 'Out for delivery', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const DeliveryDashboard = () => {
  const { addToast } = useUiStore();
  const {
    deliveryPartners,
    subscribeDeliveryPartners,
    disconnectDeliveryPartners,
  } = useDeliveryPartnerStore();

  useEffect(() => {
    subscribeDeliveryPartners?.();
    return () => disconnectDeliveryPartners?.();
  }, [subscribeDeliveryPartners, disconnectDeliveryPartners]);

  const [assignedOrders, setAssignedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [otpInputs, setOtpInputs] = useState({});
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    // Orders that have left the kitchen. Filtered in JS rather than with a
    // compound where(): status casing varies between the clients that write
    // it, and an `in` query would silently miss any spelling not listed.
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const live = [];
        snap.forEach((d) => {
          const o = d.data() || {};
          const status = String(o.status || '').toLowerCase().replace(/\s+/g, '_');
          if (o.isDeleted === true) return;
          if (!LIVE_STATUSES.includes(status)) return;
          live.push({
            id: d.id,
            orderId: o.orderId || d.id,
            customerName: o.customerName || 'Customer',
            phone: o.customerPhone || o.customerMobile || '',
            address:
              o.deliveryAddress?.addressLine ||
              o.deliveryAddress?.doorInfo ||
              'See map link',
            rider: o.assignedPartnerName || '',
            status,
          });
        });
        setAssignedOrders(live);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const onlineRiders = useMemo(
    () => (deliveryPartners || []).filter((r) => r.isOnline).length,
    [deliveryPartners],
  );

  const unassigned = useMemo(
    () => assignedOrders.filter((o) => !o.rider).length,
    [assignedOrders],
  );

  const handleOtpChange = (id, value) => {
    // Digits only. The code is always four digits, so filtering here stops a
    // pasted "OTP: 1234" from failing a validation the admin cannot see.
    const clean = value.replace(/\D/g, '').slice(0, 4);
    setOtpInputs((prev) => ({ ...prev, [id]: clean }));
  };

  /**
   * Confirms handover using the same server-side check the rider's app uses.
   *
   * The old stub compared nothing and simply announced success. The real
   * check has to happen in a Cloud Function: the delivery code is the only
   * evidence the food reached the person who ordered it, and a check the
   * client performs is a check the client can skip.
   */
  const handleVerifyOtp = async (id) => {
    const code = String(otpInputs[id] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      addToast('Enter the 4-digit code the customer gives you.', 'error');
      return;
    }
    setBusyId(id);
    try {
      await httpsCallable(getFunctions(), 'verifyDeliveryCode')({
        orderId: id,
        code,
      });
      // No local state change: the snapshot listener above removes the order
      // once its status moves on. One source of truth, not two.
      setOtpInputs((prev) => ({ ...prev, [id]: '' }));
      addToast('Delivery confirmed', 'success');
    } catch (e) {
      addToast(e?.message || 'That code did not match.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Delivery Tracking
          </h1>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            Orders that have left the kitchen, and where the riders are now.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Stat label="Out now" value={loading ? '—' : assignedOrders.length} />
          <Stat label="Riders online" value={onlineRiders} tone={onlineRiders === 0 ? 'warn' : 'ok'} />
          <Stat label="Unassigned" value={unassigned} tone={unassigned > 0 ? 'warn' : 'ok'} />
        </div>
      </div>

      {/*
        Explicit two-column grid with minmax(0, …) on both tracks.

        Without the `0` minimum a grid column refuses to shrink below the
        intrinsic width of its content — a long delivery address in the order
        list, or the map canvas on the right — and the tracks push past the
        container instead of fitting inside it. That is the "compressed"
        half of the problem, and it is separate from the MUI prop bug.
      */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* ---- Order list ---------------------------------------------- */}
        <section className="flex min-w-0 flex-col rounded-xl border border-[#dce2f3] bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Active deliveries
            </h2>
            {!loading && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {assignedOrders.length}
              </span>
            )}
          </header>

          {/*
            The list scrolls inside a bounded box instead of growing the page.
            With twenty orders out, an unbounded column left the map stranded
            far above the fold — you had to scroll past every order to see
            where anyone was.
          */}
          <div className="max-h-[calc(100vh-260px)] min-h-[240px] space-y-3 overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center gap-2 py-8 text-xs font-semibold text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                Loading live deliveries…
              </div>
            )}

            {!loading && assignedOrders.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300">
                  delivery_dining
                </span>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Nothing out for delivery
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                  Orders appear here once the kitchen marks them ready.
                </p>
              </div>
            )}

            {assignedOrders.map((order) => {
              const s = STATUS_STYLES[order.status] || {
                label: order.status.replace(/_/g, ' '),
                dot: 'bg-slate-400',
                pill: 'bg-slate-50 text-slate-600 border-slate-200',
              };
              const code = otpInputs[order.id] || '';
              const busy = busyId === order.id;

              return (
                <article
                  key={order.id}
                  className="rounded-lg border border-[#dce2f3] bg-white p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-mono text-xs font-bold text-slate-900">
                      {order.orderId}
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.pill}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </div>

                  <dl className="mt-3 space-y-1.5">
                    <Row icon="person" value={order.customerName} />
                    {order.phone && (
                      <Row
                        icon="call"
                        value={
                          <a
                            href={`tel:${order.phone}`}
                            className="text-slate-700 hover:text-emerald-600 hover:underline"
                          >
                            {order.phone}
                          </a>
                        }
                      />
                    )}
                    <Row icon="location_on" value={order.address} />
                    <Row
                      icon="two_wheeler"
                      value={
                        order.rider || (
                          <span className="font-bold text-amber-600">
                            Unassigned
                          </span>
                        )
                      }
                    />
                  </dl>

                  <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                    <input
                      value={code}
                      onChange={(e) => handleOtpChange(order.id, e.target.value)}
                      inputMode="numeric"
                      placeholder="4-digit code"
                      aria-label={`Delivery code for ${order.orderId}`}
                      className="w-full min-w-0 rounded-lg border border-[#d3daea] bg-white px-3 py-2 font-mono text-xs font-semibold tracking-[0.3em] text-slate-700 transition-all focus:border-[#10b981] focus:outline-none focus:ring-2 focus:ring-[#10b981]/10"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyOtp(order.id)}
                      disabled={code.length !== 4 || busy}
                      className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    >
                      {busy ? 'Checking…' : 'Verify'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---- Map ------------------------------------------------------ */}
        <section className="flex min-w-0 flex-col rounded-xl border border-[#dce2f3] bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Rider positions
            </h2>
            <span className="text-[11px] font-semibold text-slate-400">
              Updates as riders report
            </span>
          </header>

          {/* Height is tied to the viewport so the map and the order list end
              on the same line, instead of one dangling below the other. */}
          <div className="p-4">
            <LiveDeliveryMap
              riders={deliveryPartners || []}
              className="h-[calc(100vh-300px)] min-h-[360px] w-full"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

/** One labelled figure in the header strip. */
function Stat({ label, value, tone = 'ok' }) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-[#dce2f3] bg-white text-slate-700';
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-center ${toneClass}`}>
      <div className="text-base font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
        {label}
      </div>
    </div>
  );
}

/** Icon + value line inside an order card. */
function Row({ icon, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined mt-px shrink-0 text-[15px] leading-none text-slate-400">
        {icon}
      </span>
      <span className="min-w-0 break-words text-xs font-semibold text-slate-600">
        {value}
      </span>
    </div>
  );
}

export default DeliveryDashboard;
