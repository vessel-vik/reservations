"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  X,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuGroup,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
import { Appointment } from "@/types/appwrite.types";
import { updateAppointment } from "@/lib/actions/appointment.actions";
import { sendConfirmationEmail } from "@/lib/client-email.service";
import { RescheduleModal } from "./RescheduleModal";
import { extractSpecialRequests } from "@/lib/export-utils";

interface ReservationActionsProps {
  appointment: Appointment;
  onUpdate: () => void;
}

export const ReservationActions: React.FC<ReservationActionsProps> = ({
  appointment,
  onUpdate,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  const handleQuickAction = async (action: "approve" | "reject" | "reschedule") => {
    // Handle reschedule action separately
    if (action === "reschedule") {
      setShowRescheduleModal(true);
      return;
    }

    setIsLoading(true);
    setActionType(action);

    try {
      let status: "scheduled" | "cancelled" = "scheduled";
      let emailType = "confirmed";

      switch (action) {
        case "approve":
          status = "scheduled";
          emailType = "confirmed";
          break;
        case "reject":
          status = "cancelled";
          emailType = "cancelled";
          break;
      }

      const appointmentToUpdate = {
        userId: appointment.userId,
        appointmentId: appointment.$id,
        appointment: {
          primaryPhysician: appointment.primaryPhysician,
          schedule: appointment.schedule,
          status: status,
          cancellationReason: action === "reject" ? "Declined by restaurant" : undefined,
          partySize: appointment.partySize,
        },
        type: action === "approve" ? "schedule" : "cancel",
      };

      const updatedAppointment = await updateAppointment(appointmentToUpdate);

      if (updatedAppointment) {


        // Send enhanced email notification with complete information
        const emailData = {
          to_email: appointment.patient.email,
          to_name: appointment.patient.name,
          from_name: 'AM | PM Lounge',
          reservation_date: new Date(appointment.schedule).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          time: new Date(appointment.schedule).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }),
          party_size: appointment.partySize || '2 Guests',
          location: 'Northern Bypass, Thome - Kiambu Road',
          welcome_drink: appointment.primaryPhysician || 'House Special Cocktail',
          occasion: appointment.reason || 'Dining Experience',
          special_requests: extractSpecialRequests(appointment.note),
          status: action === "approve" ? 'CONFIRMED ✅' : 'CANCELLED ❌',
          message: action === "approve"
            ? "Fantastic! Your table reservation has been confirmed. Our team is preparing to provide you with an exceptional dining experience. We look forward to welcoming you!"
            : `We sincerely regret that your reservation has been cancelled. ${appointment.cancellationReason ? `Reason: ${appointment.cancellationReason}.` : ''} Please contact us at your convenience to reschedule your visit.`,
          // Additional information for enhanced email template
          restaurant_name: 'AM | PM Lounge',
          restaurant_tagline: 'Premium Restaurant & Bar Experience',
          booking_id: appointment.$id.slice(-8).toUpperCase(),
          phone: '+254 757 650 125',
          email_contact: 'reservations@ampmlounge.com',
          dress_code: 'Smart Casual',
          parking: 'Complimentary Valet Parking Available',
          cancellation_policy: 'Free cancellation up to 2 hours before reservation time'
        };

        await sendConfirmationEmail(emailData);

        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(
            action === "approve" ? 'Reservation Approved! ✅' : 'Reservation Cancelled ❌',
            {
              body: `${appointment.patient.name}'s reservation for ${appointment.partySize} has been ${action === "approve" ? 'approved' : 'cancelled'}.`,
              icon: '/assets/icons/logo-full.svg',
              tag: 'admin-action',
            }
          );
        }

        onUpdate();
      }
    } catch (error) {
      console.error(`Failed to ${action} reservation:`, error);
    }

    setIsLoading(false);
    setActionType("");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "text-green-400 bg-green-500/10 border-green-500/30";
      case "pending": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
      case "cancelled": return "text-red-400 bg-red-500/10 border-red-500/30";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/30";
    }
  };

  const isPending = appointment.status === "pending";
  const isScheduled = appointment.status === "scheduled";

  return (
    <div className="flex items-center gap-2">
      {/* Quick Actions for Pending Reservations */}
      {isPending && (
        <div className="flex items-center gap-1">
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction("approve")}
              disabled={isLoading}
              className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 border border-green-500/20 hover:border-green-500/30"
              title="Approve Reservation"
            >
              {isLoading && actionType === "approve" ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-3 h-3 border border-green-400 border-t-transparent rounded-full"
                />
              ) : (
                <Check className="w-3 h-3" />
              )}
            </Button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction("reschedule")}
              disabled={isLoading}
              className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/30"
              title="Reschedule Reservation"
            >
              <Calendar className="w-3 h-3" />
            </Button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction("reject")}
              disabled={isLoading}
              className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30"
              title="Reject Reservation"
            >
              {isLoading && actionType === "reject" ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-3 h-3 border border-red-400 border-t-transparent rounded-full"
                />
              ) : (
                <X className="w-3 h-3" />
              )}
            </Button>
          </motion.div>
        </div>
      )}

      {/* Status Indicator */}
      <div className={`px-2 py-1 rounded-lg border text-xs font-medium ${getStatusColor(appointment.status)}`}>
        <div className="flex items-center gap-1">
          {appointment.status === "scheduled" && <CheckCircle2 className="w-3 h-3" />}
          {appointment.status === "pending" && <AlertCircle className="w-3 h-3" />}
          {appointment.status === "cancelled" && <X className="w-3 h-3" />}
          <span className="capitalize">{appointment.status}</span>
        </div>
      </div>

      {/* Additional Quick Actions */}
      {isScheduled && (
        <div className="flex items-center gap-1">
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction("reschedule")}
              disabled={isLoading}
              className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/30"
              title="Reschedule Reservation"
            >
              <Calendar className="w-3 h-3" />
            </Button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction("reject")}
              disabled={isLoading}
              className="h-8 px-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/30"
              title="Cancel Reservation"
            >
              {isLoading && actionType === "reject" ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full"
                />
              ) : (
                <X className="w-3 h-3" />
              )}
            </Button>
          </motion.div>
        </div>
      )}

      {/* Reschedule Modal */}
      <RescheduleModal
        appointment={appointment}
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        onUpdate={onUpdate}
      />
    </div>
  );
};