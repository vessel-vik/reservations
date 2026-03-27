"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Send, CheckCircle, AlertCircle, Utensils, PartyPopper, Gift, Wine } from "lucide-react";
import emailjs from "@emailjs/browser";

export const NewsletterSection = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setStatus("idle");

    try {
      // Initialize EmailJS
      emailjs.init(process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "zsP1UMPiRDwHjuv1x");

      // Send newsletter subscription email
      const templateParams = {
        to_email: email,
        from_name: "AM | PM Lounge",
        user_email: email,
        message: `Welcome to AM | PM Lounge Newsletter! 

You've successfully subscribed to our exclusive dining updates. Look forward to:

🍴 Special menu announcements
🎉 Exclusive event invitations  
🎁 Member-only promotions
🍷 Wine tasting notifications
⭐ VIP reservation privileges

We're thrilled to have you as part of our culinary community!

Best regards,
AM | PM Lounge Team`,
        restaurant_name: "AM | PM Lounge",
        subscription_date: new Date().toLocaleDateString(),
      };

      const response = await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "service_9q14lw5",
        process.env.NEXT_PUBLIC_EMAILJS_NEWSLETTER_TEMPLATE_ID || "template_49mb8bg",
        templateParams
      );

      if (response.status === 200) {
        setStatus("success");
        setMessage("🎉 Welcome aboard! Check your inbox for a special welcome gift.");
        setEmail("");
        
        // Reset success message after 5 seconds
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 5000);
      }
    } catch (error) {
      console.error("Newsletter subscription failed:", error);
      setStatus("error");
      setMessage("Oops! Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full max-w-[580px] mx-auto"
    >
      <div className="relative backdrop-blur-2xl bg-slate-900/50 rounded-3xl border border-slate-700/40 p-6 lg:p-8 shadow-2xl shadow-black/20 ring-1 ring-white/5 overflow-hidden">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-2xl mb-4">
              <Mail className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2 tracking-tight">
              Stay in the Loop
            </h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
              Get exclusive offers, menu updates, and VIP invitations
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={isLoading}
                className={`
                  w-full px-5 py-3.5 pr-28
                  bg-slate-800/50
                  border ${status === "error" ? "border-red-500/40" : "border-slate-600/50"}
                  rounded-xl
                  text-white text-sm placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`
                  absolute right-1.5 top-1/2 -translate-y-1/2
                  px-4 py-2
                  bg-amber-500 hover:bg-amber-400
                  text-slate-900 font-medium text-sm
                  rounded-lg
                  flex items-center gap-2
                  focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-slate-900
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  cursor-pointer
                `}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    <span className="hidden sm:inline">Joining...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Join</span>
                  </>
                )}
              </button>
            </div>

            {/* Status Messages */}
            {status !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`
                  flex items-center gap-3 p-3 rounded-xl
                  ${status === "success"
                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }
                `}
              >
                {status === "success" ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <p className="text-sm">{message}</p>
              </motion.div>
            )}
          </form>

          {/* Features */}
          <div className="mt-6 grid grid-cols-4 gap-2">
            {[
              { icon: Utensils, label: "Menus" },
              { icon: PartyPopper, label: "Events" },
              { icon: Gift, label: "Offers" },
              { icon: Wine, label: "Wine Club" },
            ].map((feature, index) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, duration: 0.3 }}
                className="text-center group"
              >
                <div className="w-10 h-10 mx-auto mb-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center group-hover:bg-amber-500/10 group-hover:border-amber-500/30 transition-all duration-200">
                  <feature.icon className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors" />
                </div>
                <p className="text-xs text-slate-500">{feature.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Privacy Note */}
          <p className="text-xs text-slate-600 text-center mt-5">
            Unsubscribe anytime. We respect your privacy.
          </p>
        </div>
      </div>
    </motion.div>
  );
};