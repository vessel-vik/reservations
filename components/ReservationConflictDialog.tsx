"use client"

import * as React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Calendar, Users, CheckCircle2, X, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ReservationConflictDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  onCancel: () => void
  conflictData: {
    type: 'frequent-user' | 'duplicate-reservation' | 'confirmation-needed'
    message: string
    existingReservations?: number
    userEmail?: string
    userName?: string
  }
  loading?: boolean
}

export function ReservationConflictDialog({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  conflictData,
  loading = false
}: ReservationConflictDialogProps) {
  const [confirmationStep, setConfirmationStep] = useState<'warning' | 'confirmed'>('warning')

  const handleConfirm = () => {
    if (confirmationStep === 'warning') {
      setConfirmationStep('confirmed')
      setTimeout(() => {
        onConfirm()
      }, 800)
    }
  }

  const handleCancel = () => {
    setConfirmationStep('warning')
    onCancel()
  }

  const getDialogContent = () => {
    switch (conflictData.type) {
      case 'frequent-user':
        return {
          icon: <Users className="w-12 h-12 text-amber-500" />,
          title: "Welcome Back, Valued Guest!",
          description: "We see you're one of our frequent diners. Would you like to make an additional reservation?",
          confirmText: "Yes, Make Additional Reservation",
          cancelText: "Cancel",
          bgColor: "from-amber-500/10 to-amber-600/10",
          borderColor: "border-amber-500/20"
        }
      
      case 'duplicate-reservation':
        return {
          icon: <AlertTriangle className="w-12 h-12 text-orange-500" />,
          title: "Recent Reservation Detected",
          description: "You recently made a reservation. Are you sure you want to create another one?",
          confirmText: "Yes, Create Another",
          cancelText: "Cancel",
          bgColor: "from-orange-500/10 to-orange-600/10",
          borderColor: "border-orange-500/20"
        }
      
      case 'confirmation-needed':
      default:
        return {
          icon: <Calendar className="w-12 h-12 text-blue-500" />,
          title: "Reservation Confirmation",
          description: conflictData.message || "Please confirm your reservation request.",
          confirmText: "Confirm Reservation",
          cancelText: "Cancel",
          bgColor: "from-blue-500/10 to-blue-600/10",
          borderColor: "border-blue-500/20"
        }
    }
  }

  const dialogContent = getDialogContent()

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="backdrop-blur-2xl bg-slate-900/90 border border-slate-700/50 rounded-2xl shadow-2xl max-w-md w-full p-6 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 mb-6">
            <motion.div
              className={`p-3 rounded-full bg-gradient-to-br ${dialogContent.bgColor} border ${dialogContent.borderColor}`}
              animate={{
                scale: confirmationStep === 'confirmed' ? [1, 1.1, 1] : [1, 1.05, 1],
                rotate: confirmationStep === 'confirmed' ? [0, 10, -10, 0] : 0
              }}
              transition={{
                duration: confirmationStep === 'confirmed' ? 0.6 : 2,
                repeat: confirmationStep === 'confirmed' ? 0 : Infinity,
                repeatType: "reverse"
              }}
            >
              <AnimatePresence mode="wait">
                {confirmationStep === 'confirmed' ? (
                  <motion.div
                    key="confirmed"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="warning"
                    initial={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {dialogContent.icon}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">
                {confirmationStep === 'confirmed' ? 'Confirmed!' : dialogContent.title}
              </h3>
              <p className="text-gray-300 mt-1 text-sm">
                {confirmationStep === 'confirmed' 
                  ? 'Processing your request...' 
                  : dialogContent.description}
              </p>
            </div>
          </div>

          {/* User Information */}
          {(conflictData.userName || conflictData.userEmail) && confirmationStep === 'warning' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg bg-gradient-to-r ${dialogContent.bgColor} border ${dialogContent.borderColor} mb-6`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">Guest Information</span>
                </div>
                {conflictData.userName && (
                  <p className="text-sm text-gray-300">Name: {conflictData.userName}</p>
                )}
                {conflictData.userEmail && (
                  <p className="text-sm text-gray-300">Email: {conflictData.userEmail}</p>
                )}
                {conflictData.existingReservations && (
                  <p className="text-sm text-gray-300">
                    Existing reservations: {conflictData.existingReservations}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* Action Buttons */}
          <AnimatePresence mode="wait">
            {confirmationStep === 'warning' ? (
              <motion.div
                key="buttons"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex gap-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 hover:text-white border border-slate-700/50"
                >
                  <X className="w-4 h-4 mr-2" />
                  {dialogContent.cancelText}
                </Button>
                
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  {loading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                    />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  {dialogContent.confirmText}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-4"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full mx-auto mb-2"
                />
                <p className="text-sm text-gray-300">Setting up your reservation...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}