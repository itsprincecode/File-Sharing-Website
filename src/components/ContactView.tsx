import React, { useState } from "react";
import {
  Send,
  CheckCircle,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Loader,
  Twitter,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Github,
  MessageCircle,
  ExternalLink,
  Share2,
} from "lucide-react";
import { ContactFormData } from "../types";
import { motion, AnimatePresence } from "motion/react";

export default function ContactView() {
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    subject: "File Sharing Support",
    message: "",
  });

  const [status, setStatus] = useState<"idle" | "sending" | "success">("idle");
  const [prog, setProg] = useState(0);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      return;
    }

    setStatus("sending");
    setProg(15);

    // Simulate complete visual upload progress checking standard with particles
    const interval = setInterval(() => {
      setProg((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus("success");
          return 100;
        }
        const step = Math.floor(Math.random() * 20) + 10;
        return Math.min(100, prev + step);
      });
    }, 250);
  };

  const handleReset = () => {
    setFormData({
      name: "",
      email: "",
      subject: "File Sharing Support",
      message: "",
    });
    setStatus("idle");
    setProg(0);
  };

  const contactOptions = [
    {
      icon: <Mail className="h-5 w-5 text-cyan-400" />,
      label: "Support Email",
      value: "campusrise.community@gmail.com",
      desc: "Expect a response within 12-24 hours.",
      href: "mailto:campusrise.community@gmail.com",
    },
    {
      icon: <Phone className="h-5 w-5 text-blue-400" />,
      label: "Inquiries Desk",
      value: "+91 9167853886",
      desc: "Toll-free, Mon-Fri 9AM to 5PM PST",
      href: "tel:+919167853886",
    },
    {
      icon: <MapPin className="h-5 w-5 text-purple-400" />,
      label: "Office",
      value: "Sendro Storage",
      desc: "Mumbai, NSP (East)",
    },
  ];

  const socialChannels = [
    {
      name: "Instagram",
      handle: "@itsprince.dev",
      href: "https://instagram.com/itsprince.dev",
      icon: <Instagram className="h-5 w-5 text-pink-500" />,
      badgeColor: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      btnHover: "hover:border-pink-500/50 hover:bg-pink-500/10",
    },
    {
      name: "LinkedIn",
      handle: "itsprincedev",
      href: "https://linkedin.com/itsprincedev",
      icon: <Linkedin className="h-5 w-5 text-blue-400" />,
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      btnHover: "hover:border-blue-500/50 hover:bg-blue-500/10",
    },
    {
      name: "GitHub",
      handle: "github.com/Sendro-transfer",
      href: "https://github.com/itsprincecode",
      icon: <Github className="h-5 w-5 text-gray-200" />,
      badgeColor: "bg-gray-500/10 text-gray-300 border-gray-500/20",
      btnHover: "hover:border-gray-500/50 hover:bg-gray-700/20",
    },
    {
      name: "Telegram",
      handle: "t.me/Sendrosupport",
      href: "https://t.me/itsprincedev",
      icon: <Send className="h-5 w-5 text-cyan-400" />,
      badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      btnHover: "hover:border-cyan-500/50 hover:bg-cyan-500/10",
    },
    {
      name: "WhatsApp",
      handle: "Direct Support Chat",
      href: "https://whatsapp.com/itsprincedev",
      icon: <MessageCircle className="h-5 w-5 text-emerald-400" />,
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      btnHover: "hover:border-emerald-500/50 hover:bg-emerald-500/10",
    },
  ];

  return (
    <div
      id="contact-view"
      className="relative py-10 md:py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto"
    >
      {/* Decorative Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-tr from-cyan-500/10 to-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
          Get in Touch with Sendro Support
        </h2>
        <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto font-medium">
          Have questions about your secure transfer, limit expansions, or file
          safety? Reach out to us directly or through any of our official social
          media channels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Info Cards Side */}
        <div className="lg:col-span-5 space-y-6">
          {/* Direct Channels */}
          <div className="p-6 rounded-2xl border bg-[#18181c]/50 border-gray-800 backdrop-blur-md">
            <h3 className="font-extrabold text-lg text-white mb-6 flex items-center space-x-2">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              <span>Direct Channels</span>
            </h3>

            <div className="space-y-6">
              {contactOptions.map((opt, i) => (
                <div key={i} className="flex items-start space-x-4">
                  <div className="p-3 rounded-xl bg-gray-800/80 border border-gray-700/50 text-gray-200">
                    {opt.icon}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">
                      {opt.label}
                    </span>
                    {opt.href ? (
                      <a
                        href={opt.href}
                        className="block font-bold text-white hover:text-cyan-400 text-base mt-0.5 transition-colors"
                      >
                        {opt.value}
                      </a>
                    ) : (
                      <p className="font-bold text-white text-base mt-0.5">
                        {opt.value}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Social Media Channels Card */}
          <div className="p-6 rounded-2xl border bg-[#18181c]/50 border-gray-800 backdrop-blur-md">
            <h3 className="font-extrabold text-base text-white mb-4 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Share2 className="h-4 w-4 text-cyan-400" />
                <span>Social & Community</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                24/7 Active
              </span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Connect with our official team and community across all major
              platforms:
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {socialChannels.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2.5 rounded-xl bg-gray-900/80 border border-gray-800 flex items-center space-x-2.5 transition-all duration-200 group ${social.btnHover}`}
                >
                  <div className="shrink-0 p-1.5 rounded-lg bg-gray-800/80 group-hover:scale-110 transition-transform">
                    {social.icon}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-bold text-gray-200 truncate group-hover:text-white">
                      {social.name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate group-hover:text-gray-400">
                      {social.handle}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* <div className="p-6 rounded-2xl border text-center bg-[#18181c]/30 border-gray-800">
            <Sparkles className="h-6 w-6 text-cyan-400 mx-auto mb-2 animate-pulse" />
            <span className="text-xs font-bold text-gray-300">
              Zero Storage Logging Policy
            </span>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              Our file lockers handle transfers in memory and transient volumes.
              Any messages sent to our inbox are encrypted end-to-end.
            </p>
          </div> */}
        </div>

        {/* Contact Form Container Panel */}
        <div className="lg:col-span-7">
          <div className="p-6 sm:p-8 rounded-3xl border relative overflow-hidden bg-[#18181c]/80 border-gray-800/80 shadow-2xl backdrop-blur-md">
            <AnimatePresence mode="wait">
              {status === "idle" ? (
                <motion.form
                  key="contact-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit}
                  autoComplete="off"
                  className="space-y-5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Your Full Name *
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        name="name"
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-lpignore="true"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Prince Maurya"
                        className="w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 bg-gray-800/50 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Email Address *
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        name="email"
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-lpignore="true"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="campusrise.community@gmail.com"
                        className="w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 bg-gray-800/50 border-gray-700 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Topic of Interest
                    </label>
                    <select
                      id="contact-subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 bg-gray-800/50 border-gray-700 text-cyan-400"
                    >
                      <option value="File Sharing Support">
                        File Sharing Setup / Codes
                      </option>
                      <option value="Account Limits">
                        Pro Transfer Subscription
                      </option>
                      <option value="File Expired Early">
                        Expired File Recovery Inquiry
                      </option>
                      <option value="Technical Bug">
                        Report a Bug / Vulnerability
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Your Message *
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      required
                      rows={5}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-lpignore="true"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="My uploaded files don't resolve on my Android browser..."
                      className="w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400 resize-none bg-gray-800/50 border-gray-700 text-white"
                    />
                  </div>

                  <button
                    id="contact-submit-btn"
                    type="submit"
                    className="flex items-center justify-center space-x-2 w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-2xl shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
                  >
                    <Send className="h-4 w-4" />
                    <span>Send Message</span>
                  </button>
                </motion.form>
              ) : status === "sending" ? (
                <motion.div
                  key="sending-state"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 px-6"
                >
                  <Loader className="h-10 w-10 text-cyan-400 animate-spin mb-4" />
                  <h4 className="font-extrabold text-white text-lg mb-2">
                    Dispatching Secure Message
                  </h4>
                  <p className="text-xs text-gray-400 text-center mb-6 max-w-sm">
                    Connecting to support relay and saving data logs under
                    temporal session nodes...
                  </p>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-800/80 h-2 rounded-full overflow-hidden max-w-md">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-200"
                      style={{ width: `${prog}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-400 mt-2">
                    {prog}% Sent
                  </span>
                </motion.div>
              ) : status === "success" ? (
                <motion.div
                  key="success-state"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 px-6 text-center"
                >
                  <div className="h-16 w-16 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                  <h4 className="font-extrabold text-2xl text-white mb-2">
                    Message Dispatched!
                  </h4>
                  <p className="text-sm text-gray-400 max-w-sm mb-8 leading-relaxed">
                    Thank you,{" "}
                    <span className="font-bold text-cyan-400">
                      {formData.name}
                    </span>
                    ! Our support team has queued your ticket. A confirmation
                    email has been logged to{" "}
                    <span className="font-semibold text-gray-200">
                      {formData.email}
                    </span>
                    .
                  </p>

                  <button
                    id="contact-reset-btn"
                    onClick={handleReset}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer"
                  >
                    Send Another Message
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
