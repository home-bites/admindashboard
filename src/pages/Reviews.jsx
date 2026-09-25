import React, { useState, useEffect, useMemo } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useReviewStore } from "../store/reviewStore";
import { userRepository, menuItemRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Reviews = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { reviews, loading, error, subscribeReviews, disconnectReviews, deleteReview } = useReviewStore();

  const [users, setUsers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState("All");
  const [isDeletingId, setIsDeletingId] = useState(null);

  useEffect(() => {
    subscribeReviews();

    const fetchUsersAndItems = async () => {
      try {
        const [uList, mList] = await Promise.all([
          userRepository.getAll(),
          menuItemRepository.getAll(),
        ]);
        setUsers(uList || []);
        setMenuItems(mList || []);
      } catch (e) {
        console.warn("Failed to load users or menu items for reviews:", e.message);
      }
    };

    fetchUsersAndItems();
    return () => disconnectReviews();
  }, [subscribeReviews, disconnectReviews]);

  const userMap = useMemo(() => {
    return Object.fromEntries(users.map((u) => [u.id, u]));
  }, [users]);

  const menuItemMap = useMemo(() => {
    return Object.fromEntries(menuItems.map((m) => [m.id, m]));
  }, [menuItems]);

  const handleDelete = async (id, itemName) => {
    if (!window.confirm(`Are you sure you want to delete this review for "${itemName || "this item"}"?`)) {
      return;
    }
    setIsDeletingId(id);
    try {
      await deleteReview(id, user);
      addToast("Review deleted successfully", "success");
    } catch (err) {
      addToast(`Failed to delete review: ${err.message}`, "error");
    } finally {
      setIsDeletingId(null);
    }
  };

  const getInitials = (name) => {
    if (!name) return "C";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // KPI Computations
  const totalCount = reviews.length;
  const averageRating = totalCount > 0
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / totalCount).toFixed(1)
    : "0.0";

  const ratingBreakdown = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const fl = Math.floor(Number(r.rating || 0));
      if (counts[fl] !== undefined) counts[fl]++;
    });
    return counts;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const matchedUser = userMap[r.userId] || {};
      const matchedItem = menuItemMap[r.menuItemId] || {};

      const userName = matchedUser.displayName || [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(" ") || "";
      const userEmail = matchedUser.email || "";
      const itemName = matchedItem.name || matchedItem.title || "";
      const comment = r.review || r.comment || "";
      const orderId = r.orderId || "";

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        userName.toLowerCase().includes(q) ||
        userEmail.toLowerCase().includes(q) ||
        itemName.toLowerCase().includes(q) ||
        comment.toLowerCase().includes(q) ||
        orderId.toLowerCase().includes(q);

      const ratingVal = Number(r.rating || 0);
      const matchesRating = selectedRating === "All" || Math.floor(ratingVal) === Number(selectedRating);

      return matchesSearch && matchesRating;
    });
  }, [reviews, userMap, menuItemMap, searchQuery, selectedRating]);

  const formatDate = (val) => {
    if (!val) return "—";
    const d = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const renderStars = (rating) => {
    const filledStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const stars = [];

    for (let i = 1; i <= 5; i++) {
      if (i <= filledStars) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-amber-400 text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            star
          </span>
        );
      } else if (i === filledStars + 1 && hasHalfStar) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-amber-400 text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            star_half
          </span>
        );
      } else {
        stars.push(
          <span key={i} className="material-symbols-outlined text-slate-300 dark:text-slate-700 text-[17px]">
            star
          </span>
        );
      }
    }
    return stars;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Customer Reviews & Ratings
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Monitor culinary satisfaction, dish feedback, and moderate customer reviews.
          </p>
        </div>
      </div>

      {/* ── KPI & Ratings Breakdown Hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Score Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average Rating</span>
            <div className="flex items-baseline gap-3 mt-3">
              <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                {averageRating}
              </h2>
              <span className="text-slate-400 text-sm font-bold">/ 5.0</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              {renderStars(Number(averageRating))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Verified Reviews</span>
            <span className="font-black text-slate-900 dark:text-white text-sm">{totalCount}</span>
          </div>
        </div>

        {/* Center: Rating Distribution Meters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-2.5 flex flex-col justify-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Rating Breakdown</span>
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = ratingBreakdown[stars] || 0;
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            return (
              <div key={stars} className="flex items-center gap-2.5 text-xs">
                <span className="w-8 font-bold text-slate-600 dark:text-slate-400 flex items-center gap-0.5">
                  {stars} <span className="material-symbols-outlined text-[13px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                </span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stars >= 4 ? "bg-emerald-500" : stars === 3 ? "bg-amber-400" : "bg-rose-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-right font-bold text-slate-500 dark:text-slate-400 text-[11px]">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Sentiment Highlights */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">thumb_up</span>
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-600 mt-3">
                {totalCount > 0 ? Math.round(((ratingBreakdown[5] + ratingBreakdown[4]) / totalCount) * 100) : 0}%
              </p>
              <p className="text-[11px] font-semibold text-slate-400 mt-1">High Satisfaction (4-5★)</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">report</span>
            </div>
            <div>
              <p className="text-2xl font-black text-rose-600 mt-3">
                {ratingBreakdown[1] + ratingBreakdown[2]}
              </p>
              <p className="text-[11px] font-semibold text-slate-400 mt-1">Critical Issues (1-2★)</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar: Star Filter & Search ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Star Rating Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl">
          {["All", "5", "4", "3", "2", "1"].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedRating(s)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                selectedRating === s
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {s === "All" ? "All Stars" : `${s} ★`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dish, customer, or comment..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Reviews Grid / List ── */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400">Loading reviews...</span>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <span className="material-symbols-outlined text-2xl">star_outline</span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Reviews Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery || selectedRating !== "All"
              ? "No reviews match your selected filter or keyword search."
              : "Customer meal reviews and comments will populate here automatically."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReviews.map((rev) => {
            const matchedUser = userMap[rev.userId] || {};
            const matchedItem = menuItemMap[rev.menuItemId] || {};

            const userName =
              matchedUser.displayName ||
              [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(" ") ||
              `Customer #${rev.userId ? rev.userId.substring(0, 6) : "Anonymous"}`;

            const userEmail = matchedUser.email || matchedUser.phone || "Verified Customer";
            const itemName = matchedItem.name || matchedItem.title || `Dish #${rev.menuItemId ? rev.menuItemId.substring(0, 6) : "Meal"}`;
            const ratingNum = Number(rev.rating || 0);

            const isHigh = ratingNum >= 4;
            const isCritical = ratingNum <= 2;

            return (
              <div
                key={rev.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
              >
                {/* Header: Customer & Rating */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                      {getInitials(userName)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {userName}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{userEmail}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-0.5">
                      {renderStars(ratingNum)}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 block mt-1">
                      {formatDate(rev.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Dish & Order Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                    <span className="material-symbols-outlined text-[14px]">restaurant_menu</span>
                    {itemName}
                  </span>

                  {rev.orderId && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono text-[10px]">
                      Order #{rev.orderId.slice(-6)}
                    </span>
                  )}

                  {isCritical && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                      Requires Attention
                    </span>
                  )}
                </div>

                {/* Comment Text */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
                  &ldquo;{rev.review || rev.comment || "Rated without written comment."}&rdquo;
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono">
                    ID: {rev.id.slice(0, 8)}
                  </span>

                  <button
                    onClick={() => handleDelete(rev.id, itemName)}
                    disabled={isDeletingId === rev.id}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition text-xs font-bold flex items-center gap-1"
                    title="Delete inappropriate or spam review"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    {isDeletingId === rev.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Reviews;
