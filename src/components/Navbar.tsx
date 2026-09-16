import React, { useState } from "react";
import { Menu, X, Cloud, User, HardDrive } from "lucide-react";
import { PageId, UserSession } from "../types";
import { listAllFiles } from "../utils/db";

interface NavbarProps {
  activePage: PageId;
  setActivePage: React.Dispatch<React.SetStateAction<PageId>>;
  session: UserSession;
  onLogout: () => void;
  openLoginModal: (isSignUp?: boolean) => void;
}

export default function Navbar({
  activePage,
  setActivePage,
  session,
  onLogout,
  openLoginModal,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "home" as PageId, label: "Home" },
    { id: "transfer" as PageId, label: "Transfer" },
    {
      id: "workspace" as PageId,
      label: "Personal Workspace",
      isWorkspace: true,
    },
    { id: "contact" as PageId, label: "Contact Us" },
  ];

  const handleNavClick = (pageId: PageId) => {
    if (pageId === "workspace" && !session?.isLoggedIn) {
      openLoginModal(false); // Open in member login mode (email & password)
      setMobileMenuOpen(false);
      return;
    }
    if (pageId === "transfer") {
      listAllFiles().catch(() => {});
    }
    setActivePage(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <nav
      id="main-navbar"
      className="relative z-50 border-b transition-all duration-300 bg-[#16161a]/90 border-gray-800 text-gray-200 backdrop-blur-md sticky top-0"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div
            id="brand-logo"
            className="flex items-center space-x-2 cursor-pointer group"
            onClick={() => handleNavClick("home")}
          >
            <div className="relative flex items-center justify-center p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/10 group-hover:shadow-cyan-500/30 transition-all duration-300">
              <Cloud className="h-6 w-6 animate-pulse" />
              {/* Overlay double-arrow effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-black tracking-tighter text-cyan-200 mt-2 select-none">
                  ⇄
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Sendro
              </span>
              <span className="text-[10px] text-gray-400 leading-none font-medium">
                Fast File Share & Workspace
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-3">
            {navItems.map((item) => (
              <button
                id={`nav-${item.id}`}
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                onMouseEnter={() => {
                  if (item.id === "transfer") {
                    listAllFiles().catch(() => {});
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 relative flex items-center space-x-1.5 cursor-pointer ${
                  activePage === item.id
                    ? "text-cyan-400 bg-gray-800/80 font-bold"
                    : "hover:text-cyan-400 text-gray-400"
                }`}
              >
                {item.isWorkspace && (
                  <HardDrive
                    className={`h-4 w-4 ${activePage === item.id ? "text-cyan-400" : "text-gray-400"}`}
                  />
                )}
                <span>{item.label}</span>
                {item.isWorkspace && session?.isLoggedIn && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
                {activePage === item.id && (
                  <span className="absolute bottom-1 left-4 right-4 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* User Controls */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Profile / Login */}
            {session?.isLoggedIn ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActivePage("workspace")}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border cursor-pointer transition ${
                    activePage === "workspace"
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "bg-gray-800/60 border-gray-700 hover:bg-gray-800"
                  }`}
                  title="Open Personal Workspace"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-300 max-w-[120px] truncate">
                    {session?.workspaceName ||
                      session?.displayName ||
                      session?.email}
                  </span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.2 rounded-full font-bold">
                    PRO
                  </span>
                </button>
                <button
                  id="btn-logout"
                  onClick={onLogout}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors duration-150"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  id="btn-login-open"
                  onClick={() => openLoginModal(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-gray-800/40 cursor-pointer transition"
                >
                  Log In
                </button>
                <button
                  id="btn-create-workspace-nav"
                  onClick={() => openLoginModal(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-md shadow-cyan-500/15 cursor-pointer"
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Personal Workspace</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center space-x-2">
            <button
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800/40 focus:outline-none"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-panel"
          className="md:hidden border-t px-4 pt-2 pb-4 space-y-2 absolute w-full left-0 bg-[#18181c] border-gray-800 shadow-xl"
        >
          {navItems.map((item) => (
            <button
              id={`mobile-nav-${item.id}`}
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between ${
                activePage === item.id
                  ? "bg-gray-800 text-cyan-400 font-bold"
                  : "text-gray-300 hover:bg-gray-800/40"
              }`}
            >
              <span>{item.label}</span>
              {item.isWorkspace && session?.isLoggedIn && (
                <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-bold">
                  PRO
                </span>
              )}
            </button>
          ))}
          <div className="h-[1px] bg-gray-800 my-2" />
          {session?.isLoggedIn ? (
            <div className="pt-2 px-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 truncate">
                  {session?.workspaceName ||
                    session?.displayName ||
                    session?.email}
                </span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-bold">
                  {session?.tier} 10GB
                </span>
              </div>
              <button
                id="mobile-btn-logout"
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-center py-2 text-sm font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <button
                id="mobile-btn-login"
                onClick={() => {
                  openLoginModal(false);
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-center space-x-1 w-full py-2.5 text-sm font-semibold text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition"
              >
                <User className="h-4 w-4" />
                <span>Log In</span>
              </button>
              <button
                onClick={() => {
                  openLoginModal(true);
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-center space-x-1 w-full py-2.5 text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg"
              >
                <HardDrive className="h-4 w-4" />
                <span>Create Personal Workspace</span>
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
