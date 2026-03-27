"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from "next/image";
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Wifi, 
  WifiOff,
  Heart,
  Sparkles,
  ChefHat,
  Shield
} from 'lucide-react';
import RegisterForm from "@/components/forms/RegisterForm";
import ReservationConflictDialog from "@/components/ui/reservation-conflict-dialog";
import EnhancedLoadingSkeleton from "@/components/ui/enhanced-loading-skeleton";
import SuccessIndicator from "@/components/ui/success-indicator";
import FormTransitionWrapper from "@/components/ui/form-transition-wrapper";
import { fetchUserData, performFrequencyAnalysis } from "@/lib/actions/client-guest.actions";
import { handleUserConflictChoice } from "@/lib/actions/reservation-conflict.actions";
import { usePagePerformance, useAccessibility } from "@/hooks/usePagePerformance";

// Type definitions for client-side usage
interface UserReservationProfile {
  userId: string;
  email: string;
  phone: string;
  name: string;
  existingReservations: number;
  lastReservationDate?: Date;
  requestFrequency: 'first-time' | 'returning' | 'frequent' | 'rapid-duplicate';
  recommendedAction: 'create-new' | 'update-existing' | 'confirm-additional' | 'prevent-duplicate';
  conflictDetails?: {
    duplicateWithin?: string;
    existingAppointments?: any[];
    similarRequests?: number;
  };
}

// Enhanced loading states
type LoadingState = 'initial' | 'loading' | 'success' | 'error' | 'retrying' | 'offline';
type DataState = 'idle' | 'validating' | 'ready' | 'conflict' | 'error';

interface RegisterPageState {
  loading: LoadingState;
  dataState: DataState;
  user: any | null;
  patient: any | null;
  frequencyAnalysis: any | null;
  error: string | null;
  retryCount: number;
  isOnline: boolean;
  showConflictDialog: boolean;
  userProfile: UserReservationProfile | null;
}

// Custom hooks for enhanced functionality
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
};

const useRetryWithBackoff = (maxRetries = 3) => {
  const [retryCount, setRetryCount] = useState(0);
  const retriesRef = useRef(0);
  
  const retry = useCallback(async (fn: () => Promise<any>) => {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const result = await fn();
        retriesRef.current = 0;
        setRetryCount(0);
        return result;
      } catch (error) {
        if (i === maxRetries) throw error;
        
        retriesRef.current = i + 1;
        setRetryCount(i + 1);
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }, [maxRetries]);
  
  return { retry, retryCount };
};

