import React, { useState } from "react";
import { ReportExportService } from "../services";

export const ExportModal = ({ isOpen, onClose, title, headers = [], data = [], defaultFilename = "homebites_export" }) => {
  const [format, setFormat] = useState("csv"); // csv, excel, pdf
  const [filename, setFilename] = useState(defaultFilename);

  if (!isOpen) return null;

  const handleExport = () => {
    if (!data || data.length === 0) {
      alert("No data available to export.");
      return;
    }

    if (format === "csv") {
      ReportExportService.exportCSV(filename, headers, data);
    } else if (format === "excel") {
      ReportExportService.exportExcel(filename, headers, data);
    } else if (format === "pdf") {
      ReportExportService.exportPDF(title || "Export Report", headers, data);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Export Dataset</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{title || "Select file format and download"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Export Format</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "csv", label: "CSV File", icon: "📊", desc: "Raw tabular data" },
              { id: "excel", label: "Excel (.xls)", icon: "📈", desc: "Formatted spreadsheet" },
              { id: "pdf", label: "PDF Document", icon: "📄", desc: "Print-ready report" }
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id)}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                  format === item.id
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <span className="text-xl mb-1">{item.icon}</span>
                <span className="text-xs font-bold">{item.label}</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filename Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">File Identifier</label>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Summary Info */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Total Records Selected:</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{data.length} rows</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 transition-all"
          >
            Download {format.toUpperCase()}
          </button>
        </div>

      </div>
    </div>
  );
};
export default ExportModal;
