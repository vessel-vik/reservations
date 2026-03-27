"use client"

import * as React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Mail, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface EmailVerificationProps {
  email: string
  onEmailChange: (email: string) => void
  onVerificationComplete: (isValid: boolean) => void
  disabled?: boolean
}

export function EmailVerification({
  email,
  onEmailChange,
  onVerificationComplete,
  disabled
}: EmailVerificationProps) {
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'checking' | 'valid' | 'invalid' | 'error'
  >('idle')
  const [statusMessage, setStatusMessage] = useState('')

  const validateEmailFormat = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const checkEmailExists = async (email: string): Promise<boolean> => {
    // Simulate email verification API call
    // In a real implementation, you would call an email verification service
    try {
      setIsVerifying(true)
      setVerificationStatus('checking')
      setStatusMessage('Verifying email address...')

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Basic domain validation (you can replace this with actual email verification API)
      const commonDomains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
        'icloud.com', 'protonmail.com', 'mail.com', 'live.com', 'msn.com'
      ]
      
      const domain = email.split('@')[1]?.toLowerCase()
      const isValid = commonDomains.includes(domain) || domain?.includes('.')

      if (isValid) {
        setVerificationStatus('valid')
        setStatusMessage('Email verified successfully!')
        setIsVerified(true)
        onVerificationComplete(true)
      } else {
        setVerificationStatus('invalid')
        setStatusMessage('Please provide a valid email address')
        onVerificationComplete(false)
      }

      return isValid
    } catch (error) {
      setVerificationStatus('error')
      setStatusMessage('Unable to verify email. Please try again.')
      onVerificationComplete(false)
      return false
    } finally {
      setIsVerifying(false)
    }
  }

  const handleEmailBlur = () => {
    if (email && validateEmailFormat(email) && !isVerified) {
      checkEmailExists(email)
    } else if (email && !validateEmailFormat(email)) {
      setVerificationStatus('invalid')
      setStatusMessage('Please enter a valid email format')
      onVerificationComplete(false)
    }
  }

  const handleEmailChange = (newEmail: string) => {
    onEmailChange(newEmail)
    setIsVerified(false)
    setVerificationStatus('idle')
    setStatusMessage('')
    onVerificationComplete(false)
  }

  const getStatusIcon = () => {
    switch (verificationStatus) {
      case 'checking':
        return <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'invalid':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Mail className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = () => {
    switch (verificationStatus) {
      case 'checking':
        return 'border-amber-500'
      case 'valid':
        return 'border-green-500'
      case 'invalid':
      case 'error':
        return 'border-red-500'
      default:
        return 'border-slate-700/50'
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">
          Email Address <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <div className={cn(
            "relative flex items-center rounded-xl border bg-slate-800/50 transition-all duration-200",
            getStatusColor(),
            disabled && "opacity-50"
          )}>
            <div className="absolute left-3 flex items-center">
              {getStatusIcon()}
            </div>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              placeholder="your.email@example.com"
              disabled={disabled || isVerifying}
              className="pl-10 border-0 bg-transparent text-white placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Status Message */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                "flex items-center gap-2 text-xs",
                verificationStatus === 'valid' && "text-green-400",
                verificationStatus === 'invalid' && "text-red-400",
                verificationStatus === 'error' && "text-red-400",
                verificationStatus === 'checking' && "text-amber-400"
              )}
            >
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Verification Success Animation */}
        <AnimatePresence>
          {isVerified && verificationStatus === 'valid' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-green-500/10 border border-green-500/20 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-green-400 font-medium">Email Verified!</p>
                  <p className="text-xs text-green-300/70">You can now proceed with your reservation</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Retry Button for Failed Verification */}
        <AnimatePresence>
          {(verificationStatus === 'error' || verificationStatus === 'invalid') && email && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => checkEmailExists(email)}
                disabled={isVerifying}
                className="text-xs text-amber-400 hover:text-amber-300 h-auto p-2"
              >
                Try verification again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}