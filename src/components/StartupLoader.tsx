import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Cloud, Zap, ShieldCheck, ArrowRight } from "lucide-react";

interface StartupLoaderProps {
  onComplete: () => void;
}

export default function StartupLoader({ onComplete }: StartupLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(
    "Initializing P2P Quantum Tunnel...",
  );

  useEffect(() => {
    const statusMilestones = [
      { at: 15, text: "Allocating Temporal Memory Space..." },
      { at: 35, text: "Connecting Supabase Cloud Database..." },
      { at: 60, text: "Mounting Personal Workspace & 10GB Pro Engine..." },
      { at: 82, text: "Activating High-Speed Folder ZIP Packaging..." },
      { at: 96, text: "Security Handshake Verified. Ready." },
    ];

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 400);
          return 100;
        }
        // Smooth non-linear progress increments
        const delta =
          prev < 50
            ? Math.floor(Math.random() * 5) + 3
            : Math.floor(Math.random() * 7) + 5;
        const next = Math.min(100, prev + delta);

        const currentMilestone = statusMilestones
          .filter((m) => m.at <= next)
          .pop();
        if (currentMilestone) {
          setStatusText(currentMilestone.text);
        }

        if (next >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 450);
        }
        return next;
      });
    }, 65);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0d0e12] text-white overflow-hidden select-none"
    >
      {/* Dynamic ambient background glow grids */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#06b6d4_1px,transparent_1px),linear-gradient(to_bottom,#06b6d4_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm sm:max-w-md px-6 text-center">
        {/* Futuristic Orbital Logo Loader */}
        <div className="relative mb-8 flex items-center justify-center">
          {/* Outer rotating pulse ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-dashed border-cyan-400/40 absolute"
          />

          {/* Glowing ring */}
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-cyan-500/50 absolute shadow-[0_0_25px_rgba(6,182,212,0.35)]"
          />

          {/* Central Logo Box */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-2xl shadow-cyan-500/40">
            <div className="w-full h-full rounded-2xl bg-[#0f1117] flex items-center justify-center">
              <Cloud className="h-8 w-8 sm:h-10 sm:w-10 text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-black text-white mt-3 select-none tracking-tighter">
                  ⇄
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Branding Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-1 mb-6"
        >
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider mb-2">
            <Zap className="h-3 w-3 text-cyan-400 animate-pulse" />
            <span>P2P Protocol 2.5 Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Sendro
          </h1>
          <p className="text-xs text-gray-400 font-medium">
            Fast File Sharing & Personal Workspace
          </p>
        </motion.div>

        {/* Dynamic Modern Progress Bar */}
        <div className="w-full bg-gray-800/80 p-1 rounded-full border border-gray-700/50 mb-3 shadow-inner">
          <div className="relative h-2 rounded-full overflow-hidden bg-gray-900">
            <motion.div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]"
              style={{ width: `${progress}%` }}
              transition={{ ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Numeric Counter & Real-Time Status Output */}
        <div className="w-full flex items-center justify-between text-xs font-mono mb-4 px-1">
          <span className="text-gray-400 truncate max-w-[220px] sm:max-w-[260px] text-left text-[11px]">
            {statusText}
          </span>
          <span className="text-cyan-400 font-extrabold text-sm ml-2">
            {progress}%
          </span>
        </div>

        {/* Fast skip / enter button */}
        <button
          onClick={onComplete}
          className="mt-4 inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 transition-all cursor-pointer"
        >
          <span>Skip Animation</span>
          <ArrowRight className="h-3 w-3" />
        </button>

        {/* Security watermark badge */}
        <div className="mt-8 flex items-center space-x-1.5 text-[11px] text-gray-500 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
          <span>Zero Logging • End-to-End Temporal Privacy</span>
        </div>
      </div>
    </motion.div>
  );
}
