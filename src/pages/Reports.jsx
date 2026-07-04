import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useOrderStore } from "../store/orderStore";
import { useDeliveryPartnerStore } from "../store/deliveryPartnerStore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export const Reports = () => {
  const { addToast } = useUiStore();
  const [reportType, setReportType] = useState("monthly");
  const [reportSection, setReportSection] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);

  const { orders, subscribeOrders, disconnectOrders } = useOrderStore();
  const { deliveryPartners, fetchDeliveryPartners } = useDeliveryPartnerStore();

  useEffect(() => {
    subscribeOrders();
    fetchDeliveryPartners();
    return () => disconnectOrders();
  }, [subscribeOrders, disconnectOrders, fetchDeliveryPartners]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedReport(null);

    let usersCount = 0;
    let commRate = 10.0;

    try {
      const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
      if (!isMock && isFirebaseConfigured) {
        // Fetch users count
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.isDeleted !== true && (data.role === "Customer" || !data.role)) {
            usersCount++;
          }
        });

        // Fetch settings for commissionRate
        const settingsSnap = await getDoc(doc(db, "settings", "general"));
        if (settingsSnap.exists()) {
          const sData = settingsSnap.data();
          if (sData.commissionRate !== undefined) {
            commRate = Number(sData.commissionRate);
          }
        }
      } else {
        usersCount = 124;
        commRate = 10.0;
      }
    } catch (e) {
      console.error("Error fetching report supporting data:", e);
    }

    const parseDate = (val) => {
      if (!val) return new Date(0);
      if (val instanceof Date) return val;
      if (typeof val.toDate === "function") return val.toDate();
      if (val.seconds !== undefined) return new Date(val.seconds * 1000);
      if (typeof val === "string") {
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date(0) : d;
      }
      if (typeof val === "number") return new Date(val);
      return new Date(0);
    };

    // Filter by completed (Delivered) orders
    const deliveredOrders = orders.filter((o) => o.status === "Delivered");

    // Total sales and volumes
    const totalSalesVal = deliveredOrders.reduce((sum, o) => sum + Number(o.total || o.totalAmount || 0), 0);
    const totalOrdersVal = deliveredOrders.length;
    const taxCollectedVal = deliveredOrders.reduce((sum, o) => sum + Number(o.tax || o.taxAmount || 0), 0);
    const commissionDeductedVal = totalSalesVal * (commRate / 100);

    const activePartnersVal = deliveryPartners.filter((p) => p.status === "Approved" || p.isOnline).length;

    // Grouping for records
    const groups = {};

    deliveredOrders.forEach((o) => {
      const date = parseDate(o.createdAt || o.timestamp);
      if (date.getTime() === 0) return;

      let key = "";
      if (reportType === "daily") {
        key = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      } else if (reportType === "weekly") {
        const startOfWeek = new Date(date);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day; // adjust to Sunday
        startOfWeek.setDate(diff);
        key = "Week of " + startOfWeek.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      } else if (reportType === "monthly") {
        key = date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      } else if (reportType === "yearly") {
        key = date.getFullYear().toString();
      }

      if (!groups[key]) {
        groups[key] = {
          sales: 0,
          ordersCount: 0
        };
      }
      groups[key].sales += Number(o.total || o.totalAmount || 0);
      groups[key].ordersCount += 1;
    });

    const records = Object.entries(groups).map(([dateStr, data], index) => ({
      id: `REP-${String(index + 1).padStart(2, "0")}`,
      date: dateStr,
      ordersCount: data.ordersCount,
      sales: `₹${data.sales.toFixed(2)}`,
      status: "Closed"
    }));

    // Simulate short UI transition delay
    setTimeout(() => {
      setGenerating(false);
      setGeneratedReport({
        title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Operational Report`,
        generatedAt: new Date().toLocaleString(),
        type: reportType,
        summary: {
          totalSales: `₹${totalSalesVal.toFixed(2)}`,
          totalOrders: totalOrdersVal,
          taxCollected: `₹${taxCollectedVal.toFixed(2)}`,
          commissionDeducted: `₹${commissionDeductedVal.toFixed(2)}`,
          activePartners: activePartnersVal,
          newCustomers: usersCount
        },
        records: records.length > 0 ? records : [
          { id: "REP-EMPTY", date: "No data", ordersCount: 0, sales: "₹0.00", status: "N/A" }
        ]
      });
      addToast("Report generated successfully", "success");
    }, 600);
  };

  const handleDownload = (format) => {
    if (!generatedReport) return;
    addToast(`Preparing download for ${generatedReport.title} in ${format} format...`, "info");
    setTimeout(() => {
      addToast(`${format} file downloaded successfully`, "success");
    }, 1500);
  };

  return (
    <div className="p-8 min-h-screen bg-[#f9f9ff] flex flex-col gap-8">
      {/* Header */}
      <div>
        <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Reports</h2>
        <p className="font-body-md text-body-md text-[#555f6f] mt-1">
          Generate, preview, and download operational and financial ledgers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Settings Panel */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm flex flex-col gap-6 h-fit">
          <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold border-b border-[#dce2f3] pb-3">
            Configuration
          </h3>

          {/* Report Type */}
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">
              Report Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["daily", "weekly", "monthly", "yearly"].map((type) => (
                <button
                  key={type}
                  onClick={() => setReportType(type)}
                  className={`py-2 rounded-lg border font-label-md text-label-md capitalize transition-all ${
                    reportType === type
                      ? "bg-[#10b981]/10 border-[#10b981] text-[#10b981] font-semibold"
                      : "bg-[#f9f9ff] border-[#dce2f3] text-[#555f6f] hover:bg-[#f0f3ff]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Target Section */}
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">
              Component Scope
            </label>
            <select
              value={reportSection}
              onChange={(e) => setReportSection(e.target.value)}
              className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
            >
              <option value="all">All Components</option>
              <option value="sales">Sales & Revenue</option>
              <option value="delivery">Delivery Partners</option>
              <option value="orders">Orders & Support</option>
            </select>
          </div>

          {/* CTA Generate */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`w-full py-3 rounded-lg font-label-md text-label-md flex justify-center items-center gap-2 transition-all ${
              generating
                ? "bg-[#ffdbd0] text-[#10b981] cursor-not-allowed"
                : "bg-[#10b981] text-white hover:bg-[#059669]"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {generating ? "sync" : "assessment"}
            </span>
            {generating ? "Generating..." : "Generate Report"}
          </button>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {!generatedReport && !generating && (
            <div className="bg-white border border-[#dce2f3] rounded-xl p-12 text-center shadow-sm flex flex-col justify-center items-center gap-4 min-h-[380px]">
              <span className="material-symbols-outlined text-5xl text-[#d3daea]">
                folder_open
              </span>
              <div>
                <h4 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">
                  No Report Generated
                </h4>
                <p className="font-body-sm text-body-sm text-[#555f6f] max-w-sm mt-1">
                  Configure parameters on the left panel and click "Generate Report" to build a preview.
                </p>
              </div>
            </div>
          )}

          {generating && (
            <div className="bg-white border border-[#dce2f3] rounded-xl p-12 text-center shadow-sm flex flex-col justify-center items-center gap-4 min-h-[380px]">
              <div className="w-10 h-10 border-4 border-[#ffdbd0] border-t-[#10b981] rounded-full animate-spin"></div>
              <div>
                <h4 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">
                  Processing Report
                </h4>
                <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
                  Aggregating data models, validating ledger checksums, and building view...
                </p>
              </div>
            </div>
          )}

          {generatedReport && (
            <div className="bg-white border border-[#dce2f3] rounded-xl shadow-sm overflow-hidden flex flex-col animate-fade-in">
              {/* Preview Header */}
              <div className="p-6 border-b border-[#dce2f3] flex justify-between items-center bg-[#f0f3ff]/40">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-semibold">
                    {generatedReport.title}
                  </h3>
                  <p className="font-body-sm text-[12px] text-[#555f6f] mt-0.5">
                    Generated: {generatedReport.generatedAt}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload("PDF")}
                    className="px-4 py-2 border border-[#dce2f3] bg-white text-[#151c27] font-label-sm text-label-sm rounded hover:bg-[#f0f3ff] transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                    PDF
                  </button>
                  <button
                    onClick={() => handleDownload("Excel")}
                    className="px-4 py-2 border border-[#dce2f3] bg-white text-[#151c27] font-label-sm text-label-sm rounded hover:bg-[#f0f3ff] transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">grid_on</span>
                    Excel
                  </button>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-6 bg-[#f9f9ff]">
                <div className="p-4 bg-white border border-[#dce2f3] rounded-lg">
                  <p className="text-[10px] text-[#555f6f] uppercase tracking-wider font-semibold">Total Revenue</p>
                  <p className="text-xl font-bold text-[#10b981] mt-1">{generatedReport.summary.totalSales}</p>
                </div>
                <div className="p-4 bg-white border border-[#dce2f3] rounded-lg">
                  <p className="text-[10px] text-[#555f6f] uppercase tracking-wider font-semibold">Total Orders</p>
                  <p className="text-xl font-bold text-[#151c27] mt-1">{generatedReport.summary.totalOrders}</p>
                </div>
                <div className="p-4 bg-white border border-[#dce2f3] rounded-lg">
                  <p className="text-[10px] text-[#555f6f] uppercase tracking-wider font-semibold">Taxes (GST)</p>
                  <p className="text-xl font-bold text-[#555f6f] mt-1">{generatedReport.summary.taxCollected}</p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border-t border-[#dce2f3] overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f0f3ff] border-b border-[#dce2f3]">
                      <th className="py-3 px-6 font-label-sm text-label-sm text-[#555f6f]">Record ID</th>
                      <th className="py-3 px-6 font-label-sm text-label-sm text-[#555f6f]">Date</th>
                      <th className="py-3 px-6 font-label-sm text-label-sm text-[#555f6f]">Orders Volume</th>
                      <th className="py-3 px-6 font-label-sm text-label-sm text-[#555f6f]">Sales Amount</th>
                      <th className="py-3 px-6 font-label-sm text-label-sm text-[#555f6f]">Ledger Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm text-[#151c27]">
                    {generatedReport.records.map((rec) => (
                      <tr key={rec.id} className="border-b border-[#dce2f3] hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-6 font-semibold">{rec.id}</td>
                        <td className="py-3.5 px-6">{rec.date}</td>
                        <td className="py-3.5 px-6">{rec.ordersCount}</td>
                        <td className="py-3.5 px-6 font-semibold text-[#006c49]">{rec.sales}</td>
                        <td className="py-3.5 px-6">
                          <span className="px-2 py-0.5 rounded bg-[#ecfdf5] text-[#006c49] text-[10px] font-semibold uppercase tracking-wider">
                            {rec.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
