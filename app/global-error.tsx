"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ 
  error,
  reset 
}: { 
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* Animated Background */}
          <div className="fixed inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 via-transparent to-red-500/5" />
          </div>

          {/* Error Content */}
          <div className="relative z-10 flex-1 flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-lg"
            >
              {/* Error Icon */}
              <motion.div 
                initial={{ rotate: 0 }}
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: 3 }}
                className="mb-8"
              >
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/30">
                  <AlertTriangle className="w-12 h-12 text-red-400" />
                </div>
              </motion.div>

              {/* Error Message */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-3xl font-bold text-white mb-4">
                  Oops! Something went wrong
                </h1>
                <p className="text-gray-400 mb-8">
                  We apologize for the inconvenience. Our team has been notified and we're working to fix this issue.
                </p>

                {/* Error Details */}
                <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4 mb-8">
                  <p className="text-sm text-gray-500 font-mono">
                    {error.message || "An unexpected error occurred"}
                  </p>
                  {error.digest && (
                    <p className="text-xs text-gray-600 mt-2">
                      Error ID: {error.digest}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={reset}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium hover:from-amber-600 hover:to-amber-700 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                  
                  <Link 
                    href="/"
                    className="px-6 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-all flex items-center justify-center gap-2 border border-white/20"
                  >
                    <Home className="w-4 h-4" />
                    Go Home
                  </Link>
                </div>
              </motion.div>

              {/* Support Info */}
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-500 text-sm mt-12"
              >
                Need help? Contact us at{" "}
                <a href="tel:+254757650125" className="text-amber-400 hover:text-amber-300">
                  +254 757 650 125
                </a>
              </motion.p>
            </motion.div>
          </div>
        </div>
      </body>
    </html>
  );
}