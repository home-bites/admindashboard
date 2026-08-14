import { useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

/**
 * One AudioContext for the life of the page, unlocked by the first click.
 *
 * Browsers refuse to start audio until the user has interacted with the page.
 * Creating a fresh AudioContext at ring time meant a dashboard left open on a
 * kitchen screen — opened once, then never touched — was born suspended and
 * stayed silent for every order of the night. resume() inside the ring is too
 * late: it returns a promise that resolves after the tones were scheduled.
 *
 * Creating it once and resuming on the first real interaction means the very
 * first order still rings, provided someone has clicked the page at any point.
 */
let sharedCtx = null;

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

function unlockAudio() {
  const ctx = audioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

// Synthesizes a loud, 2-tone "ding-dong" chime using the browser's native AudioContext
const playLoudRing = () => {
  try {
    const ctx = audioCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // First tone: E6
    osc.type = "sine";
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime); 
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
    
    // Second tone: C6 (plays 400ms later)
    setTimeout(() => {
      if (ctx.state === 'suspended') ctx.resume();
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1046.50, ctx.currentTime); 
      
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.0);
      
      osc2.start();
      osc2.stop(ctx.currentTime + 2.0);
    }, 400);

  } catch (e) {
    console.warn("AudioContext play failed - user might not have interacted with the document yet.", e);
  }
};

export const useOrderNotification = () => {
  const isInitialLoad = useRef(true);
  const processedOrders = useRef(new Set());

  useEffect(() => {
    // Request desktop notification permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    // Unlock audio on the first interaction of any kind, then stop listening.
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    // Every writer in this system creates orders with "Pending" — the
    // website, the app and six places in Cloud Functions. This listened for
    // lowercase "pending", matched nothing, and so had never fired once
    // since it was written. The alert wasn't broken; it was watching a
    // status that does not exist.
    //
    // The variants are listed rather than normalised because Firestore
    // compares strings exactly, and an `in` query stays provably safe against
    // the security rules.
    const q = query(
      collection(db, "orders"),
      where("status", "in", ["Pending", "pending", "PENDING"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 1. Ignore the initial load snapshot
      if (isInitialLoad.current) {
        snapshot.docs.forEach(doc => processedOrders.current.add(doc.id));
        isInitialLoad.current = false;
        return;
      }

      let hasNewOrder = false;
      const newOrders = [];

      // 2. Check for newly added docs
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          if (!processedOrders.current.has(change.doc.id)) {
            hasNewOrder = true;
            processedOrders.current.add(change.doc.id);
            newOrders.push({ id: change.doc.id, ...change.doc.data() });
          }
        }
      });

      // 3. Trigger alerts if we found one
      if (hasNewOrder) {
        playLoudRing();

        if ("Notification" in window && Notification.permission === "granted") {
          try {
            // Naming the order and its value means the kitchen can triage
            // from the notification itself instead of switching windows.
            const n = newOrders.length;
            const first = newOrders[0] || {};
            const total = first.grandTotal ?? first.totalAmount ?? 0;
            new Notification(
              n > 1 ? `${n} new orders received` : "New order received",
              {
                body: n > 1
                  ? "Open the dashboard to see them."
                  : `${first.orderId || "Order"} · ₹${total}${
                      first.paymentMethod === "COD" ? " · Cash on delivery" : ""
                    }`,
                icon: "/icon.jpg",
                // Replaces an unread alert rather than stacking twenty of
                // them during a dinner rush.
                tag: "homebites-new-order",
                renotify: true,
              },
            );
          } catch (e) {
            console.warn("Desktop notification failed", e);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);
};
