"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Form } from "@/components/ui/form";
import { createUser } from "@/lib/actions/guest.actions";
import { UserFormValidation } from "@/lib/validation";
import CustomFormField, { FormFieldType } from "../CustomFormField";
import SubmitButton from "../SubmitButton";
import { EmailVerification } from "@/components/ui/email-verification";
import { Calendar, Mail, Phone, User, Sparkles, ChefHat, Clock, Users, CheckCircle2, Shield } from "lucide-react";
import "react-phone-number-input/style.css";

export const GuestForm = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [emailVerified, setEmailVerified] = useState(false);
  const [currentStep, setCurrentStep] = useState<'email' | 'details'>('email');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const form = useForm<z.infer<typeof UserFormValidation>>({
    resolver: zodResolver(UserFormValidation),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof UserFormValidation>) => {
    console.log('🎆 GuestForm: Starting submission with values:', values);
    setIsLoading(true);

    try {
      // Ensure email is verified before proceeding
      if (!emailVerified) {
        console.error('❌ Email not verified');
        setIsLoading(false);
        return;
      }

      const user = {
        name: values.name,
        email: values.email,
        phone: values.phone,
      };

      console.log('📤 GuestForm: Calling createUser with:', user);
      const newUser = await createUser(user);
      console.log('💬 GuestForm: createUser response:', newUser);

      if (newUser) {
        setShowSuccess(true);
        // Add a small delay for the success animation
        setTimeout(() => {
          router.push(`/guests/${newUser.$id}/register`);
        }, 800);
      }
    } catch (error: any) {
      console.error('❌ GuestForm: Error during submission:', error);
      console.error('❌ GuestForm: Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack
      });
    }

    setIsLoading(false);
  };

  const handleEmailVerification = (isValid: boolean) => {
    setEmailVerified(isValid);
    if (isValid) {
      setTimeout(() => setCurrentStep('details'), 500);
    }
  };

  const handleStepBack = () => {
    setCurrentStep('email');
    setEmailVerified(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 10,
      },
    },
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-6">
        {/* Enhanced Header with Progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <motion.div 
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  currentStep === 'email' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 
                  emailVerified ? 'bg-green-500/10 border-green-500/30 text-green-400' : 
                  'bg-gray-500/10 border-gray-500/30 text-gray-400'
                }`}
                whileHover={{ scale: 1.02 }}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  emailVerified ? 'bg-green-500 text-white' : 
                  currentStep === 'email' ? 'bg-amber-500 text-white' : 'bg-gray-500 text-white'
                }`}>
                  {emailVerified ? <CheckCircle2 className="w-3 h-3" /> : '1'}
                </div>
                <span className="text-sm font-medium">Email</span>
              </motion.div>

              <div className="w-8 h-0.5 bg-gray-600 rounded-full">
                <motion.div 
                  className="h-full bg-amber-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: emailVerified ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              <motion.div 
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  currentStep === 'details' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 
                  'bg-gray-500/10 border-gray-500/30 text-gray-400'
                }`}
                whileHover={{ scale: emailVerified ? 1.02 : 1 }}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStep === 'details' ? 'bg-amber-500 text-white' : 'bg-gray-500 text-white'
                }`}>
                  2
                </div>
                <span className="text-sm font-medium">Details</span>
              </motion.div>
            </div>

            {/* Live Stats */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-300">Live</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                <span className="text-xs text-amber-400 font-medium">
                  {currentTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Security Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 mb-4"
          >
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-400 font-medium">Secure & Private</span>
            <div className="flex items-center gap-1 ml-auto">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-gray-300">4.9★ (2.1k reviews)</span>
            </div>
          </motion.div>
        </motion.div>


        {/* Multi-Step Form Content */}
        <AnimatePresence mode="wait">
          {currentStep === 'email' ? (
            <motion.div
              key="email-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Email Verification Step */}
              <div className="text-center space-y-4">
                <motion.div
                  className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full shadow-xl shadow-amber-500/20"
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 5, -5, 0] 
                  }}
                  transition={{ 
                    duration: 4,
                    repeat: Infinity,
                    repeatType: "reverse" 
                  }}
                >
                  <Mail className="w-8 h-8 text-white" />
                </motion.div>
                
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Verify Your Email
                  </h3>
                  <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    We'll verify your email address to ensure we can send you reservation confirmations
                  </p>
                </div>
              </div>

              <EmailVerification
                email={form.watch('email')}
                onEmailChange={(email) => form.setValue('email', email)}
                onVerificationComplete={handleEmailVerification}
                disabled={isLoading}
              />

              <motion.div
                className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm text-amber-400 font-medium">Why verify?</p>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li>• Instant reservation confirmations</li>
                      <li>• Important updates about your booking</li>
                      <li>• Exclusive offers and menu updates</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="details-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              {/* Details Step */}
              <div className="text-center space-y-3">
                <motion.div
                  className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-xl shadow-green-500/20"
                  animate={{ 
                    scale: [1, 1.05, 1] 
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse" 
                  }}
                >
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </motion.div>
                
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Complete Your Profile
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Almost done! Just need a few more details for your reservation
                  </p>
                </div>

                {/* Back Button */}
                <button
                  type="button"
                  onClick={handleStepBack}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  ← Change email address
                </button>
              </div>

              {/* Name Field */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <CustomFormField
                  fieldType={FormFieldType.INPUT}
                  control={form.control}
                  name="name"
                  label="Your Name"
                  placeholder="John Doe"
                  iconSrc="/assets/icons/user.svg"
                  iconAlt="user"
                />
              </motion.div>

              {/* Phone Field */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <CustomFormField
                  fieldType={FormFieldType.PHONE_INPUT}
                  control={form.control}
                  name="phone"
                  label="Phone Number"
                  placeholder="+254 700 000 000"
                />
              </motion.div>

              {/* Submit Button */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="pt-2"
              >
                <SubmitButton 
                  isLoading={isLoading}
                  showSuccess={showSuccess}
                  loadingText="Creating your profile..."
                  successText="Profile created! Redirecting..."
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-4 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] relative overflow-hidden group"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.6 }}
                  />
                  <motion.span
                    className="relative flex items-center justify-center gap-3"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <span className="text-base">Complete Reservation Setup</span>
                    <motion.span
                      animate={{ 
                        rotate: [0, 15, -15, 0],
                        scale: [1, 1.2, 1]
                      }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 3
                      }}
                    >
                      <Calendar className="w-5 h-5" />
                    </motion.span>
                  </motion.span>
                </SubmitButton>
              </motion.div>

              {/* Benefits Reminder */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-white font-medium text-sm">What's Next?</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-amber-500" />
                        <span>Dining preferences</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-amber-500" />
                        <span>Welcome drink</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-amber-500" />
                        <span>Date & time</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-amber-500" />
                        <span>Confirmation</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Success Overlay */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-full p-6"
              >
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    rotate: [0, 360]
                  }}
                  transition={{ 
                    duration: 1,
                    ease: "easeInOut"
                  }}
                >
                  <Sparkles className="w-12 h-12 text-white" />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </form>
    </Form>
  );
};