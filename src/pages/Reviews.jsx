import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useReviewStore } from "../store/reviewStore";
import { userRepository, menuItemRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Reviews = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { reviews, loading, error, fetchReviews, deleteReview } = useReviewStore();

  const [users, setUsers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState("All");
  const [isDeletingId, setIsDeletingId] = useState(null);

  useEffect(() => {
    fetchReviews();

    const fetchUsersAndItems = async () => {
      try {
        const [uList, mList] = await Promise.all([
          userRepository.getAll(),
          menuItemRepository.getAll()
        ]);
        setUsers(uList);
        setMenuItems(mList);
      } catch (e) {
        console.warn("Failed to load users or menu items for mapping:", e.message);
      }
    };

    fetchUsersAndItems();
  }, [fetchReviews]);

  // Create lookups
  const userMap = users.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});

  const menuItemMap = menuItems.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});

  const handleDelete = async (id, itemName) => {
    if (confirm(`Are you sure you want to delete the review for "${itemName || "this item"}"? This action cannot be undone.`)) {
      setIsDeletingId(id);
      try {
        await deleteReview(id, user);
        addToast("Review deleted successfully.", "success");
      } catch (err) {
        addToast(`Failed to delete review: ${err.message}`, "error");
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Filter reviews
  const filteredReviews = reviews.filter((r) => {
    const matchedUser = userMap[r.userId] || {};
    const matchedItem = menuItemMap[r.menuItemId] || {};
    
    const userName = matchedUser.displayName || "";
    const userEmail = matchedUser.email || "";
    const itemName = matchedItem.name || "";
    const comment = r.review || "";

    const matchesSearch =
      userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comment.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.orderId && r.orderId.toLowerCase().includes(searchQuery.toLowerCase()));

    const ratingVal = Number(r.rating);
    const matchesRating = selectedRating === "All" || Math.floor(ratingVal) === Number(selectedRating);

    return matchesSearch && matchesRating;
  });

  // Calculate KPIs
  const totalCount = reviews.length;
  const averageRating = totalCount > 0 
    ? (reviews.reduce((sum, r) => sum + Number(r.rating), 0) / totalCount).toFixed(1)
    : "0.0";
  
  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const floorRating = Math.floor(Number(r.rating));
    if (ratingBreakdown[floorRating] !== undefined) {
      ratingBreakdown[floorRating]++;
    }
  });

  const formatDate = (val) => {
    if (!val) return "";
    if (val.toDate) {
      return val.toDate().toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (val.seconds) {
      return new Date(val.seconds * 1000).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return new Date(val).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderStars = (rating) => {
    const filledStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const stars = [];

    for (let i = 1; i <= 5; i++) {
      if (i <= filledStars) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-[#10b981] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            star
          </span>
        );
      } else if (i === filledStars + 1 && hasHalfStar) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-[#10b981] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            star_half
          </span>
        );
      } else {
        stars.push(
          <span key={i} className="material-symbols-outlined text-gray-300 text-[18px]">
            star
          </span>
        );
      }
    }
    return stars;
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27] font-semibold">Customer Reviews</h2>
          <p className="font-body-md text-body-md text-[#475569] mt-1">
            Monitor ratings, comments, and moderate inappropriate or spam reviews.
          </p>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Average Rating Card */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#10b981]/5 rounded-full blur-xl group-hover:bg-[#10b981]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ffdad6] rounded-lg text-[#10b981]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            </div>
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#ecfdf5] text-[#006c49] rounded-full border border-[#10b981]/20 font-semibold">
              Live Ratings
            </span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Average Score</p>
          <div className="flex items-baseline gap-2">
            <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">{averageRating}</h3>
            <span className="text-gray-400">/ 5.0</span>
          </div>
        </div>

        {/* Total Reviews Card */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#0F2C25]/5 rounded-full blur-xl group-hover:bg-[#0F2C25]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#f0f3ff] rounded-lg text-[#0F2C25]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>rate_review</span>
            </div>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Total Reviews</p>
          <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">{totalCount}</h3>
        </div>

        {/* 5-Star Card */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#00af79]/5 rounded-full blur-xl group-hover:bg-[#00af79]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ecfdf5] rounded-lg text-[#006c49]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>thumb_up</span>
            </div>
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#ecfdf5] text-[#006c49] rounded-full border border-[#10b981]/20 font-semibold">
              {totalCount > 0 ? Math.round((ratingBreakdown[5] / totalCount) * 100) : 0}% of total
            </span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">5-Star Reviews</p>
          <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">{ratingBreakdown[5]}</h3>
        </div>

        {/* Low Score (1 & 2 Star) Card */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#ba1a1a]/5 rounded-full blur-xl group-hover:bg-[#ba1a1a]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ffdad6] rounded-lg text-[#ba1a1a]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>thumb_down</span>
            </div>
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#ffdad6] text-[#ba1a1a] rounded-full border border-[#ffb59d]/20 font-semibold text-[10px]">
              Requires Attention
            </span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Low Scores (1-2★)</p>
          <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">
            {ratingBreakdown[1] + ratingBreakdown[2]}
          </h3>
        </div>
      </div>

      {/* List Card */}
      <div className="bg-white border border-[#dce2f3] rounded-xl shadow-sm flex flex-col">
        {/* Filters and Search */}
        <div className="p-5 border-b border-[#dce2f3] flex flex-wrap justify-between items-center bg-[#f9f9ff] gap-4 rounded-t-xl">
          <div className="flex items-center gap-2">
            {["All", "5", "4", "3", "2", "1"].map((stars) => (
              <button
                key={stars}
                onClick={() => setSelectedRating(stars)}
                className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm transition-colors ${
                  selectedRating === stars
                    ? "bg-[#10b981] text-white"
                    : "bg-[#f0f3ff] text-[#151c27] hover:bg-[#e7eefe]"
                }`}
              >
                {stars === "All" ? "All Stars" : `${stars} ★`}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555f6f]/60 text-sm">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-[#d3daea] rounded-lg text-xs font-body-sm w-64 focus:outline-none focus:border-[#10b981]"
              placeholder="Search by customer, item, or comment..."
              type="text"
            />
          </div>
        </div>

        {/* Content body */}
        {loading ? (
          <div className="p-8">
            <LoadingComponents.LoadingTable rows={4} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 font-body-md">
            Error loading reviews: {error}
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon="star"
              title="No Reviews Found"
              description={searchQuery || selectedRating !== "All" ? "No reviews match your filter criteria." : "No reviews have been submitted by customers yet."}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#dce2f3]/40">
            {filteredReviews.map((rev) => {
              const matchedUser = userMap[rev.userId] || {};
              const matchedItem = menuItemMap[rev.menuItemId] || {};
              const userName = matchedUser.displayName || `Customer #${rev.userId.substring(0, 6)}`;
              const userEmail = matchedUser.email || "No Email Provided";
              const itemName = matchedItem.name || `Dish #${rev.menuItemId.substring(0, 6)}`;

              return (
                <div key={rev.id} className="p-6 hover:bg-[#f9f9ff]/40 transition-colors flex gap-6 items-start">
                  {/* Customer initials avatar */}
                  <div className="w-12 h-12 rounded-full bg-[#0F2C25] text-white flex items-center justify-center font-bold text-md shrink-0 shadow-sm">
                    {getInitials(userName)}
                  </div>

                  {/* Review Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <h4 className="font-label-lg text-label-lg font-bold text-[#151c27]">{userName}</h4>
                        <p className="font-body-sm text-body-sm text-[#555f6f]">{userEmail}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          {renderStars(Number(rev.rating))}
                          <span className="font-bold text-label-md text-[#151c27] ml-1">{Number(rev.rating).toFixed(1)}</span>
                        </div>
                        <p className="font-body-sm text-body-sm text-gray-400 mt-1">{formatDate(rev.createdAt)}</p>
                      </div>
                    </div>

                    <div className="bg-[#f0f3ff]/20 border border-[#dce2f3]/40 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between items-baseline">
                        <span className="font-label-sm text-label-sm text-[#10b981] font-bold uppercase tracking-wider">
                          Dish: {itemName}
                        </span>
                        {rev.orderId && (
                          <span className="text-[10px] text-[#555f6f] font-mono">
                            Order: #{rev.orderId}
                          </span>
                        )}
                      </div>
                      {rev.review ? (
                        <p className="font-body-md text-body-md text-[#151c27] italic mt-1">
                          "{rev.review}"
                        </p>
                      ) : (
                        <p className="font-body-md text-body-md text-gray-400 italic mt-1">
                          No text comment provided.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action block */}
                  <div className="shrink-0">
                    <button
                      disabled={isDeletingId === rev.id}
                      onClick={() => handleDelete(rev.id, itemName)}
                      className="p-2 text-[#ba1a1a] hover:bg-[#ffdad6]/60 rounded-lg transition-colors duration-150 flex items-center justify-center disabled:opacity-50"
                      title="Delete Review"
                    >
                      {isDeletingId === rev.id ? (
                        <LoadingComponents.Spinner className="w-5 h-5 text-[#ba1a1a]" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reviews;