const useProgressiveDataFetching = (userId: string) => {
  const [state, setState] = useState<RegisterPageState>({
    loading: 'initial',
    dataState: 'idle',
    user: null,
    patient: null,
    frequencyAnalysis: null,
    error: null,
    retryCount: 0,
    isOnline: true,
    showConflictDialog: false,
    userProfile: null
  });
  
  const isOnline = useNetworkStatus();
  const { retry, retryCount } = useRetryWithBackoff();
  const router = useRouter();
  const redirectedRef = useRef(false);  // Track if we've already redirected
  
  // Update online status
  useEffect(() => {
    setState(prev => ({ ...prev, isOnline }));
  }, [isOnline]);
  
  const fetchData = useCallback(async () => {
    // Don't fetch again if we've already redirected
    if (redirectedRef.current) {
      console.log('⏭️ RegisterPage: Already redirected, skipping fetch');
      return;
    }
    
    console.log('🚀 RegisterPage: Fetching user data...');
    setState(prev => ({ ...prev, loading: 'loading', error: null }));
    
    try {
      const result = await retry(async () => {
        return await fetchUserData(userId);
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch user data');
      }
      
      const { user: userData, patient: patientData } = result;
      
      console.log('✅ RegisterPage: User data fetched successfully');
      
      // If patient exists, redirect to new appointment
      if (patientData) {
        console.log('🔄 RegisterPage: Patient exists, redirecting...');
        redirectedRef.current = true;  // Mark that we're redirecting
        router.push(`/guests/${userId}/new-appointment`);
        return;
      }
      
      setState(prev => ({
        ...prev,
        loading: 'success',
        dataState: 'validating',
        user: userData,
        patient: patientData,
        retryCount
      }));
      
      // Perform frequency analysis if we have user data
      if (userData?.email) {
        await performFrequencyAnalysisAction(userData);
      } else {
        setState(prev => ({ ...prev, dataState: 'ready' }));
      }
      
    } catch (error) {
      console.error('❌ RegisterPage: Error fetching user data:', error);
      setState(prev => ({
        ...prev,
        loading: 'error',
        dataState: 'error',
        error: error instanceof Error ? error.message : 'Failed to load user data',
        retryCount
      }));
    }
  }, [userId, retry, retryCount, router]);
  
  const performFrequencyAnalysisAction = useCallback(async (userData: any) => {
    try {
      console.log('📊 RegisterPage: Performing frequency analysis...');
      setState(prev => ({ ...prev, dataState: 'validating' }));
      
      const result = await performFrequencyAnalysis(
        userData.email,
        userData.phone || '',
        userData.name || ''
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Frequency analysis failed');
      }
      
      const analysis = result.analysis;
      console.log('📈 RegisterPage: Frequency analysis complete:', analysis.userProfile.requestFrequency);
      
      setState(prev => ({
        ...prev,
        frequencyAnalysis: analysis,
        userProfile: analysis.userProfile
      }));
      
      // Handle conflict scenarios
      if (analysis.userProfile.recommendedAction === 'prevent-duplicate' ||
          analysis.userProfile.recommendedAction === 'confirm-additional') {
        setState(prev => ({
          ...prev,
          dataState: 'conflict',
          showConflictDialog: true
        }));
      } else {
        setState(prev => ({ ...prev, dataState: 'ready' }));
      }
      
    } catch (error) {
      console.warn('⚠️ RegisterPage: Frequency analysis failed, proceeding anyway:', error);
      setState(prev => ({ ...prev, dataState: 'ready' }));
    }
  }, []);
  
  const handleConflictResolution = useCallback(async (choice: string) => {
    if (!state.userProfile) return;
    
    try {
      const resolution = await handleUserConflictChoice(state.userProfile, choice as any);
      
      setState(prev => ({ ...prev, showConflictDialog: false }));
      
      if (resolution.resolution?.shouldProceed) {
        setState(prev => ({ ...prev, dataState: 'ready' }));
      } else {
        // Handle cancellation or redirection
        if (choice === 'cancel') {
          router.push('/'); // Or appropriate page
        }
      }
    } catch (error) {
      console.error('❌ RegisterPage: Error handling conflict:', error);
      setState(prev => ({ 
        ...prev, 
        showConflictDialog: false,
        dataState: 'ready' // Proceed anyway on error
      }));
    }
  }, [state.userProfile, router]);
  
  const retryFetch = useCallback(() => {
    redirectedRef.current = false;  // Reset redirect flag so retry can fetch again
    setState(prev => ({ ...prev, loading: 'retrying' }));
    fetchData();
  }, [fetchData]);
  
  // Initial fetch - only fetch once on component mount
  useEffect(() => {
    if (userId && isOnline && !redirectedRef.current) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isOnline]);  // Remove fetchData from dependency array to prevent infinite loops
  
  return {
    ...state,
    retryFetch,
    handleConflictResolution
  };
};

const Register: React.FC = () => {
  const params = useParams();
  const userId = params?.userId as string;
  
  // Performance and accessibility monitoring
  const { metrics, optimizeForConnection, reportPerfIssue } = usePagePerformance();
  const { reducedMotion, highContrast } = useAccessibility();
  
  const {
    loading,
    dataState,
    user,
    patient,
    frequencyAnalysis,
    error,
    retryCount,
    isOnline,
    showConflictDialog,
    userProfile,
    retryFetch,
    handleConflictResolution
  } = useProgressiveDataFetching(userId);
  
  // Report performance issues if detected
  useEffect(() => {
    if (metrics && metrics.loadTime > 3000) {
      reportPerfIssue(`Slow page load detected: ${metrics.loadTime}ms`);
    }
  }, [metrics, reportPerfIssue]);
  
  // Memoized components for performance
  const LoadingSpinner = useMemo(() => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <EnhancedLoadingSkeleton 
        variant="register" 
        showProgress={loading === 'loading'}
        customMessage={loading === 'retrying' ? `Retrying... (${retryCount}/3)` : undefined}
      />
      
      {/* Additional loading context */}
      <motion.div
        className="text-center p-4 border-t border-white/5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
          </motion.div>
          <span>
            {loading === 'retrying' 
              ? 'Reconnecting to ensure the best experience...' 
              : 'Preparing your premium dining profile...'
            }
          </span>
        </div>
      </motion.div>
    </motion.div>
  ), [loading, retryCount]);
  
  const ErrorState = useMemo(() => (
    <motion.div
      className="flex items-center justify-center p-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="text-center space-y-6 max-w-md">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          {isOnline ? (
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
          ) : (
            <WifiOff className="w-16 h-16 text-gray-500 mx-auto" />
          )}
        </motion.div>
        
        <div>
          <h3 className="text-white text-xl font-semibold mb-2">
            {isOnline ? 'Unable to Load Profile' : 'No Internet Connection'}
          </h3>
          <p className="text-gray-400">
            {isOnline 
              ? "We're having trouble loading your information. Please try again."
              : "Please check your internet connection and try again."
            }
          </p>
          {error && (
            <p className="text-red-400 text-sm mt-2 font-mono">{error}</p>
          )}
        </div>
        
        <motion.button
          onClick={retryFetch}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 mx-auto transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Try Again
        </motion.button>
        
        {retryCount > 0 && (
          <p className="text-gray-500 text-sm">
            Retried {retryCount} time{retryCount > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </motion.div>
  ), [error, isOnline, retryCount, retryFetch]);
  
  const FrequencyAnalysisIndicator = useMemo(() => {
    if (!frequencyAnalysis || dataState !== 'ready') return null;
    
    const profile = frequencyAnalysis.userProfile;
    const isReturningCustomer = profile.existingReservations > 0;
    const isVip = profile.existingReservations >= 5; // 5+ reservations = VIP
    
    return (
      <div className="mb-6">
        <SuccessIndicator
          type={isReturningCustomer ? 'welcome-back' : 'profile-ready'}
          title={isReturningCustomer ? undefined : 'Profile Analysis Complete'}
          message={frequencyAnalysis.userMessage}
          userDetails={{
            name: profile.name,
            reservationCount: profile.existingReservations,
            isVip
          }}
        />
      </div>
    );
  }, [frequencyAnalysis, dataState]);
  
  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold">Invalid Access</h1>
          <p className="text-gray-400">Please start your reservation from the beginning.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden"
      data-optimize-connection={optimizeForConnection}
      data-reduced-motion={reducedMotion}
    >
      {/* Refined Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary ambient glow */}
        <div className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-500/8 to-amber-600/4 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-amber-600/6 to-amber-500/3 rounded-full blur-[100px]" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(251,191,36,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(251,191,36,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Floating orbs - reduced */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-amber-400/20 rounded-full"
            style={{
              left: `${20 + i * 20}%`,
              top: `${25 + (i % 2) * 30}%`,
            }}
            animate={{
              y: [0, -25, 0],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 5 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.6,
            }}
          />
        ))}
      </div>
      
      {/* Connection Status Indicator */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium"
          >
            <WifiOff className="w-4 h-4 inline mr-2" />
            No Internet Connection
          </motion.div>
        )}
      </AnimatePresence>

      {/* Performance Indicator (Development) */}
      {process.env.NODE_ENV === 'development' && metrics && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed top-4 right-4 z-40 bg-black/80 backdrop-blur-md text-white p-2 rounded-lg text-xs font-mono"
        >
          <div className="space-y-1">
            <div>Load: {metrics.loadTime}ms</div>
            <div>Render: {metrics.renderTime}ms</div>
            {metrics.connectionType && (
              <div className={`${metrics.isSlowConnection ? 'text-orange-400' : 'text-green-400'}`}>
                {metrics.connectionType}
              </div>
            )}
          </div>
        </motion.div>
      )}
      
      {/* Main Content */}
      <section className="remove-scrollbar container relative z-10">
        <div className="sub-container max-w-[860px] flex-1 flex-col py-10">
          {/* Enhanced Premium Logo */}
          <motion.div 
            className="mb-8"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="relative">
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-600 blur-lg opacity-70"
                  animate={{
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
                <h1 className="relative text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                  AM | PM Lounge
                </h1>
              </div>
              <motion.div
                animate={{
                  rotate: [0, 10, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <Heart className="w-8 h-8 text-amber-400" />
              </motion.div>
            </div>
            <p className="text-gray-400 text-lg">Complete Your Reservation Profile</p>
          </motion.div>
          
          {/* Enhanced Glass Card Container */}
          <motion.div
            className="backdrop-blur-2xl bg-slate-900/50 rounded-3xl border border-slate-700/40 shadow-2xl shadow-black/20 ring-1 ring-white/5 overflow-hidden"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Loading and Data States */}
            <AnimatePresence mode="wait">
              {(loading === 'loading' || loading === 'retrying') && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {LoadingSpinner}
                </motion.div>
              )}
              
              {loading === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {ErrorState}
                </motion.div>
              )}
              
              {(loading === 'success' && dataState !== 'error') && (
                <motion.div
                  key="content"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="p-8"
                >
                  {/* Header with Status */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-xl lg:text-2xl font-semibold text-white mb-2 tracking-tight">Guest Information</h2>
                        <p className="text-slate-400 text-sm">Help us personalize your dining experience</p>
                      </div>

                      {/* Profile Status Indicator */}
                      <motion.div
                        className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                      >
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-green-400 text-sm font-medium">Profile Ready</span>
                      </motion.div>
                    </div>
                    
                    {/* Frequency Analysis Indicator */}
                    {FrequencyAnalysisIndicator}
                  </div>
                  
                  {/* Loading State for Form */}
                  <AnimatePresence mode="wait">
                    {dataState === 'validating' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center py-8"
                      >
                        <div className="text-center">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          >
                            <Shield className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                          </motion.div>
                          <p className="text-white text-sm">Validating reservation frequency...</p>
                        </div>
                      </motion.div>
                    )}
                    
                    {dataState === 'ready' && user && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <FormTransitionWrapper
                          submitMessage="Creating your premium dining reservation..."
                          successMessage="Welcome to AM | PM Lounge! Your reservation is being processed."
                        >
                          <RegisterForm user={user} />
                        </FormTransitionWrapper>
                      </motion.div>
                    )}
                    
                    {dataState === 'conflict' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-8"
                      >
                        <Sparkles className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-white text-lg font-semibold mb-2">
                          Reviewing Your Reservation Request
                        </h3>
                        <p className="text-gray-400">
                          We've detected some reservation activity. Please review your options.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          
          {/* Enhanced Footer */}
          <motion.p
            className="text-center text-slate-500 py-12 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            © 2025 AM | PM Lounge · Premium Dining Experience
          </motion.p>
        </div>
      </section>
      
      {/* Enhanced Side Image */}
      <motion.div
        className="hidden lg:flex items-center justify-center relative max-w-[500px] p-8"
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="relative">
          {/* Enhanced Glass Card Behind Image */}
          <div className="absolute inset-0 backdrop-blur-xl bg-gradient-to-br from-amber-500/5 to-amber-600/5 rounded-3xl border border-slate-700/40" />

          {/* Restaurant Image */}
          <div className="relative p-6">
            <motion.div
              whileHover={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Image
                src="/assets/images/register-img.png"
                height={600}
                width={500}
                alt="Premium Dining"
                className="rounded-2xl shadow-2xl shadow-black/30"
                priority
              />
            </motion.div>

            {/* Enhanced Overlay Text */}
            <motion.div
              className="absolute bottom-10 left-10 right-10 backdrop-blur-xl bg-slate-900/70 rounded-2xl p-6 border border-slate-700/50"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <ChefHat className="w-5 h-5 text-amber-400" />
                <h3 className="text-white text-lg font-semibold tracking-tight">Exclusive Benefits</h3>
              </div>
              <ul className="text-slate-300 space-y-3 text-sm">
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 }}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Priority Reservations</span>
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.4 }}
                  className="flex items-center gap-2"
                >
                  <Heart className="w-4 h-4 text-amber-400" />
                  <span>Complimentary Welcome Drink</span>
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.6 }}
                  className="flex items-center gap-2"
                >
                  <ChefHat className="w-4 h-4 text-amber-400" />
                  <span>Special Occasion Perks</span>
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.8 }}
                  className="flex items-center gap-2"
                >
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>VIP Treatment</span>
                </motion.li>
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Conflict Resolution Dialog */}
      {showConflictDialog && userProfile && (
        <ReservationConflictDialog
          isOpen={showConflictDialog}
          userProfile={userProfile}
          onChoice={handleConflictResolution}
        />
      )}
    </div>
  );
};

export default Register;