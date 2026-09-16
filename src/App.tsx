/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import HomeView from "./components/HomeView";
import TransferView from "./components/TransferView";
import ContactView from "./components/ContactView";
import LoginView from "./components/LoginView";
import WorkspaceView from "./components/WorkspaceView";
import StartupLoader from "./components/StartupLoader";
import { PageId, UserSession, DEFAULT_USER_SESSION } from "./types";
import {
  loadSavedSession,
  clearSessionFromStorage,
  syncCachedMembersToDatabase,
} from "./utils/workspaceStorage";
import { listAllFiles } from "./utils/db";
import { AnimatePresence, motion } from "motion/react";
import {
  ShieldAlert,
  Cloud,
  Lock,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Github,
  MessageCircle,
  Send,
  Mail,
  Phone,
} from "lucide-react";

export default function App() {
  // Modern startup loading animation state
  const [isLoadingApp, setIsLoadingApp] = useState<boolean>(true);

  // User requested: "after loading animation first show the home page"
  const [activePage, setActivePage] = useState<PageId>("home");

  // Login/Signup Modal state
  const [showLogin, setShowLogin] = useState<boolean>(false);
  const [loginIsSignUp, setLoginIsSignUp] = useState<boolean>(false);

  // User session state initialized from local persistence (guaranteed non-null)
  const [session, setSession] = useState<UserSession>(() => {
    return loadSavedSession() || DEFAULT_USER_SESSION;
  });

  // Automatically synchronize any local workspace members, lockers, and files into Supabase on startup
  useEffect(() => {
    syncCachedMembersToDatabase().catch((err) => {
      console.warn("Startup database synchronization notice:", err);
    });
  }, []);

  // If user arrives via direct share link ?code=XXXXXX, route directly to transfer download
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code =
        urlParams.get("code") ||
        (window.location.hash.includes("code=")
          ? window.location.hash.split("code=")[1]?.slice(0, 6)
          : null);
      if (code && /^\d{6}$/.test(code)) {
        setIsLoadingApp(false);
        setActivePage("transfer");
      }
    } catch (e) {
      console.error("Route parameter check error:", e);
    }
  }, []);

  // Proactively prefetch active transfers in background so opening Transfer/Collect tab is instantaneous
  useEffect(() => {
    // Run after initial paint
    const timer = setTimeout(() => {
      listAllFiles().catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleStartupComplete = () => {
    setIsLoadingApp(false);
    // Explicitly guarantee home page is shown first after startup animation
    setActivePage("home");
  };

  const openLoginModal = (isSignUp: boolean = false) => {
    setLoginIsSignUp(isSignUp);
    setShowLogin(true);
  };

  const handleLoginSuccess = (newSession: UserSession) => {
    setSession(newSession);
    // When user logs in or creates their personal workspace, transition to their workspace!
    setActivePage("workspace");
  };

  const handleLogout = () => {
    clearSessionFromStorage();
    setSession(DEFAULT_USER_SESSION);
    if (activePage === "workspace") {
      setActivePage("home");
    }
  };

  return (
    <div
      id="app-root"
      className="min-h-screen relative flex flex-col font-sans bg-[#121214] text-gray-100"
    >
      {/* Modern Initial Startup Loading Animation */}
      <AnimatePresence>
        {isLoadingApp && <StartupLoader onComplete={handleStartupComplete} />}
      </AnimatePresence>

      {/* Dynamic Animated background ambient grid */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
        {/* Subtle radial lights */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/[0.04] blur-[120px]" />
      </div>

      {/* Navigation bar Header container */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        session={session}
        onLogout={handleLogout}
        openLoginModal={openLoginModal}
      />

      {/* Main Pages section */}
      <main id="main-content-region" className="flex-grow z-10 relative">
        <AnimatePresence mode="wait">
          {activePage === "home" ? (
            <motion.div
              key="home-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <HomeView
                onStartTransfer={() => setActivePage("transfer")}
                onCreateWorkspace={() => openLoginModal(true)}
                onOpenWorkspace={() => setActivePage("workspace")}
                session={session}
              />
            </motion.div>
          ) : activePage === "transfer" ? (
            <motion.div
              key="transfer-page"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.25 }}
            >
              <TransferView
                session={session}
                onNavigateToWorkspace={() => setActivePage("workspace")}
                openLoginModal={openLoginModal}
              />
            </motion.div>
          ) : activePage === "workspace" ? (
            <motion.div
              key="workspace-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <WorkspaceView
                session={session}
                onRequireLogin={(isSignUp) => openLoginModal(isSignUp ?? false)}
                openLoginModal={(isSignUp) => openLoginModal(isSignUp ?? false)}
                onOpenTransferTab={() => setActivePage("transfer")}
                onNavigateToTransfer={() => setActivePage("transfer")}
              />
            </motion.div>
          ) : activePage === "contact" ? (
            <motion.div
              key="contact-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <ContactView />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        id="app-footer"
        className="border-t py-12 px-4 bg-[#16161a] border-gray-800 text-gray-400 relative z-10"
      >
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 text-white mb-4">
              <Cloud className="h-5 w-5 text-cyan-500" />
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Sendro & Workspace
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed max-w-sm mb-5">
              An instant cloud sharing and personal workspace platform. Equipped
              with folder archive ingestion, 6-digit retrieval codes, 10GB
              personal cloud lockers, and peer-to-peer speeds.
            </p>

            {/* Social Media & Contact Links */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Connect & Follow Us
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-sky-400 hover:border-sky-400/40 hover:bg-sky-400/10 transition-all duration-200"
                  title="Twitter / X"
                  aria-label="Twitter / X"
                >
                  <Twitter className="h-4 w-4" />
                </a> */}
                {/* <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-blue-500 hover:border-blue-500/40 hover:bg-blue-500/10 transition-all duration-200"
                  title="Facebook"
                  aria-label="Facebook"
                >
                  <Facebook className="h-4 w-4" />
                </a> */}
                <a
                  href="https://instagram.com/itsprince.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-pink-500 hover:border-pink-500/40 hover:bg-pink-500/10 transition-all duration-200"
                  title="Instagram"
                  aria-label="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href="https://linkedin.com/itsprincedev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-blue-400 hover:border-blue-400/40 hover:bg-blue-400/10 transition-all duration-200"
                  title="LinkedIn"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
                {/* <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all duration-200"
                  title="YouTube"
                  aria-label="YouTube"
                >
                  <Youtube className="h-4 w-4" />
                </a> */}
                <a
                  href="https://github.com/itsprincecode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800 transition-all duration-200"
                  title="GitHub"
                  aria-label="GitHub"
                >
                  <Github className="h-4 w-4" />
                </a>
                <a
                  href="https://t.me/itsprincedev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-cyan-400 hover:border-cyan-400/40 hover:bg-cyan-400/10 transition-all duration-200"
                  title="Telegram Community"
                  aria-label="Telegram"
                >
                  <Send className="h-4 w-4" />
                </a>
                <a
                  href="https://whatsapp.com/itsprincedev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-emerald-400 hover:border-emerald-400/40 hover:bg-emerald-400/10 transition-all duration-200"
                  title="WhatsApp Direct Contact"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a
                  href="mailto:campusrise.community@gmail.com"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-amber-400 hover:border-amber-400/40 hover:bg-amber-400/10 transition-all duration-200"
                  title="Email Support"
                  aria-label="Email"
                >
                  <Mail className="h-4 w-4" />
                </a>
                <a
                  href="tel:+919167853886"
                  className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-purple-400 hover:border-purple-400/40 hover:bg-purple-400/10 transition-all duration-200"
                  title="Telephone Support"
                  aria-label="Phone"
                >
                  <Phone className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Temporal Protocols
            </h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center space-x-1.5">
                <span className="h-1 w-1 bg-cyan-400 rounded-full shrink-0" />
                <span>6-Digit Verification Redemptions</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <span className="h-1 w-1 bg-cyan-400 rounded-full shrink-0" />
                <span>7-Day Sandboxed Hold</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <span className="h-1 w-1 bg-cyan-400 rounded-full shrink-0" />
                <span>Local Binary Cache & Storage Sync</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Personal Workspace
            </h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center space-x-1.5 text-cyan-400 font-semibold">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Private 10GB Cloud Lockers</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Custom Folders & Directory Archives</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-gray-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-gray-400">
            © 2026 Sendro & Workspace. All rights reserved. Developed by Prince Dev
          </p>
          <div className="flex space-x-4 text-[10px] text-gray-400">
            <span className="hover:text-cyan-400 cursor-pointer">
              Privacy Policy
            </span>
            <span className="hover:text-cyan-400 cursor-pointer">
              Storage Terms
            </span>
          </div>
        </div>
      </footer>

      {/* Login / Workspace setup modal */}
      <AnimatePresence>
        {showLogin && (
          <LoginView
            onClose={() => setShowLogin(false)}
            onLoginSuccess={handleLoginSuccess}
            initialIsSignUp={loginIsSignUp}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
