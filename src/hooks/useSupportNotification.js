import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";

let sharedAudioCtx = null;

function getSharedAudioContext(allowCreate = false) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx && allowCreate) {
    sharedAudioCtx = new AC();
  }
  return sharedAudioCtx;
}

/**
 * Alternate dual-tone beep for Support Tickets (distinct from the order chime).
 * Order chime is a soft 1318Hz -> 1046Hz bell.
 * Support alert is an energetic, high-clarity 880Hz -> 1175Hz double-pip.
 */
export const playSupportBeep = () => {
  try {
    const ctx = getSharedAudioContext(true);
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 880 Hz (A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.65, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.13);

    // Tone 2: 1174.66 Hz (D6), 140ms later
    setTimeout(() => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now2 = ctx.currentTime;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1174.66, now2);

      gain2.gain.setValueAtTime(0, now2);
      gain2.gain.linearRampToValueAtTime(0.75, now2 + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, now2 + 0.16);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now2);
      osc2.stop(now2 + 0.17);
    }, 140);
  } catch (e) {
    console.warn("[support] Audio alert error:", e);
  }
};

export const useSupportNotification = () => {
  const isInitialLoad = useRef(true);
  const ticketCache = useRef(new Map()); // id -> { replyCount, status }
  const addToast = useUiStore((s) => s.addToast);

  useEffect(() => {
    const unlockSupportAudio = () => {
      const ctx = getSharedAudioContext(true);
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlockSupportAudio);
    window.addEventListener("keydown", unlockSupportAudio);
    window.addEventListener("touchstart", unlockSupportAudio, { passive: true });

    // Listen to all support tickets in Firestore
    const colRef = collection(db, "supportTickets");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        // 1. Initial snapshot: cache existing state without firing audio
        if (isInitialLoad.current) {
          snapshot.docs.forEach((doc) => {
            const data = doc.data() || {};
            const replies = Array.isArray(data.replies) ? data.replies : [];
            ticketCache.current.set(doc.id, {
              replyCount: replies.length,
              status: data.status || "Open",
              subject: data.subject || data.title || "Support Ticket",
            });
          });
          isInitialLoad.current = false;
          return;
        }

        // 2. Process real-time changes
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const data = change.doc.data() || {};
          const replies = Array.isArray(data.replies) ? data.replies : [];
          const customerName = data.customerName || (data.userId ? `User #${data.userId.substring(0, 6)}` : "Customer");
          const subject = data.subject || data.title || "Support Ticket";

          if (change.type === "added") {
            if (!ticketCache.current.has(docId)) {
              ticketCache.current.set(docId, {
                replyCount: replies.length,
                status: data.status || "Open",
                subject,
              });

              // Alert for newly created ticket
              playSupportBeep();

              // In-app popup toast
              addToast(
                {
                  title: "🎫 New Customer Support Ticket",
                  message: `${subject} · From: ${customerName}`,
                  type: "warning",
                },
                "warning",
                7000
              );

              // Desktop browser notification
              if ("Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification("🎫 New Support Ticket: " + subject, {
                    body: `${customerName}: ${data.message || data.description || "New support request."}`.slice(0, 120),
                    icon: "/icon.jpg",
                    tag: `homebites-ticket-${docId}`,
                    renotify: true,
                  });
                } catch (err) {
                  console.warn("Desktop notification failed:", err);
                }
              }
            }
          } else if (change.type === "modified") {
            const prev = ticketCache.current.get(docId);
            const prevCount = prev ? prev.replyCount : 0;

            ticketCache.current.set(docId, {
              replyCount: replies.length,
              status: data.status || "Open",
              subject,
            });

            // Check if there is a new reply
            if (replies.length > prevCount) {
              const latestReply = replies[replies.length - 1];
              const role = String(latestReply?.senderRole || "").toLowerCase();

              // Only notify if reply is from Customer (not from Admin)
              if (role === "customer" || role === "user" || latestReply?.senderId === data.userId) {
                playSupportBeep();

                const senderName = latestReply?.senderName || customerName;
                const replyText = latestReply?.message || "Sent a message";

                // In-app popup toast
                addToast(
                  {
                    title: `💬 Support Reply from ${senderName}`,
                    message: `Ticket #${docId.substring(0, 6)}: ${replyText}`,
                    type: "info",
                  },
                  "info",
                  7000
                );

                // Desktop browser notification
                if ("Notification" in window && Notification.permission === "granted") {
                  try {
                    new Notification(`💬 Support Reply: ${senderName}`, {
                      body: replyText.slice(0, 120),
                      icon: "/icon.jpg",
                      tag: `homebites-ticket-reply-${docId}`,
                      renotify: true,
                    });
                  } catch (err) {
                    console.warn("Desktop notification failed:", err);
                  }
                }
              }
            }
          }
        });
      },
      (error) => {
        console.error("[useSupportNotification] listener error:", error);
      }
    );

    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlockSupportAudio);
      window.removeEventListener("keydown", unlockSupportAudio);
      window.removeEventListener("touchstart", unlockSupportAudio);
    };
  }, [addToast]);
};

export default useSupportNotification;
