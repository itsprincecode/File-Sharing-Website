import React, { useState } from "react";
import {
  Share2,
  Copy,
  Check,
  X,
  ExternalLink,
  MessageCircle,
  Send,
  Mail,
  Smartphone,
  Sparkles,
  Clock,
  FolderArchive,
  FileText,
  Lock,
} from "lucide-react";
import { motion } from "motion/react";

export interface ShareableFileData {
  code: string;
  name: string;
  size: number;
  type?: string;
  isFolder?: boolean;
  expiresAt?: number;
}

interface ShareModalProps {
  file: ShareableFileData;
  onClose: () => void;
}

export default function ShareModal({ file, onClose }: ShareModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);

  // Derive direct share link
  const getShareUrl = () => {
    try {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      return `${origin}${pathname}?code=${file.code}`;
    } catch {
      return `https://zapyatransfer.app/?code=${file.code}`;
    }
  };

  const shareUrl = getShareUrl();

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const shareText = `📦 Download "${file.name}" (${formatBytes(file.size)}) on Sendro:\n🔑 6-Digit Code: ${file.code}\n🔗 Direct Link: ${shareUrl}`;

  const handleCopyAllDetails = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Native Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Download ${file.name} - Sendro`,
          text: `Download "${file.name}" using 6-digit code: ${file.code}`,
          url: shareUrl,
        });
      } catch (err: any) {
        // User canceled or unsupported
        if (err?.name !== "AbortError") {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  // WhatsApp share
  const handleWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
      `Download "${file.name}" (${formatBytes(file.size)}) on Sendro:\nCode: ${file.code}\n${shareUrl}`,
    )}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  // Telegram share
  const handleTelegram = () => {
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
      `Download "${file.name}" on Sendro with 6-digit code: ${file.code}`,
    )}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  };

  // Email share
  const handleEmail = () => {
    const subject = `Download "${file.name}" via Sendro`;
    const body = `Hi,\n\nI've shared "${file.name}" (${formatBytes(
      file.size,
    )}) with you using Sendro.\n\n6-Digit Retrieval Code: ${file.code}\nDirect Download Link: ${shareUrl}\n\nNote: Files are stored temporarily and can be downloaded on any device with this code.`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  // SMS share
  const handleSms = () => {
    const smsBody = `Download "${file.name}" on Sendro. Code: ${file.code} - ${shareUrl}`;
    const smsUrl = `sms:?body=${encodeURIComponent(smsBody)}`;
    window.location.href = smsUrl;
  };

  return (
    <div
      id="share-file-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden p-6 sm:p-7 bg-[#18181c] border-gray-800 text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-500/15">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 shrink-0">
              <Share2 className="h-5 w-5" />
            </div>
            <div className="truncate">
              <h3 className="text-lg font-black tracking-tight truncate text-white">
                Share File Directly
              </h3>
              <p className="text-xs text-gray-400">
                Share via 6-digit code, direct link, or instant messaging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-500/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* File Card Preview */}
        <div className="mt-5 p-3.5 rounded-2xl border flex items-center justify-between bg-gray-900/60 border-gray-800">
          <div className="flex items-center space-x-3 min-w-0 truncate pr-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                file.isFolder
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-cyan-500/10 text-cyan-400"
              }`}
            >
              {file.isFolder ? (
                <FolderArchive className="h-5 w-5" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>
            <div className="truncate text-left">
              <div className="flex items-center space-x-1.5">
                <h4 className="text-sm font-bold truncate text-white">
                  {file.name}
                </h4>
                {file.isFolder && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    FOLDER
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-gray-400 mt-0.5">
                <span>{formatBytes(file.size)}</span>
                <span>•</span>
                <span className="flex items-center text-amber-400">
                  <Clock className="h-3 w-3 mr-0.5" />
                  <span>7-Day Active</span>
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] text-gray-400 uppercase font-mono block">
              Code
            </span>
            <span className="text-sm font-black font-mono text-cyan-400">
              {file.code}
            </span>
          </div>
        </div>

        {/* 6-Digit Retrieval Code Box */}
        <div className="mt-5">
          <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
            6-Digit Retrieval Code
          </label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 flex items-center justify-center space-x-1.5 p-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
              {file.code.split("").map((digit, i) => (
                <span
                  key={i}
                  className="h-9 w-8 sm:w-9 rounded-xl bg-cyan-500/15 text-cyan-400 font-mono font-black text-base flex items-center justify-center shadow-inner"
                >
                  {digit}
                </span>
              ))}
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition select-none shrink-0 ${
                copiedCode
                  ? "bg-emerald-500 text-white"
                  : "bg-cyan-500 hover:bg-cyan-400 text-white shadow-md shadow-cyan-500/20"
              }`}
            >
              {copiedCode ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
            </button>
          </div>
        </div>

        {/* Direct Link Box */}
        <div className="mt-4">
          <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
            Direct Download URL
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={shareUrl}
              className="flex-1 px-3.5 py-2.5 text-xs rounded-2xl border font-mono truncate focus:outline-none bg-gray-900 border-gray-800 text-gray-300"
            />
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition select-none shrink-0 ${
                copiedLink
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
              }`}
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
            </button>
          </div>
        </div>

        {/* Instant Messaging & Social Shortcuts */}
        <div className="mt-5">
          <label className="text-[10px] font-extrabold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-2">
            Direct Share Channels
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* WhatsApp */}
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center space-x-1.5 p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs cursor-pointer transition"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span>WhatsApp</span>
            </button>

            {/* Telegram */}
            <button
              onClick={handleTelegram}
              className="flex items-center justify-center space-x-1.5 p-2.5 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/20 font-bold text-xs cursor-pointer transition"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span>Telegram</span>
            </button>

            {/* Email */}
            <button
              onClick={handleEmail}
              className="flex items-center justify-center space-x-1.5 p-2.5 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-bold text-xs cursor-pointer transition"
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span>Email</span>
            </button>

            {/* Native Share / SMS */}
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center space-x-1.5 p-2.5 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 font-bold text-xs cursor-pointer transition"
            >
              <Share2 className="h-4 w-4 shrink-0" />
              <span>More Apps</span>
            </button>
          </div>
        </div>

        {/* Copy All Details button */}
        <div className="mt-5 pt-4 border-t border-gray-500/15 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleCopyAllDetails}
            className="w-full sm:w-auto text-xs font-bold text-gray-600 hover:text-cyan-600 dark:text-gray-400 dark:hover:text-cyan-400 flex items-center justify-center space-x-1.5 cursor-pointer transition"
          >
            {copiedDetails ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">
                  Message Copied to Clipboard!
                </span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Full Share Message</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-gray-500/10 hover:bg-gray-500/20 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white cursor-pointer transition"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
