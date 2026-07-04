import React from "react";

export const EmptyState = ({
  icon = "info",
  title = "No Data Found",
  description = "There is nothing to display here at the moment.",
  actionText = "",
  onActionClick = null
}) => {
  return (
    <div className="bg-white border border-[#dce2f3] rounded-xl p-8 md:p-12 text-center flex flex-col justify-center items-center gap-5 max-w-lg mx-auto shadow-sm">
      <div className="w-14 h-14 bg-[#ffdbd0]/50 rounded-full flex items-center justify-center text-[#10b981] shrink-0">
        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
      </div>
      
      <div className="space-y-1">
        <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">{title}</h3>
        <p className="font-body-sm text-body-sm text-[#555f6f] max-w-sm">{description}</p>
      </div>

      {actionText && onActionClick && (
        <button
          onClick={onActionClick}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-2 inner-shine"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {actionText}
        </button>
      )}
    </div>
  );
};
export default EmptyState;
