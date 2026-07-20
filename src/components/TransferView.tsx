import React, { useState, useRef, useEffect } from "react";
import {
  CloudUpload,
  CloudDownload,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  FileText,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  FileCode,
  File,
  AlertCircle,
  Clock,
  Sparkles,
  Download,
  Upload,
  Info,
  CalendarDays,
  Lock,
  ArrowRight,
} from "lucide-react";
import {
  SharedFile,
  saveFile,
  getFile,
  listAllFiles,
  deleteFile,
  cleanupExpiredFiles,
} from "../utils/db";
import { SUPABASE_SETUP_SQL } from "../utils/supabase";
import { TransferSubTab, UserSession, UploadProgress } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface TransferViewProps {
  darkMode: boolean;
  session: UserSession;
}

export default function TransferView({ darkMode, session }: TransferViewProps) {
  const [activeTab, setActiveTab] = useState<TransferSubTab>("transfer");
  const [dragActive, setDragActive] = useState(false);
  const [activeFiles, setActiveFiles] = useState<SharedFile[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Upload progress simulation
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    active: false,
    fileName: "",
    percent: 0,
    speed: "",
    loaded: "",
  });

  // Upload Result (the code screen)
  const [latestUploadedFile, setLatestUploadedFile] =
    useState<SharedFile | null>(null);

  // Redeem Input state
  const [codeDigits, setCodeDigits] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundFile, setFoundFile] = useState<SharedFile | null>(null);

  const [supabaseSetupNeeded, setSupabaseSetupNeeded] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load active files on mount and when tab changes to Collect
  useEffect(() => {
    loadFiles();
    // Periodically run cleanup for expired transfers
    cleanupExpiredFiles().then((cnt) => {
      if (cnt > 0) {
        loadFiles();
      }
    });
  }, [activeTab]);

  const loadFiles = async () => {
    try {
      const files = await listAllFiles();
      setActiveFiles(files);
    } catch (err: any) {
      if (err?.message === "SUPABASE_TABLE_MISSING") {
        setSupabaseSetupNeeded(true);
      }
      console.error(err);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileUpload(e.target.files[0]);
    }
  };

  // Perform upload logic with progress animation
  const handleFileUpload = async (file: File) => {
    // Check max upload limits based on user tier
    const limitBytes =
      session.tier === "Pro" ? 10 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024; // 10GB vs 2GB
    if (file.size > limitBytes) {
      alert(
        `File size exceeds limit. ${
          session.tier === "Pro"
            ? "Pro size limit is 10GB."
            : "Free tier is limited to 2GB. Please Log In for 10GB tier!"
        }`
      );
      return;
    }

    setUploadProgress({
      active: true,
      fileName: file.name,
      percent: 0,
      speed: "0 KB/s",
      loaded: `0 MB of ${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    });

    // Animate upload percentages
    const totalSizeMB = file.size / (1024 * 1024);
    let currentPercent = 0;
    const intervalTime = 100;
    const stepSpeed = Math.max(5, Math.ceil(totalSizeMB / 10)); // adjust increments based on size

    const timer = setInterval(async () => {
      currentPercent += Math.floor(Math.random() * stepSpeed) + 5;
      if (currentPercent >= 100) {
        clearInterval(timer);
        setUploadProgress((prev) => ({ ...prev, percent: 100 }));

        try {
          // Save file in our client-side storage engine
          const saved = await saveFile(file);
          setLatestUploadedFile(saved);
          setUploadProgress({
            active: false,
            fileName: "",
            percent: 0,
            speed: "",
            loaded: "",
          });
          // Auto load files so collect stays synchronized
          loadFiles();
        } catch (err: any) {
          console.error(err);
          if (err?.message === "SUPABASE_TABLE_MISSING") {
            setSupabaseSetupNeeded(true);
          } else {
            alert(`Upload failed: ${err?.message || err}`);
          }
          setUploadProgress({
            active: false,
            fileName: "",
            percent: 0,
            speed: "",
            loaded: "",
          });
        }
      } else {
        const loadedMB = (
          (file.size * (currentPercent / 100)) /
          (1024 * 1024)
        ).toFixed(1);
        const randSpeedMB = (Math.random() * 4 + 8).toFixed(1); // 8-12 MB/s
        setUploadProgress({
          active: true,
          fileName: file.name,
          percent: currentPercent,
          speed: `${randSpeedMB} MB/s`,
          loaded: `${loadedMB} MB of ${totalSizeMB.toFixed(1)} MB`,
        });
      }
    }, intervalTime);
  };

  // Copies code with success toast feedback
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  // Triggers browser download of a file
  const handleDownloadFile = (sharedFile: SharedFile) => {
    const url = URL.createObjectURL(sharedFile.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = sharedFile.name;
    document.body.appendChild(link);
    link.click();
    _cleanupTempUrl(link, url);
  };

  const _cleanupTempUrl = (link: HTMLAnchorElement, url: string) => {
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Hard delete a file
  const handleDeleteFile = async (code: string) => {
    if (
      confirm(
        "Are you sure you want to delete this file sharing link? This cannot be undone."
      )
    ) {
      await deleteFile(code);
      if (foundFile?.code === code) {
        setFoundFile(null);
        setCodeDigits(Array(6).fill(""));
      }
      loadFiles();
    }
  };

  // Digits input handling for Search
  const handleDigitChange = (index: number, val: string) => {
    const freshDigits = [...codeDigits];
    // Keep only the last character or standard digit
    const cleaned = val.replace(/[^0-9]/g, "").slice(-1);
    freshDigits[index] = cleaned;
    setCodeDigits(freshDigits);
    setSearchError(null);

    // Auto focus next box
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      const freshDigits = [...codeDigits];
      freshDigits[index - 1] = "";
      setCodeDigits(freshDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").trim().slice(0, 6);
    if (/^\d+$/.test(pasteData)) {
      const digitsArr = pasteData.split("");
      const freshDigits = Array(6).fill("");
      for (let i = 0; i < 6; i++) {
        if (digitsArr[i]) {
          freshDigits[i] = digitsArr[i];
        }
      }
      setCodeDigits(freshDigits);
      // Focus last filled digit or 5th box
      const focusIndex = Math.min(5, digitsArr.length);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  // Perform search on filled code digits
  const handleCodeRedeem = async () => {
    const fullCode = codeDigits.join("");
    if (fullCode.length < 6) {
      setSearchError("Please specify a complete 6-digit code.");
      return;
    }

    setIsSearchingCode(true);
    setSearchError(null);

    setTimeout(async () => {
      try {
        const file = await getFile(fullCode);
        setIsSearchingCode(false);
        if (file) {
          setFoundFile(file);
        } else {
          setSearchError("This download code is invalid, expired, or deleted.");
          setFoundFile(null);
        }
      } catch (err: any) {
        setIsSearchingCode(false);
        if (err?.message === "SUPABASE_TABLE_MISSING") {
          setSupabaseSetupNeeded(true);
          setSearchError(
            "Supabase database table is not found. See setup instructions."
          );
        } else {
          setSearchError("Operational retrieve error. Please try again.");
        }
      }
    }, 800);
  };

  // Formatter utilities
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getRemainingTimeStr = (expiresAt: number): string => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

    return `${days}d ${hours}h ${mins}m`;
  };

  const getFileIcon = (fileName: string, fileType: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
      return <FileArchive className="h-8 w-8 text-amber-400" />;
    }
    if (
      ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff"].includes(
        ext
      ) ||
      fileType.startsWith("image/")
    ) {
      return <FileImage className="h-8 w-8 text-emerald-400" />;
    }
    if (
      ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext) ||
      fileType.startsWith("audio/")
    ) {
      return <FileAudio className="h-8 w-8 text-purple-400" />;
    }
    if (
      ["mp4", "mkv", "mov", "avi", "webm", "flv"].includes(ext) ||
      fileType.startsWith("video/")
    ) {
      return <FileVideo className="h-8 w-8 text-rose-400" />;
    }
    if (
      ["pdf", "docx", "doc", "txt", "xlsx", "xls", "pptx", "csv"].includes(ext)
    ) {
      return <FileText className="h-8 w-8 text-blue-400" />;
    }
    if (
      [
        "ts",
        "tsx",
        "js",
        "jsx",
        "html",
        "css",
        "json",
        "py",
        "rs",
        "go",
        "cpp",
        "c",
      ].includes(ext)
    ) {
      return <FileCode className="h-8 w-8 text-cyan-400" />;
    }
    return <File className="h-8 w-8 text-gray-400" />;
  };

  return (
    <div
      id="transfer-container"
      className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto"
    >
      {/* Supabase Table Setup Guide Modal */}
      <AnimatePresence>
        {supabaseSetupNeeded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className={`max-w-2xl w-full rounded-3xl shadow-2xl overflow-hidden border p-6 transition-all duration-300 ${
                darkMode
                  ? "bg-[#18181c] border-gray-800 text-white"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl shrink-0">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">
                    Supabase Setup Required
                  </h3>
                  <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                    To connect your Sendro Transfer clone with Supabase, you
                    must create the{" "}
                    <code className="px-1.5 py-0.5 font-bold font-mono text-xs text-rose-500 bg-rose-500/10 rounded-md">
                      shared_files
                    </code>{" "}
                    table with public policies.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  SQL Schema (Copy and run in your Supabase SQL Editor):
                </p>
                <div className="relative">
                  <pre className="p-4 rounded-2xl bg-gray-950 font-mono text-xs text-green-400 overflow-x-auto max-h-60 border border-gray-800">
                    {SUPABASE_SETUP_SQL}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 2000);
                    }}
                    className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-xs font-bold text-white cursor-pointer transition flex items-center space-x-1.5"
                  >
                    {copiedSql ? (
                      <Check className="h-3.5 w-3.5 text-green-400 animate-bounce" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-gray-300" />
                    )}
                    <span>{copiedSql ? "Copied!" : "Copy SQL"}</span>
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setSupabaseSetupNeeded(false)}
                  className="px-4 py-2 hover:bg-neutral-800/10 dark:hover:bg-neutral-800 text-sm font-semibold rounded-2xl transition border border-transparent cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setSupabaseSetupNeeded(false);
                    loadFiles();
                  }}
                  className="px-5 py-2.5 text-sm font-extrabold rounded-2xl bg-cyan-500 hover:bg-cyan-600 hover:scale-[1.02] active:scale-[0.98] text-white transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  I've Executed the SQL!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        id="file-uploader-element"
      />

      {/* Main card box mirroring Sendro image with responsive centering */}
      <div
        className={`rounded-3xl border overflow-hidden shadow-2xl transition-all duration-300 ${
          darkMode
            ? "bg-[#16161a] border-gray-800 shadow-cyan-500/5"
            : "bg-white border-gray-200/80 shadow-gray-200"
        }`}
      >
        {/* Banner header mirroring screenshot "Sendro Transfer Share and Convert Files" */}
        <div className="bg-gradient-to-r from-cyan-400 to-sky-500 p-6 flex items-center justify-between text-white relative overflow-hidden">
          {/* Subtle logo design */}
          <div className="flex items-center space-x-3 real-logo">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-sm shadow-inner shrink-0 relative flex items-center justify-center">
              <CloudUpload className="h-6 w-6 stroke-[2.5]" />
              <div className="absolute text-[8px] font-extrabold text-blue-100 mt-2 hover:scale-125 transition-transform">
                ⇄
              </div>
            </div>
            <div>
              <h2 className="font-extrabold text-xl sm:text-2xl tracking-normal">
                Sendro Transfer
              </h2>
              <p className="text-xs sm:text-sm text-cyan-50 font-medium">
                Share and Convert Files securely in real-time
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-2 bg-black/10 px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-semibold backdrop-blur-xs">
            <Lock className="h-3.5 w-3.5 text-cyan-100" />
            <span>Secure Web Storage</span>
          </div>
        </div>

        {/* Tab switcher inside White-colored frame mirroring original Sendro widget */}
        <div
          className={`border-b transition-all duration-300 ${
            darkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-gray-50/50 border-gray-100"
          }`}
        >
          <div className="flex justify-center space-x-8 sm:space-x-12 py-4">
            {(["transfer", "collect", "download"] as TransferSubTab[]).map(
              (tab) => (
                <button
                  id={`tab-${tab}`}
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSearchError(null);
                    if (tab !== "download") {
                      setFoundFile(null);
                    }
                  }}
                  className={`relative py-1 px-3 text-sm font-extrabold tracking-wide uppercase transition-colors duration-150 cursor-pointer ${
                    activeTab === tab
                      ? "text-cyan-500 font-black"
                      : darkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab === "transfer" && "Transfer"}
                  {tab === "collect" && `Collect (${activeFiles.length})`}
                  {tab === "download" && "Download"}

                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTabUnderwave"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500 rounded-full"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* Main interactive area inside */}
        <div
          className={`p-6 sm:p-10 transition-colors duration-300 min-h-[350px] flex flex-col justify-center ${
            darkMode ? "bg-[#18181c]" : "bg-white"
          }`}
        >
          <AnimatePresence mode="wait">
            {/* TRANSFER VIEW: THE CORE MIRROR LOGIC */}
            {activeTab === "transfer" &&
              !uploadProgress.active &&
              !latestUploadedFile && (
                <motion.div
                  key="transfer-main"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`relative rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center flex flex-col items-center justify-center transition-all ${
                    dragActive
                      ? "border-cyan-400 bg-cyan-500/5 scale-[0.99] shadow-inner"
                      : darkMode
                      ? "border-gray-800 hover:border-gray-700 bg-gray-900/10"
                      : "border-gray-200 hover:border-cyan-200 bg-gray-50/30"
                  }`}
                >
                  {/* Simulated circle buttons mirroring Sendro visual layout exactly */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-14 my-6 py-2 items-center justify-center">
                    {/* Left circle: UPLOAD NODE */}
                    <div
                      id="upload-circle-trigger"
                      onClick={triggerFileSelect}
                      className="flex flex-col items-center cursor-pointer group"
                    >
                      <div className="relative h-32 w-32 sm:h-36 sm:w-36 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-400/20 group-hover:shadow-cyan-400/40 group-hover:scale-[1.04] transition-all duration-300">
                        <CloudUpload className="h-14 w-14 sm:h-16 sm:w-16 stroke-[1.8]" />

                        {/* Interactive pulsing radar waves */}
                        <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping pointer-events-none scale-105 duration-2000" />
                      </div>
                      <span
                        className={`mt-4 text-xs font-bold uppercase tracking-widest ${
                          darkMode
                            ? "text-gray-400 group-hover:text-cyan-400"
                            : "text-gray-500 group-hover:text-blue-600"
                        }`}
                      >
                        Drag & Drop or Click
                      </span>
                    </div>

                    {/* Right circle: RECEIVE NODE */}
                    <div
                      id="receive-circle-trigger"
                      onClick={() => {
                        setActiveTab("download");
                        // Focus first index digitsbox next cycle
                        setTimeout(() => inputRefs.current[0]?.focus(), 100);
                      }}
                      className="flex flex-col items-center cursor-pointer group"
                    >
                      <div
                        className={`h-32 w-32 sm:h-36 sm:w-36 rounded-full border-4 flex items-center justify-center shadow-md dark:shadow-black/20 group-hover:scale-[1.04] transition-all duration-300 ${
                          darkMode
                            ? "border-cyan-500/60 hover:border-cyan-400 text-cyan-400 bg-gray-900"
                            : "border-cyan-400 hover:border-cyan-500 text-cyan-500 bg-white"
                        }`}
                      >
                        <CloudDownload className="h-14 w-14 sm:h-16 sm:w-16 stroke-[1.8]" />
                      </div>
                      <span
                        className={`mt-4 text-xs font-bold uppercase tracking-widest ${
                          darkMode
                            ? "text-gray-400 group-hover:text-cyan-400"
                            : "text-gray-500 group-hover:text-cyan-500"
                        }`}
                      >
                        Redeem 6-Digit Code
                      </span>
                    </div>
                  </div>

                  {/* Sub-label explaining standard limits */}
                  <p className="text-xs text-gray-400 leading-normal max-w-sm mb-6">
                    {session.isLoggedIn
                      ? `Pro Account Active: Upload files up to 10GB.`
                      : `Guest Account Mode: Upload up to 2GB. Log In to unlock 10GB.`}
                  </p>

                  {/* Bottom Pill Buttons mirroring Sendro screenshot perfectly */}
                  <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-5 w-full max-w-md">
                    <button
                      id="quick-upload-pill"
                      onClick={triggerFileSelect}
                      className="flex-1 py-3 text-sm font-black text-center text-white bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 rounded-full shadow-lg shadow-cyan-400/10 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      Upload File
                    </button>
                    <button
                      id="quick-receive-pill"
                      onClick={() => {
                        setActiveTab("download");
                        setTimeout(() => inputRefs.current[0]?.focus(), 150);
                      }}
                      className={`flex-1 py-3 text-sm font-extrabold text-center rounded-full border-2 cursor-pointer active:scale-[0.98] transition-transform ${
                        darkMode
                          ? "border-cyan-500 text-cyan-400 hover:bg-cyan-500/5 bg-transparent"
                          : "border-cyan-400 text-cyan-500 hover:bg-cyan-50/40 bg-transparent"
                      }`}
                    >
                      Receive File
                    </button>
                  </div>
                </motion.div>
              )}

            {/* PROGRESSING UPLOAD SIMULATOR PANEL */}
            {uploadProgress.active && (
              <motion.div
                key="upload-progress-panel"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col justify-center py-6 px-2 sm:px-10"
              >
                <div className="flex items-center space-x-4 mb-4 p-4 rounded-xl border border-gray-200/20 bg-gray-500/5">
                  <div className="h-10 w-10 bg-cyan-500/10 text-cyan-400 rounded-full flex items-center justify-center shrink-0">
                    <CloudUpload className="h-5 w-5 animate-bounce" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {uploadProgress.fileName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Uploading to secure browser memory sandbox...
                    </p>
                  </div>
                </div>

                {/* Main Progress Slide */}
                <div className="w-full bg-gray-200 dark:bg-gray-800 h-3.5 rounded-full overflow-hidden mb-3">
                  <div
                    className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-100 ease-out"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-mono font-bold">
                  <span>{uploadProgress.speed}</span>
                  <span className="text-sm text-cyan-500 font-extrabold">
                    {uploadProgress.percent}%
                  </span>
                  <span>{uploadProgress.loaded}</span>
                </div>
              </motion.div>
            )}

            {/* UPLOAD SUCCESS SCREEN: SHOW CODES WITH CLIPPING */}
            {latestUploadedFile && !uploadProgress.active && (
              <motion.div
                key="upload-success-panel"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="pt-2 text-center"
              >
                <div className="inline-flex items-center justify-center p-3.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mb-5 relative">
                  <Check className="h-7 w-7 stroke-[2.5]" />
                  <div className="absolute top-0 right-0 h-2.5 w-2.5 bg-emerald-400 rounded-full animate-ping" />
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-1.5">
                  Locker Configured Successfully
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-8 font-medium">
                  Similar to Sendro Transfer, your file is loaded. Give the
                  retrieval code below to your target receiver.
                </p>

                {/* THE 6-DIGIT CODE PANEL CARD */}
                <div
                  className={`p-6 rounded-2xl border max-w-md mx-auto mb-8 flex flex-col items-center justify-center relative group ${
                    darkMode
                      ? "bg-gray-900/60 border-gray-800 shadow-md shadow-black/20"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2.5">
                    Your Retrieval Code
                  </label>

                  <div className="flex items-center space-x-2.5 mb-4">
                    {latestUploadedFile.code.split("").map((digit, index) => (
                      <div
                        key={index}
                        className="h-11 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg font-black font-mono shadow-sm"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>

                  {/* Copy Button */}
                  <button
                    id="copy-code-btn"
                    onClick={() => handleCopyCode(latestUploadedFile.code)}
                    className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold border cursor-pointer select-none transition-all duration-150 shadow-xs bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-400 hover:scale-[1.02]"
                  >
                    {copiedCode === latestUploadedFile.code ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Code Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Shareable Code</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Uploaded File Details Panel */}
                <div
                  className={`p-4 rounded-xl border max-w-md mx-auto mb-8 flex items-center justify-between text-left ${
                    darkMode
                      ? "bg-gray-900/20 border-gray-800"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="shrink-0">
                      {getFileIcon(
                        latestUploadedFile.name,
                        latestUploadedFile.type
                      )}
                    </div>
                    <div className="truncate pr-4">
                      <span className="text-xs font-semibold text-gray-400 leading-none">
                        UPLOADED FILE
                      </span>
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white truncate">
                        {latestUploadedFile.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatBytes(latestUploadedFile.size)}
                      </p>
                    </div>
                  </div>

                  <button
                    id="test-download-btn"
                    onClick={() => handleDownloadFile(latestUploadedFile)}
                    className="shrink-0 flex items-center space-x-1 p-2 bg-gray-500/5 hover:bg-cyan-500/15 border border-gray-500/10 text-cyan-400 text-xs rounded-lg font-bold transition duration-150 cursor-pointer"
                    title="Pre-test downloader"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                </div>

                {/* Expiry warnings */}
                <div className="flex items-center justify-center space-x-1.5 text-xs text-amber-500/90 font-medium mb-8">
                  <Clock className="h-4 w-4 animate-pulse shrink-0" />
                  <span>
                    Link will expire and secure storage wipes in exactly 7 days.
                  </span>
                </div>

                {/* Action footer */}
                <div className="flex justify-center space-x-3 border-t border-gray-200/30 pt-6">
                  <button
                    id="upload-another-btn"
                    onClick={() => setLatestUploadedFile(null)}
                    className="flex items-center space-x-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold bg-[#808080]/5 hover:bg-[#808080]/10 text-gray-800 dark:text-white border border-gray-500/10 cursor-pointer transition duration-150"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Upload Another File</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* COLLECT PANEL: DIRECTORIES HISTORY */}
            {activeTab === "collect" && (
              <motion.div
                key="collect-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                {activeFiles.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="h-16 w-16 rounded-full bg-cyan-500/5 border border-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <CloudUpload className="h-8 w-8 stroke-[1.5]" />
                    </div>
                    <h4 className="font-extrabold text-gray-900 dark:text-white text-base">
                      No Active Shared Transfers
                    </h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-6 leading-relaxed">
                      You haven't uploaded files onto this browser sandbox
                      recently. Once you upload, active files list here.
                    </p>
                    <button
                      id="collect-start-btn"
                      onClick={() => setActiveTab("transfer")}
                      className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition duration-150"
                    >
                      Start Transferring Files
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1 mb-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        ACTIVE TRANSFERS ({activeFiles.length})
                      </span>
                      <span className="text-[10px] text-cyan-405 font-bold tracking-normal flex items-center space-x-1">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>All files clear dynamically in 7 days</span>
                      </span>
                    </div>

                    <div className="max-h-[350px] overflow-y-auto pr-1 space-y-3 scrollbar-thin">
                      {activeFiles.map((file) => (
                        <div
                          key={file.code}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between whitespace-nowrap gap-3 ${
                            darkMode
                              ? "bg-gray-900/50 border-gray-800/80 hover:border-gray-700 hover:bg-gray-800/20"
                              : "bg-gray-50/50 border-gray-200/80 hover:border-gray-300 hover:bg-white"
                          } transition-all duration-150`}
                        >
                          {/* File Label Block */}
                          <div className="flex items-center space-x-3 min-w-0 pr-4">
                            <div className="shrink-0">
                              {getFileIcon(file.name, file.type)}
                            </div>
                            <div className="truncate text-left">
                              <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {file.name}
                              </h4>
                              <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-semibold mt-0.5">
                                <span>{formatBytes(file.size)}</span>
                                <span>•</span>
                                <span className="text-cyan-400 font-extrabold font-mono text-xs">
                                  {file.code}
                                </span>
                                <span>•</span>
                                <span className="flex items-center text-amber-500">
                                  <Clock className="h-3 w-3 shrink-0 mr-0.5" />
                                  <span>
                                    {getRemainingTimeStr(file.expiresAt)} left
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Control Block */}
                          <div className="flex items-center justify-end space-x-2 pl-1 sm:pl-0">
                            {/* Copy Code button */}
                            <button
                              onClick={() => handleCopyCode(file.code)}
                              className={`p-2 rounded-lg border text-xs font-bold flex items-center space-x-1 transition duration-150 cursor-pointer ${
                                copiedCode === file.code
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                  : darkMode
                                  ? "bg-gray-800 border-gray-700 hover:text-cyan-400 hover:border-cyan-500/30 text-gray-400"
                                  : "bg-white border-gray-200 hover:text-cyan-500 hover:border-cyan-400/30 text-gray-600"
                              }`}
                              title="Copy sharing code"
                            >
                              {copiedCode === file.code ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span className="hidden md:inline">
                                {copiedCode === file.code
                                  ? "Copied"
                                  : file.code}
                              </span>
                            </button>

                            {/* Direct Download */}
                            <button
                              onClick={() => handleDownloadFile(file)}
                              className="p-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg cursor-pointer transition duration-150"
                              title="Download File"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>

                            {/* Delete File */}
                            <button
                              // onClick={() => handleDeleteFile(file.code)}
                              className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg border border-rose-500/20 hover:border-rose-500 transition duration-150 cursor-pointer"
                              title="Delete File Upload"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* DOWNLOAD CODEX REDEEM PANEL */}
            {activeTab === "download" && (
              <motion.div
                key="download-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center justify-center pt-2"
              >
                {!foundFile ? (
                  <div className="w-full max-w-md text-center">
                    <div className="h-14 w-14 rounded-full bg-cyan-500/5 text-cyan-400 flex items-center justify-center mx-auto mb-4 border border-cyan-500/10">
                      <CloudDownload className="h-7 w-7" />
                    </div>

                    <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">
                      Enter Download Code
                    </h3>
                    <p className="text-xs text-gray-400 mb-6 font-medium">
                      Similar to Sendro Transfer, insert the 6-digit
                      numeric/letter code shared with you to claim the binary
                      locker.
                    </p>

                    {searchError && (
                      <div className="mb-5 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-semibold flex items-start space-x-2 text-left">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{searchError}</span>
                      </div>
                    )}

                    {/* Digits row */}
                    <div className="flex items-center justify-center space-x-2 mb-8">
                      {codeDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => {
                            inputRefs.current[index] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          pattern="[0-9]*"
                          value={digit}
                          onChange={(e) =>
                            handleDigitChange(index, e.target.value)
                          }
                          onKeyDown={(e) => handleDigitKeyDown(index, e)}
                          onPaste={index === 0 ? handlePaste : undefined}
                          className={`h-14 w-12 sm:h-16 sm:w-14 rounded-2xl border-2 text-center text-xl sm:text-2xl font-extrabold font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/55 focus:border-cyan-500 transition-all duration-150 ${
                            darkMode
                              ? "bg-gray-900 border-gray-800 text-cyan-400"
                              : "bg-gray-50 border-gray-200 text-blue-600"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Action Redeem button */}
                    <button
                      id="redeem-code-btn"
                      onClick={handleCodeRedeem}
                      disabled={
                        isSearchingCode || codeDigits.join("").length < 6
                      }
                      className="flex items-center justify-center space-x-2 py-4 w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 font-bold rounded-2xl text-white shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.99] transition duration-150"
                    >
                      {isSearchingCode ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                          <span>Searching Database...</span>
                        </>
                      ) : (
                        <>
                          <span>Redeem Code & Download</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  // DISPLAY REDEEMED ACTIVE FILE READY FOR DOWNLOAD
                  <div className="w-full max-w-md pt-2">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-4 animate-bounce">
                        <Download className="h-6 w-6 stroke-[2.3]" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2">
                        Files Package Decrypted!
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        Code verified successfully. Claim the binary bundle
                        payload below.
                      </p>
                    </div>

                    {/* Document Panel Box */}
                    <div
                      className={`p-5 rounded-2xl border mb-6 flex items-center justify-between text-left ${
                        darkMode
                          ? "bg-gray-900/60 border-gray-800 shadow-md"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 pr-4">
                        <div className="shrink-0">
                          {getFileIcon(foundFile.name, foundFile.type)}
                        </div>
                        <div className="truncate">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                            {foundFile.name}
                          </h4>
                          <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-bold mt-1">
                            <span>{formatBytes(foundFile.size)}</span>
                            <span>•</span>
                            <span className="text-cyan-400 font-mono text-xs">
                              {foundFile.code}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Warnings and expiry block */}
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start space-x-2 mb-8 ${
                        darkMode
                          ? "bg-amber-500/5 border-amber-500/25 text-amber-500/90"
                          : "bg-amber-50 border-amber-100/90 text-amber-700"
                      }`}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <span className="font-bold">
                          Temporal Storage Active:
                        </span>
                        <p className="mt-0.5 leading-relaxed">
                          This file will be completely wiped from browser disk
                          sandbox in exactly{" "}
                          <span className="font-extrabold">
                            {getRemainingTimeStr(foundFile.expiresAt)}
                          </span>
                          . Download immediately.
                        </p>
                      </div>
                    </div>

                    {/* Action CTA Block */}
                    <div className="space-y-3">
                      <button
                        id="final-download-btn"
                        onClick={() => handleDownloadFile(foundFile)}
                        className="flex items-center justify-center space-x-2 py-4 w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 font-bold rounded-2xl text-white shadow-lg cursor-pointer select-none active:scale-[0.99] transition duration-150"
                      >
                        <Download className="h-5 w-5" />
                        <span>Download Original File</span>
                      </button>

                      <button
                        id="back-redemption-btn"
                        onClick={() => {
                          setFoundFile(null);
                          setCodeDigits(Array(6).fill(""));
                        }}
                        className="flex items-center justify-center space-x-1 py-3 w-full text-xs font-bold text-gray-400 hover:text-cyan-400 cursor-pointer transition duration-150"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Redeem Another Code</span>
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
