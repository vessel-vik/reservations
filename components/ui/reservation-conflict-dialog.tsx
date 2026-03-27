"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar, CheckCircle, AlertTriangle, Users, Plus } from 'lucide-react';
import { UserReservationProfile } from '@/lib/reservation-frequency';

interface ReservationConflictDialogProps {
  isOpen: boolean;
  userProfile: UserReservationProfile;
  onChoice: (choice: 'create-additional' | 'modify-existing' | 'cancel' | 'proceed-anyway') => void;
}

const ReservationConflictDialog: React.FC<ReservationConflictDialogProps> = ({
  isOpen,
  userProfile,
  onChoice
}) => {
  const getConflictIcon = () => {
    switch (userProfile.requestFrequency) {
      case 'rapid-duplicate':
        return <AlertTriangle className="w-8 h-8 text-amber-500" />;
      case 'frequent':
        return <Clock className="w-8 h-8 text-blue-500" />;
      case 'returning':
        return <Users className="w-8 h-8 text-green-500" />;
      default:
        return <Calendar className="w-8 h-8 text-gray-500" />;
    }
  };

  const getConflictTitle = () => {
    switch (userProfile.requestFrequency) {
      case 'rapid-duplicate':
        return 'Recent Reservation Detected';
      case 'frequent':
        return 'Multiple Reservations Today';
      case 'returning':
        return 'Welcome Back!';
      default:
        return 'Reservation Status';
    }
  };

  const getConflictMessage = () => {
    switch (userProfile.requestFrequency) {
      case 'rapid-duplicate':
        return `You made a reservation just ${userProfile.conflictDetails?.duplicateWithin} ago. This might be a duplicate request.`;
      case 'frequent':
        return `You already have reservations today. Would you like to make an additional booking?`;
      case 'returning':
        return `Great to see you again! You have ${userProfile.existingReservations} previous reservations with us.`;
      default:
        return 'Processing your reservation request...';
    }
  };

  const getAvailableOptions = () => {
    switch (userProfile.requestFrequency) {
      case 'rapid-duplicate':
        return [
          {
            id: 'cancel',
            label: 'Cancel - I already have a reservation',
            description: 'Keep your existing reservation',
            icon: <CheckCircle className="w-5 h-5 text-green-500" />,
            primary: true
          },
          {
            id: 'proceed-anyway',
            label: 'Create New Reservation',
            description: 'Make an additional booking',
            icon: <Plus className="w-5 h-5 text-amber-500" />,
            primary: false
          }
        ];
      case 'frequent':
        return [
          {
            id: 'create-additional',
            label: 'Yes, Make Additional Reservation',
            description: 'Create a new booking for today',
            icon: <Plus className="w-5 h-5 text-green-500" />,
            primary: true
          },
          {
            id: 'modify-existing',
            label: 'Modify Existing Reservation',
            description: 'Update your current booking',
            icon: <Calendar className="w-5 h-5 text-blue-500" />,
            primary: false
          },
          {
            id: 'cancel',
            label: 'Cancel',
            description: 'Keep existing reservations only',
            icon: <CheckCircle className="w-5 h-5 text-gray-500" />,
            primary: false
          }
        ];
      case 'returning':
        return [
          {
            id: 'create-additional',
            label: 'Make New Reservation',
            description: 'Book another table',
            icon: <Plus className="w-5 h-5 text-green-500" />,
            primary: true
          },
          {
            id: 'cancel',
            label: 'Cancel',
            description: 'Maybe later',
            icon: <CheckCircle className="w-5 h-5 text-gray-500" />,
            primary: false
          }
        ];
      default:
        return [];
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="backdrop-blur-2xl bg-slate-900/90 border border-slate-700/50 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-700/50">
            <motion.div 
              className="flex items-center gap-4"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              {getConflictIcon()}
              <div>
                <h3 className="text-xl font-bold text-white">
                  {getConflictTitle()}
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  {getConflictMessage()}
                </p>
              </div>
            </motion.div>
          </div>

          {/* User Info */}
          <motion.div 
            className="p-6 border-b border-slate-700/50"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Guest:</span>
                <span className="text-white font-medium">{userProfile.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Email:</span>
                <span className="text-white text-sm">{userProfile.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Previous Reservations:</span>
                <span className="text-amber-500 font-medium">{userProfile.existingReservations}</span>
              </div>
              {userProfile.lastReservationDate && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Last Reservation:</span>
                  <span className="text-white text-sm">
                    {userProfile.lastReservationDate.toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Conflict Details */}
          {userProfile.conflictDetails && (
            <motion.div 
              className="p-6 border-b border-slate-700/50 bg-amber-500/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h4 className="text-amber-500 font-medium mb-2">Conflict Details:</h4>
              <div className="space-y-1 text-sm text-gray-300">
                {userProfile.conflictDetails.duplicateWithin && (
                  <div>Last reservation: {userProfile.conflictDetails.duplicateWithin} ago</div>
                )}
                {userProfile.conflictDetails.similarRequests && (
                  <div>Total reservations: {userProfile.conflictDetails.similarRequests}</div>
                )}
              </div>
            </motion.div>
          )}

          {/* Action Options */}
          <div className="p-6">
            <h4 className="text-white font-medium mb-4">What would you like to do?</h4>
            <div className="space-y-3">
              {getAvailableOptions().map((option, index) => (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onChoice(option.id as any)}
                  className={`w-full p-4 rounded-xl border transition-all duration-200 text-left ${
                    option.primary
                      ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                      : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {option.icon}
                    <div className="flex-1">
                      <div className="text-white font-medium">{option.label}</div>
                      <div className="text-gray-400 text-sm mt-1">{option.description}</div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <motion.div 
            className="px-6 pb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="text-xs text-gray-500 text-center">
              Your choice helps us provide the best dining experience
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReservationConflictDialog;