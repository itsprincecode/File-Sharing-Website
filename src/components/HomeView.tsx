import React from "react";
import {
  ArrowRight,
  HardDrive,
  Zap,
  Calendar,
  Share2,
  FileText,
  Lock,
  Sparkles,
  Orbit,
  FolderArchive,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { UserSession } from "../types";
import { motion } from "motion/react";

interface HomeViewProps {
  onStartTransfer: () => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: () => void;
  session: UserSession;
}

export default function HomeView({
  onStartTransfer,
  onCreateWorkspace,
  onOpenWorkspace,
  session,
}: HomeViewProps) {
  // Key benefits grid data
  const benefits = [
    {
      icon: <Zap className="h-6 w-6 text-yellow-400" />,
      title: "Zero Limits, Maximum Speed",
      description:
        "Transfer high-resolution videos, large packages, and archives peer-to-peer at the absolute limit of your local bandwidth.",
    },
    {
      icon: <Lock className="h-6 w-6 text-cyan-400" />,
      title: "Fully Encrypted, Privately Kept",
      description:
        "Files are fully secured in temporal cloud database storage. No tracking, no analysis, and zero permanent logging.",
    },
    {
      icon: <Calendar className="h-6 w-6 text-purple-400" />,
      title: "7-Day Automatic Expiry",
      description:
        "Any uploaded content is stored in a clean temporal state. Files are automatically deleted after 168 hours to maintain total privacy.",
    },
    {
      icon: <Share2 className="h-6 w-6 text-emerald-400" />,
      title: "Universal 6-Digit Codes",
      description:
        "Forget complex link strings or required app installs. Enter a simple 6-digit numeric code on any device to retrieve content instantly.",
    },
  ];

  return (
    <div
      id="home-view"
      className="relative overflow-hidden py-10 md:py-16 px-4 sm:px-6 lg:px-8"
    >
      {/* Decorative Blur Spheres */}
      <div className="absolute top-1/4 -left-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-12 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto text-center relative z-10">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 text-xs font-semibold mb-6 shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400 animate-spin" />
          <span>V2.5 Temporal Sharing & 10GB Personal Workspace</span>
        </motion.div>

        {/* Dynamic Display Heading */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6"
        >
          <span className="block text-gray-900 dark:text-white leading-tight">
            Share Files & Folders Instantly.
          </span>
          <span className="block bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent leading-normal">
            Or Organize In Your Personal Workspace.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed font-medium"
        >
          Drop any files, multi-folder packages, or documents. Generate a secure
          6-digit retrieval code, or activate your dedicated personal workspace
          locker with 10GB storage limit.
        </motion.p>

        {/* Action Buttons: Quick Transfer & Personal Workspace */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-16"
        >
          <button
            id="cta-start-transfer"
            onClick={onStartTransfer}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-7 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer text-sm sm:text-base"
          >
            <span>Start Quick Transfer</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          {session?.isLoggedIn ? (
            <button
              id="cta-open-workspace"
              onClick={onOpenWorkspace}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-7 py-3.5 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold rounded-2xl shadow-lg shadow-amber-500/5 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer text-sm sm:text-base"
            >
              <HardDrive className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span>Open Personal Workspace</span>
            </button>
          ) : (
            <button
              id="cta-create-workspace"
              onClick={onCreateWorkspace}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-7 py-3.5 bg-gray-500/10 hover:bg-cyan-500/15 border border-gray-500/20 hover:border-cyan-500/30 text-gray-700 hover:text-cyan-600 dark:text-gray-200 dark:hover:text-cyan-300 font-bold rounded-2xl transition-all duration-200 cursor-pointer text-sm sm:text-base"
            >
              <Plus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Create Personal Workspace (10GB Pro)</span>
            </button>
          )}
        </motion.div>

        {/* Feature Spotlight: Personal Workspace Banner */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="p-6 sm:p-8 rounded-3xl border mb-20 text-left transition-all bg-[#18181c]/80 border-gray-800 shadow-2xl"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8">
              <div className="flex items-center space-x-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2">
                <HardDrive className="h-4 w-4" />
                <span>Featured Member Utility</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                Personal Workspace & Cloud Lockers
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                Need to keep your files organized? Create your personal
                workspace with up to 10GB capacity. Organize content into custom
                folders, upload entire directories directly, track active
                6-digit download codes, and manage your locker from anywhere.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Personal Sandbox</span>
                </span>
                <span className="inline-flex items-center space-x-1 text-cyan-700 dark:text-cyan-400 font-semibold bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                  <FolderArchive className="h-3.5 w-3.5" />
                  <span>Folder Archives & Zip Preview</span>
                </span>
                <span className="inline-flex items-center space-x-1 text-amber-700 dark:text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>10 GB Pro Storage</span>
                </span>
              </div>
            </div>
            <div className="lg:col-span-4 flex justify-start lg:justify-end">
              <button
                onClick={
                  session?.isLoggedIn ? onOpenWorkspace : onCreateWorkspace
                }
                className="w-full sm:w-auto px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95 transition-all text-center"
              >
                {session?.isLoggedIn
                  ? "Access Your Workspace →"
                  : "Launch Free Workspace →"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* How It Works Diagram */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
          className="relative max-w-3xl mx-auto mb-20 rounded-3xl border border-gray-200/40 dark:border-gray-800/40 bg-white/5 dark:bg-gray-900/40 p-2 backdrop-blur-sm shadow-2xl"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-indigo-500/5 rounded-3xl" />
          <div className="border border-gray-100/50 dark:border-gray-800/60 rounded-[22px] overflow-hidden p-6 sm:p-10 bg-white dark:bg-[#18181c]/90">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center text-center">
              <div className="flex flex-col items-center p-4 rounded-2xl hover:bg-gray-100/50 dark:hover:bg-gray-800/20 transition-all duration-150">
                <div className="h-14 w-14 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 animate-bounce">
                  <FileText className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-1">
                  1. Choose File or Folder
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2 leading-relaxed">
                  Drop any files or complete folders directly into the transfer
                  zone or workspace.
                </p>
              </div>

              <div className="flex flex-col items-center">
                {/* Visual Connection Line */}
                <div className="relative w-full flex items-center justify-center my-2 md:my-0">
                  <div className="h-[2px] w-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 hidden md:block" />
                  <div className="absolute h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700 shadow-md">
                    <Orbit className="h-5 w-5 text-blue-400 animate-spin" />
                  </div>
                </div>
                <span className="text-[10px] text-cyan-400 font-extrabold tracking-widest mt-4 uppercase">
                  DATABASE SYNC
                </span>
              </div>

              <div className="flex flex-col items-center p-4 rounded-2xl hover:bg-gray-100/50 dark:hover:bg-gray-800/20 transition-all duration-150">
                <div className="h-14 w-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
                  <div className="font-extrabold text-sm tracking-wider font-mono">
                    CODE
                  </div>
                </div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-1">
                  2. 6-Digit Retrieval
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2 leading-relaxed">
                  Your recipient enters the 6-digit numeric code on any phone or
                  laptop for instant download!
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Benefits Section */}
        <div className="border-t border-gray-200/50 dark:border-gray-800/50 pt-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mb-10">
            Why Choose Sendro?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="p-6 rounded-2xl border bg-[#18181c]/60 border-gray-800/60 hover:border-gray-700/80 hover:bg-gray-800/20 transition-all duration-300"
              >
                <div className="mb-3">{benefit.icon}</div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  {benefit.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-normal">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
