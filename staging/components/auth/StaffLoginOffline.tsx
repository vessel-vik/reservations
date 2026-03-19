"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  User, 
  Lock, 
  LogIn, 
  Eye, 
  EyeOff,
  ChefHat,
  AlertCircle,
  WifiOff,
  Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { staffLogin } from "@/lib/actions/staff.actions";
import { authenticateStaff, getCachedStaffList, getCurrentSession, restoreSession, type OfflineAuthState } from "@/lib/auth/offline-auth";
import { isOnline } from "@/lib/sync/network-monitor";

interface StaffLoginProps {
  onLoginSuccess: (staff: any, session: any) => void;
}

export const StaffLogin: React.FC<StaffLoginProps> = ({ onLoginSuccess }) => {
  const [credentials, setCredentials] = useState({
    email: "",
    password: ""
  });
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [cachedStaff, setCachedStaff] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);
  const [loginMode, setLoginMode] = useState<'password' | 'pin'>('password');

  // Check network status and load cached staff on mount
  useEffect(() => {
    setIsOffline(!isOnline());
    
    // Load cached staff for offline login
    loadCachedStaff();
    
    // Try to restore existing session
    checkExistingSession();
  }, []);

  const loadCachedStaff = async () => {
    try {
      const staff = await getCachedStaffList();
      setCachedStaff(staff.map(s => ({
        id: s.id,
        email: s.email,
        name: s.name,
        role: s.role
      })));
    } catch (e) {
      console.error("Failed to load cached staff:", e);
    }
  };

  const checkExistingSession = async () => {
    try {
      const result = await restoreSession();
      if (result.success) {
        const session = getCurrentSession();
        if (session.isAuthenticated && session.staffId) {
          // Already logged in, notify parent
          onLoginSuccess({ id: session.staffId, name: session.staffName }, session);
        }
      }
    } catch (e) {
      console.error("Failed to restore session:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginMode === 'pin') {
      await handlePinLogin();
      return;
    }

    if (!credentials.email || !credentials.password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Try online login first if connected
      if (isOnline()) {
        try {
          const result = await staffLogin(credentials.email, credentials.password);
          console.log("✅ Online login successful:", result.staff.firstName);
          
          // Store session in localStorage
          localStorage.setItem("staff_session", JSON.stringify(result.session));
          localStorage.setItem("staff_data", JSON.stringify(result.staff));
          
          onLoginSuccess(result.staff, result.session);
          return;
        } catch (onlineError) {
          console.log("⚠️ Online login failed, trying offline...");
        }
      }

      // Fall back to offline authentication
      const result = await authenticateStaff(credentials.email, credentials.password, false);
      
      if (result.success && result.staff) {
        console.log("✅ Offline login successful:", result.staff.name);
        onLoginSuccess(result.staff, getCurrentSession());
      } else {
        setError(result.error || "Login failed. Please try again.");
      }
      
    } catch (error: any) {
      console.error("❌ Login failed:", error);
      setError(error.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async () => {
    if (!credentials.email || !pin) {
      setError("Please enter email and PIN");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await authenticateStaff(credentials.email, pin, true);
      
      if (result.success && result.staff) {
        console.log("✅ PIN login successful:", result.staff.name);
        onLoginSuccess(result.staff, getCurrentSession());
      } else {
        setError(result.error || "Invalid PIN. Please try again.");
      }
    } catch (error: any) {
      console.error("❌ PIN login failed:", error);
      setError(error.message || "PIN login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (staffEmail: string, usePin: boolean = false) => {
    setCredentials(prev => ({ ...prev, email: staffEmail }));
    
    if (usePin) {
      setLoginMode('pin');
    }
  };

  const handleDemoLogin = () => {
    setCredentials({
      email: "demo@restaurant.com",
      password: "demo123"
    });
  };

  const handleOfflineDemoLogin = async () => {
    // For offline demo, use cached credentials
    const demoStaff = cachedStaff.find(s => s.email.includes('demo'));
    if (demoStaff) {
      await handleQuickLogin(demoStaff.email, true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">Staff Portal</h2>
          <p className="text-slate-400 mt-2">Sign in to access the restaurant system</p>
          
          {/* Offline Indicator */}
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-full"
            >
              <WifiOff className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-sm">Offline Mode</span>
            </motion.div>
          )}
        </div>

        {/* Cached Staff Quick Login (Offline) */}
        {isOffline && cachedStaff.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 font-medium text-sm">Quick Offline Login</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cachedStaff.slice(0, 4).map((staff) => (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => handleQuickLogin(staff.email, true)}
                  className="text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                >
                  <div className="text-white text-sm font-medium">{staff.name}</div>
                  <div className="text-slate-400 text-xs capitalize">{staff.role}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Demo Credentials */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400 font-medium text-sm">Demo Access</span>
          </div>
          <div className="text-sm text-slate-300 space-y-1">
            <p><strong>Email:</strong> demo@restaurant.com</p>
            <p><strong>Password:</strong> demo123</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDemoLogin}
              className="border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white"
            >
              Use Demo (Online)
            </Button>
            {isOffline && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOfflineDemoLogin}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500 hover:text-white"
              >
                Use Demo (Offline)
              </Button>
            )}
          </div>
        </div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Login Mode Toggle */}
            {isOffline && (
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setLoginMode('password')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    loginMode === 'password'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('pin')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    loginMode === 'pin'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  PIN Code
                </button>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                {loginMode === 'pin' ? 'Email or Staff ID' : 'Email Address'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type={loginMode === 'pin' ? "text" : "email"}
                  value={credentials.email}
                  onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none transition-colors"
                  placeholder={loginMode === 'pin' ? "Enter your email" : "Enter your email"}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            {loginMode === 'password' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full pl-10 pr-12 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none transition-colors"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* PIN Field */}
            {loginMode === 'pin' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">PIN Code</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none transition-colors text-center text-2xl tracking-widest"
                    placeholder="••••"
                    maxLength={4}
                    required
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
              </motion.div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 font-medium"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </div>
              )}
            </Button>
          </form>
        </motion.div>

        {/* Available Roles */}
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-3">Available Staff Roles:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline" className="border-amber-500/30 text-amber-400">Manager</Badge>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400">Waiter</Badge>
            <Badge variant="outline" className="border-green-500/30 text-green-400">Kitchen Staff</Badge>
            <Badge variant="outline" className="border-purple-500/30 text-purple-400">Bartender</Badge>
            <Badge variant="outline" className="border-slate-500/30 text-slate-400">Host</Badge>
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center text-xs text-slate-500">
          <p>Having trouble signing in? Contact your manager for assistance.</p>
          {isOffline && (
            <p className="mt-1 text-amber-400">Data will sync when connection is restored.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
};
