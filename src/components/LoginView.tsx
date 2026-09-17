import React, { useState } from "react";
import {
  User,
  Lock,
  Mail,
  ChevronRight,
  X,
  AlertCircle,
  HardDrive,
  Key,
} from "lucide-react";
import { UserSession } from "../types";
import { motion } from "motion/react";
import { loginMember, registerMember } from "../utils/workspaceStorage";

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
  onClose: () => void;
  initialIsSignUp?: boolean;
}

export default function LoginView({
  onLoginSuccess,
  onClose,
  initialIsSignUp = false,
}: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Invalid ID or password. Both email and password are required.");
      return;
    }

    if (isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Register new member & create their personal workspace
        const { session } = await registerMember(
          cleanEmail,
          password,
          name || undefined,
          workspaceName || undefined,
        );
        setLoading(false);
        onLoginSuccess(session);
        onClose();
      } else {
        // Authenticate existing member with true credential verification
        const { session } = await loginMember(cleanEmail, password);
        setLoading(false);
        onLoginSuccess(session);
        onClose();
      }
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || "Invalid ID or password.";
      setError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dark Overlay backdrop */}
      <div
        id="login-overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
      />

      {/* Main Dialog Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        id="login-card"
        className="relative z-10 w-full max-w-md p-6 sm:p-8 rounded-3xl border transition-all duration-300 bg-[#18181c] border-gray-800 text-gray-200 shadow-2xl shadow-cyan-500/5"
      >
        {/* Head controls */}
        <div className="absolute top-4 right-4 flex items-center space-x-1.5">
          <button
            id="login-close-btn"
            onClick={onClose}
            className="p-2 rounded-xl transition-all cursor-pointer hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Mode Selector */}
        <div className="flex p-1 bg-gray-900/80 rounded-2xl border border-gray-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
              !isSignUp
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            <span>Member Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
              isSignUp
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Create Workspace</span>
          </button>
        </div>

        {/* Brand Banner */}
        <div className="text-center mb-5">
          <h3 className="text-xl font-extrabold text-white">
            {isSignUp
              ? "Create Your Personal Workspace"
              : "Access Your Workspace"}
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto leading-relaxed">
            {isSignUp
              ? "All workspace data is stored securely in the database. Enter your credentials to register."
              : "All workspace data is stored in the database. Enter your member email and password to view your private files."}
          </p>
        </div>

        {error && (
          <div
            id="login-error-alert"
            className="mb-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs font-semibold flex items-start space-x-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <span>{error}</span>
              {error.includes("Invalid ID or password") && !isSignUp && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                    }}
                    className="text-cyan-400 underline hover:text-cyan-300 cursor-pointer text-[11px]"
                  >
                    Don't have an account yet? Create your workspace here
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-3.5"
          autoComplete="off"
        >
          {isSignUp && (
            <>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Display Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="login-name-input"
                    type="text"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Prince Maurya"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 bg-gray-800/60 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Workspace Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <input
                    id="login-workspace-name-input"
                    type="text"
                    autoComplete="off"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="e.g. Creative Cloud Vault"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 bg-gray-800/60 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Member Email / ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="login-email-input"
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 bg-gray-800/60 border-gray-700 text-white placeholder-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="login-password-input"
                type="password"
                required
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isSignUp ? "Minimum 6 characters" : "Enter password"
                }
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 bg-gray-800/60 border-gray-700 text-white placeholder-gray-500"
              />
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="flex items-center justify-center space-x-2 w-full py-3.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:opacity-90 font-bold rounded-xl text-white shadow-lg shadow-cyan-500/20 text-sm cursor-pointer select-none transition-all mt-2 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>
                  {isSignUp
                    ? "Provisioning Workspace..."
                    : "Verifying Credentials..."}
                </span>
              </span>
            ) : (
              <>
                <span>
                  {isSignUp ? "Create Member Workspace" : "Access Workspace"}
                </span>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 text-center">
          <p className="text-xs text-gray-400">
            {isSignUp
              ? "Already have a member account?"
              : "Need a private cloud locker?"}{" "}
            <button
              id="login-signup-toggle"
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="font-bold text-cyan-400 hover:underline cursor-pointer ml-1"
            >
              {isSignUp
                ? "Sign In Instead"
                : "Create Personal Workspace (Free 100MB)"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
