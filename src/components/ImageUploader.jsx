import React, { useEffect, useId, useState } from "react";
import { uploadFile } from "../firebase/storage";

export const ImageUploader = ({
  value = "",
  onChange,
  folder = "general",
  label = "Image",
  helpText = "Upload file to Storage or paste external image URL"
}) => {
  const [mode, setMode] = useState(value && !value.includes("firebasestorage") && !value.startsWith("data:") ? "url" : "upload");
  const [pastedUrl, setPastedUrl] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Whether the current `value` failed to load. Reset whenever the value
  // changes, so replacing a dead image shows the new one rather than staying
  // stuck on the error card.
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [value]);

  /*
   * The file input's id was `file-input-${folder}`. Two uploaders sharing a
   * folder on one page — a form with a thumbnail and a hero image, say —
   * produced duplicate DOM ids, and the browser resolves a label to the FIRST
   * matching element, so clicking the second uploader opened the picker for
   * the first and the chosen file landed on the wrong field. useId is unique
   * per component instance.
   */
  const inputId = useId();

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setPastedUrl(url);
    setError("");
    onChange(url);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, WEBP)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit");
      return;
    }

    setError("");
    setUploading(true);
    setUploadProgress(10);

    try {
      const storagePath = `uploads/${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const url = await uploadFile(file, storagePath, (pct) => {
        setUploadProgress(pct);
      });

      setUploading(false);
      setPastedUrl(url);
      onChange(url);
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Upload failed: ${err.message}`);
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    setPastedUrl("");
    setError("");
    onChange("");
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">{label}</label>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mode === "upload" ? "bg-white dark:bg-slate-700 text-[#10b981] shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mode === "url" ? "bg-white dark:bg-slate-700 text-[#10b981] shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              Paste URL
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Box */}
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 h-40 flex items-center justify-center">
          {/*
           * A broken image now says so.
           *
           * This `onError` used to swap in an Unsplash stock photograph of a
           * meal. The intent was presumably a tidy placeholder; the effect was
           * that any unreachable image URL — a failed upload, a deleted
           * Storage object, a bad pasted link, a Storage rule denying read —
           * rendered in this preview as an attractive, entirely plausible
           * photo of food.
           *
           * So the admin saw a working image, saved, and moved on. The
           * customer app, which has no such fallback, showed a broken box.
           * This is the most likely mechanism behind "changing the banner
           * image doesn't work": it did work in the sense that a URL was
           * saved, and the one screen able to reveal that the URL was dead was
           * the screen actively hiding it.
           *
           * The preview must be a truthful view of what customers will get.
           */}
          {imageBroken ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-rose-50 px-4 text-center dark:bg-rose-950/30">
              <span className="material-symbols-outlined text-[26px] text-rose-500">broken_image</span>
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                This image cannot be loaded
              </p>
              <p className="text-[10px] leading-snug text-rose-600 dark:text-rose-400">
                Customers will see it broken too. Replace it, or check the URL and
                Storage read permissions.
              </p>
            </div>
          ) : (
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={() => setImageBroken(true)}
            />
          )}
          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Remove
            </button>
            <label className="px-3 py-1.5 bg-[#10b981] hover:bg-[#0ea5e9] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors">
              Replace
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
          </div>
        </div>
      ) : mode === "upload" ? (
        /* Upload Drag & Drop Zone */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
            dragOver ? "border-[#10b981] bg-emerald-50/50" : "border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-slate-50/50 dark:bg-slate-800/50"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id={inputId}
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
          <label htmlFor={inputId} className="cursor-pointer space-y-2 block">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950 text-[#10b981] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Click to upload <span className="text-slate-400 font-normal">or drag & drop</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, WEBP up to 10MB</p>
            </div>
          </label>
        </div>
      ) : (
        /* Paste URL Input */
        <div className="space-y-2">
          <input
            type="url"
            value={pastedUrl}
            onChange={handleUrlChange}
            placeholder="https://images.unsplash.com/photo-..."
            className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#10b981] focus:border-transparent outline-hidden bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          />
        </div>
      )}

      {/* Progress Bar */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <span>Compressing &amp; Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#10b981] h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Error text */}
      {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}

      {/* Help text */}
      {!error && helpText && <p className="text-[10px] text-slate-400">{helpText}</p>}
    </div>
  );
};
