import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { ReportExportService } from "../services";
import { ExportModal } from "../components/ExportModal";
import * as repos from "../repositories";

export const Reports = () => {
  const { addToast } = useUiStore();
  const [datasetScope, setDatasetScope] = useState("sales");
  const [reportType, setReportType] = useState("monthly");
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const datasetCategories = [
    { id: "sales", label: "Sales & Revenue", icon: "payments" },
    { id: "customers", label: "Customers Directory", icon: "group" },
    { id: "delivery", label: "Rider Fleet & Payouts", icon: "local_shipping" },
    { id: "diet_meals", label: "Diet Meals & Macros", icon: "nutrition" },
    { id: "meal_plans", label: "Meal Plans & Subscriptions", icon: "calendar_month" },
    { id: "coupons", label: "Coupons & Redemptions", icon: "confirmation_number" },
    { id: "wallet", label: "Wallet & Ledger", icon: "account_balance_wallet" },
  ];

  const handleGenerate = async () => {
    setGenerating(true);
    setReportData(null);

    try {
      let headers = [];
      let rows = [];
      let title = "";

      if (datasetScope === "sales" || datasetScope === "orders") {
        title = "Sales & Revenue Ledger Report";
        headers = ["Order ID", "Customer", "Date", "Total Amount", "Payment Status", "Order Status"];
        const orders = await repos.orderRepository.getAll();
        rows = (orders || []).map(o => [
          o.id,
          o.customerName || o.customer || "Walk-in Customer",
          new Date(o.createdAt || Date.now()).toLocaleDateString(),
          `₹${o.totalAmount || o.total || 0}`,
          o.paymentStatus || "Paid",
          o.status || "Delivered"
        ]);
      } else if (datasetScope === "customers") {
        title = "Registered Customers Directory";
        headers = ["User ID", "Name", "Email", "Phone", "Status", "Joined Date"];
        const users = await repos.userRepository.getAll();
        rows = (users || []).map(u => [
          u.id,
          u.displayName || u.name || "Customer",
          u.email || "N/A",
          u.phone || u.mobileNumber || "N/A",
          u.status || "Active",
          new Date(u.createdAt || Date.now()).toLocaleDateString()
        ]);
      } else if (datasetScope === "diet_meals") {
        title = "Diet Meals & Macro Audit Report";
        headers = ["Food ID", "Meal Name", "Category", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fats (g)", "Price"];
        const dietFoods = await repos.dietFoodRepository.getAll();
        rows = (dietFoods || []).map(d => [
          d.id,
          d.name,
          d.categoryName || "Diet",
          d.calories || 0,
          d.proteinGrams || 0,
          d.carbsGrams || 0,
          d.fatsGrams || 0,
          `₹${d.discountedPrice || d.price || 0}`
        ]);
      } else if (datasetScope === "meal_plans") {
        title = "Meal Plans & Subscriptions Report";
        headers = ["Subscription ID", "Subscriber", "Plan Title", "Duration", "Daily Calories", "Price", "Status"];
        const subs = await repos.subscriptionRepository.getAll();
        rows = (subs || []).map(s => [
          s.id,
          s.userName || s.userId,
          s.planTitle || "Weekly Meal Plan",
          `${s.durationDays || 7} Days`,
          `${s.caloriesPerDay || 1800} kcal`,
          `₹${s.price || 0}`,
          s.status || "ACTIVE"
        ]);
      } else {
        title = "HomeBites Operational Dataset";
        headers = ["ID", "Module", "Description", "Timestamp"];
        const logs = await repos.auditLogRepository.getAll();
        rows = (logs || []).slice(0, 50).map(l => [
          l.id,
          l.module || "General",
          l.action || "Action",
          new Date(l.timestamp || Date.now()).toLocaleString()
        ]);
      }

      setReportData({ title, headers, rows, count: rows.length });
      addToast("Report dataset compiled successfully", "success");
    } catch (e) {
      console.error("Error generating report:", e);
      addToast("Failed to compile dataset report", "error");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    handleGenerate();
  }, [datasetScope]);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Executive Reports &amp; Exports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Compile comprehensive operational, financial, and nutrition ledgers with 1-click export.</p>
        </div>
        {reportData && reportData.rows.length > 0 && (
          <button
            onClick={() => setIsExportOpen(true)}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export PDF / Excel / CSV
          </button>
        )}
      </div>

      {/* Dataset Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {datasetCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setDatasetScope(cat.id)}
            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
              datasetScope === cat.id
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/20"
                : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{cat.icon}</span>
            <span className="text-[11px] leading-tight">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Compiled Data Table Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        
        {/* Table Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{reportData?.title || "Compiled Dataset"}</h3>
            <p className="text-xs text-slate-400">Total compiled rows: {reportData?.rows?.length || 0}</p>
          </div>
          {reportData && reportData.rows.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => ReportExportService.exportCSV(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                CSV
              </button>
              <button
                onClick={() => ReportExportService.exportExcel(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Excel
              </button>
              <button
                onClick={() => ReportExportService.exportPDF(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20"
              >
                PDF Print
              </button>
            </div>
          )}
        </div>

        {generating ? (
          <div className="flex justify-center py-20 text-slate-400 gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Compiling report dataset...</span>
          </div>
        ) : reportData && reportData.rows.length > 0 ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  {reportData.headers.map((h, i) => (
                    <th key={i} className="p-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`p-3.5 ${cIdx === 0 ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-400">
            No report data available for selected scope
          </div>
        )}

      </div>

      {/* Export Modal */}
      {reportData && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title={reportData.title}
          headers={reportData.headers}
          data={reportData.rows}
          defaultFilename={datasetScope}
        />
      )}

    </div>
  );
};
export default Reports;

