"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, use } from "react";
import { motion } from "framer-motion";
import { GuestForm } from "@/components/forms/GuestForm";
import { PasskeyModal } from "@/components/PasskeyModal";
import { NewsletterSection } from "@/components/NewsletterSection";
import { Settings, ExternalLink, Utensils, Wine, Music, Sparkles } from "lucide-react";

const Home = ({ searchParams }: SearchParamProps) => {
  const params = use(searchParams);
  const isAdmin = params?.admin === "true";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {isAdmin && <PasskeyModal />}

      {/* Refined Background Elements - Subtle & Elegant */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary ambient glow */}
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-500/8 to-amber-600/4 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-amber-600/6 to-amber-500/3 rounded-full blur-[100px]" />

        {/* Subtle grid overlay for depth */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(251,191,36,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(251,191,36,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Floating orbs - reduced and refined */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-amber-400/20 rounded-full"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 6 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.8,
            }}
          />
        ))}
      </div>

      <section className="remove-scrollbar container my-auto relative z-10 py-8 lg:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="sub-container max-w-[580px] backdrop-blur-2xl bg-slate-900/50 border border-slate-700/40 rounded-3xl p-8 lg:p-10 shadow-2xl shadow-black/20 ring-1 ring-white/5"
        >
          {/* Logo and Branding */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center justify-center mb-5">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400/40 to-amber-600/40 blur-2xl" />
                <h1 className="relative text-3xl lg:text-4xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                    AM | PM
                  </span>
                  <span className="text-white/90 ml-2">Lounge</span>
                </h1>
              </div>
            </div>
            <p className="text-slate-400 text-sm tracking-wide uppercase">
              Fine Dining Excellence
            </p>
          </motion.div>

          {/* Divider */}
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/50" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-900/80 px-4">
                <Utensils className="w-4 h-4 text-amber-500/60" />
              </span>
            </div>
          </div>

          {/* Reservation Form */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="mb-6">
              <h2 className="text-xl lg:text-2xl font-semibold text-white mb-2 tracking-tight">
                Reserve Your Table
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Join us for an unforgettable culinary journey
              </p>
            </div>

            <GuestForm />
          </motion.div>

          {/* Footer Links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-8 pt-6 border-t border-slate-700/30"
          >
            <div className="flex justify-between items-center">
              <p className="text-xs text-slate-500">
                © 2025 AM | PM Lounge
              </p>
              <div className="flex gap-5 text-xs">
                <Link
                  href="/?admin=true"
                  className="text-amber-500/80 hover:text-amber-400 transition-colors duration-200 flex items-center gap-1.5 group"
                >
                  <Settings className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform duration-300" />
                  <span>Admin</span>
                </Link>
                <Link
                  href="https://ampm.co.ke/"
                  className="text-slate-400 hover:text-amber-400 transition-colors duration-200 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Restaurant</span>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Newsletter Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8"
        >
          <NewsletterSection />
        </motion.div>
      </section>

      {/* Right Side Image */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="hidden lg:block relative w-full max-w-[50%]"
      >
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-slate-950/20 to-slate-950/80 z-10" />
        <div className="relative h-full w-full">
          <Image
            src="/assets/images/onboarding-img.png"
            fill
            alt="AM PM Lounge Interior"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

          {/* Overlay Content */}
          <div className="absolute bottom-0 left-0 right-0 p-10 lg:p-14 z-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {/* Section header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-px bg-gradient-to-r from-amber-500 to-transparent" />
                <span className="text-amber-400/80 text-xs tracking-[0.2em] uppercase font-medium">
                  The Experience
                </span>
              </div>

              <h3 className="text-2xl lg:text-3xl font-semibold text-white mb-6 tracking-tight">
                Why Dine With Us?
              </h3>

              <ul className="space-y-4">
                {[
                  { icon: Utensils, text: "Premium dining with signature dishes" },
                  { icon: Wine, text: "Curated wine & cocktail collection" },
                  { icon: Music, text: "Live entertainment every weekend" },
                  { icon: Sparkles, text: "Elegant ambiance & exceptional service" },
                ].map((item, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + index * 0.1, duration: 0.4 }}
                    className="flex items-center gap-4 group"
                  >
                    <span className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:border-amber-500/30 transition-all duration-300">
                      <item.icon className="w-4 h-4 text-amber-400" />
                    </span>
                    <span className="text-slate-200 text-sm leading-relaxed">
                      {item.text}
                    </span>
                  </motion.li>
                ))}
              </ul>

              {/* Operating Hours Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.4 }}
                className="mt-8 p-5 bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-xl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-white font-medium text-sm">Operating Hours</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Weekdays</p>
                    <p className="text-slate-200">8:00 AM - 12:00 AM</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Weekends</p>
                    <p className="text-slate-200">7:00 AM - 11:00 PM</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Home;