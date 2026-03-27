"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, 
  Clock, 
  X, 
  Check, 
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle 
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Appointment } from "@/types/appwrite.types";
import { updateAppointment } from "@/lib/actions/appointment.actions";
import { sendConfirmationEmail } from "@/lib/client-email.service";
import { format, isBefore, isAfter, addHours } from "date-fns";

interface RescheduleModalProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  appointment,
  isOpen,
  onClose,
  onUpdate
}) => {
  const [newDateTime, setNewDateTime] = useState<Date>(
    appointment ? new Date(appointment.schedule) : new Date()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [conflictCheck, setConflictCheck] = useState<'checking' | 'available' | 'conflict' | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");

  if (!appointment) return null;

  // Business hours validation
  const isValidTime = (date: Date): boolean => {
    const hours = date.getHours();
    return hours >= 12 && hours <= 23; // 12 PM to 11 PM
  };

  // Check if selected time is in the future (at least 2 hours from now)
  const isFutureTime = (date: Date): boolean => {
    const minimumTime = addHours(new Date(), 2);
    return isAfter(date, minimumTime);
  };

  const handleDateTimeChange = async (date: Date) => {
    setNewDateTime(date);
    
    // Check availability against real reservations
    setConflictCheck('checking');
    
    try {
      // Fetch current reservations for the selected date/time
      const response = await fetch('/api/analytics');
      const analytics = await response.json();
      
      // Check for conflicts within 30-minute window
      const selectedTime = date.getTime();
      const conflictWindow = 30 * 60 * 1000; // 30 minutes in milliseconds
      
      const hasConflict = analytics.recentReservations.some((reservation: any) => {
        if (reservation.$id === appointment.$id) return false; // Ignore current appointment
        if (reservation.status === 'cancelled') return false; // Ignore cancelled
        
        const reservationTime = new Date(reservation.schedule).getTime();
        const timeDiff = Math.abs(selectedTime - reservationTime);
        
        return timeDiff < conflictWindow;
      });
      
      // Additional capacity check - assume 5 tables per hour slot
      const sameHourReservations = analytics.recentReservations.filter((reservation: any) => {
        if (reservation.status === 'cancelled') return false;
        const reservationDate = new Date(reservation.schedule);
        return reservationDate.getHours() === date.getHours() &&
               reservationDate.toDateString() === date.toDateString();
      });
      
      const isOverCapacity = sameHourReservations.length >= 5;
      
      setConflictCheck(hasConflict || isOverCapacity ? 'conflict' : 'available');
    } catch (error) {
      console.error('Failed to check availability:', error);
      // Fallback to simple time-based availability
      const isBusinessHour = date.getHours() >= 12 && date.getHours() <= 22;
      setConflictCheck(isBusinessHour ? 'available' : 'conflict');
    }
  };

  const handleReschedule = async () => {
    if (!isValidTime(newDateTime) || !isFutureTime(newDateTime)) {
      return;
    }

    setIsLoading(true);

    try {
      const appointmentToUpdate = {
        userId: appointment.userId,
        appointmentId: appointment.$id,
        appointment: {
          primaryPhysician: appointment.primaryPhysician,
          schedule: newDateTime,
          status: "scheduled" as const,
          cancellationReason: undefined,
          partySize: appointment.partySize,
          reason: appointment.reason,
          note: appointment.note
        },
        type: "reschedule" as const,
      };

      const updatedAppointment = await updateAppointment(appointmentToUpdate);

      if (updatedAppointment) {
        // Extract special requests
        const extractSpecialRequests = (note: string | undefined): string => {
          if (!note) return "None";
          const cleaned = note.replace(/Party Size: [^|]*\|?\s*/, '').trim();
          return cleaned || "None";
        };

        // Send rescheduled notification email
        const emailData = {
          to_email: appointment.patient.email,
          to_name: appointment.patient.name,
          from_name: 'AM | PM Lounge',
          reservation_date: format(newDateTime, 'EEEE, MMMM do, yyyy'),
          time: format(newDateTime, 'h:mm a'),
          party_size: appointment.partySize || '2 Guests',
          location: 'Northern Bypass, Thome - Kiambu Road',
          welcome_drink: appointment.primaryPhysician || 'House Special Cocktail',
          occasion: appointment.reason || 'Dining Experience',
          special_requests: extractSpecialRequests(appointment.note),
          status: 'RESCHEDULED ⏰',
          message: `Great news! Your reservation has been successfully rescheduled. ${rescheduleReason ? `Reason: ${rescheduleReason}.` : ''} We've secured your new date and time, and our team is ready to provide you with an exceptional dining experience. Thank you for your understanding!`,
          restaurant_name: 'AM | PM Lounge',
          restaurant_tagline: 'Premium Restaurant & Bar Experience',
          booking_id: appointment.$id.slice(-8).toUpperCase(),
          phone: '+254 757 650 125',
          email_contact: 'reservations@ampmlounge.com',
          dress_code: 'Smart Casual',
          parking: 'Complimentary Valet Parking Available',
          cancellation_policy: 'Free cancellation up to 2 hours before reservation time',
          current_year: new Date().getFullYear().toString()
        };

        await sendConfirmationEmail(emailData);

        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Reservation Rescheduled! ⏰', {
            body: `${appointment.patient.name}'s reservation moved to ${format(newDateTime, 'MMM dd, h:mm a')}`,
            icon: '/assets/icons/logo-full.svg',
            tag: 'reschedule-success',
          });
        }

        onUpdate();
        onClose();
      }
    } catch (error) {
      console.error('Failed to reschedule reservation:', error);
    }

    setIsLoading(false);
  };

  const originalDate = new Date(appointment.schedule);
  const hasChanged = newDateTime.getTime() !== originalDate.getTime();

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md bg-slate-900 border border-amber-500/20">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Calendar className="w-5 h-5 text-amber-400" />
                Reschedule Reservation
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Guest Information */}
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <h3 className="text-white font-medium mb-2">{appointment.patient.name}</h3>
                <div className="space-y-1 text-sm text-slate-400">
                  <p>Party Size: {appointment.partySize || '2 Guests'}</p>
                  <p>Occasion: {appointment.reason}</p>
                  <p>Current Date: {format(originalDate, 'EEEE, MMM dd, yyyy \'at\' h:mm a')}</p>
                </div>
              </div>

              {/* Date & Time Picker */}
              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-300">New Date & Time</label>
                
                <div className="relative">
                  <DateTimePicker
                    date={newDateTime}
                    setDate={handleDateTimeChange}
                    className="w-full"
                  />
                  
                  {/* Availability Indicator */}
                  {conflictCheck && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                        conflictCheck === 'checking' 
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : conflictCheck === 'available'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {conflictCheck === 'checking' ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Checking...
                        </>
                      ) : conflictCheck === 'available' ? (
                        <>
                          <Check className="w-3 h-3" />
                          Available
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          Busy Time
                        </>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Time Validation Messages */}
                <div className="space-y-1">
                  {!isValidTime(newDateTime) && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Please select a time between 12:00 PM and 11:00 PM
                    </p>
                  )}
                  {!isFutureTime(newDateTime) && isValidTime(newDateTime) && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Must be at least 2 hours from now
                    </p>
                  )}
                  {conflictCheck === 'conflict' && (
                    <p className="text-orange-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      This time slot is busy. Consider selecting a different time.
                    </p>
                  )}
                </div>
              </div>

              {/* Optional Reason */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Reason for Rescheduling (Optional)</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g., Kitchen maintenance, staff training, customer request..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 text-sm resize-none focus:border-amber-500/50 focus:outline-none"
                  rows={2}
                  maxLength={150}
                />
                <p className="text-xs text-slate-500">{rescheduleReason.length}/150 characters</p>
              </div>

              {/* Change Summary */}
              {hasChanged && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <h4 className="text-amber-400 font-medium text-sm mb-2">Reschedule Summary:</h4>
                  <div className="space-y-1 text-xs text-slate-300">
                    <p><span className="text-slate-400">From:</span> {format(originalDate, 'MMM dd, yyyy \'at\' h:mm a')}</p>
                    <p><span className="text-slate-400">To:</span> {format(newDateTime, 'MMM dd, yyyy \'at\' h:mm a')}</p>
                    <p className="text-amber-300">✉️ Confirmation email will be sent to guest</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleReschedule}
                  disabled={
                    isLoading || 
                    !hasChanged || 
                    !isValidTime(newDateTime) || 
                    !isFutureTime(newDateTime) ||
                    conflictCheck === 'checking'
                  }
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Rescheduling...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Confirm Reschedule
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="px-6 border-slate-600 hover:bg-slate-800"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
};