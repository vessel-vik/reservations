"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Appointment } from "@/types/appwrite.types";
import { AppointmentForm } from "./forms/AppointmentForm";
import { sendConfirmationEmail, requestNotificationPermission } from "@/lib/client-email.service";
import { formatDateTime } from "@/lib/utils";
import "react-datepicker/dist/react-datepicker.css";

export const AppointmentModal = ({
  patientId,
  userId,
  appointment,
  type,
  title,
  description,
}: {
  patientId: string;
  userId: string;
  appointment?: Appointment;
  type: "schedule" | "cancel";
  title: string;
  description: string;
}) => {
  const [open, setOpen] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    // Request notification permission when component mounts
    requestNotificationPermission();
  }, []);

  // Send email when appointment is updated and modal closes
  useEffect(() => {
    if (!open && emailSent) {
      sendEmailNotification();
      setEmailSent(false);
    }
  }, [open, emailSent]);

  const sendEmailNotification = async () => {
    if (!appointment) return;

    try {
      // Extract party size from note field
      const extractPartySize = (note: string | undefined): string => {
        if (!note) return '2 Guests';
        const match = note.match(/Party Size: ([^|]+)/);
        return match ? match[1].trim() : '2 Guests';
      };

      // Extract special requests from note field (removing party size info)
      const extractSpecialRequests = (note: string | undefined): string => {
        if (!note) return "None";
        const cleaned = note.replace(/Party Size: [^|]*\|?\s*/, '').trim();
        return cleaned || "None";
      };
      
      const emailData = {
        to_email: appointment.patient.email,
        to_name: appointment.patient.name,
        from_name: "AM | PM Lounge",
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
        party_size: extractPartySize(appointment.note),
        location: 'Northern Bypass, Thome - Kiambu Road',
        welcome_drink: appointment.primaryPhysician || "House Special Cocktail",
        special_requests: extractSpecialRequests(appointment.note),
        occasion: appointment.reason || "Dining Experience",
        status: type === "schedule" ? "CONFIRMED ✅" : "CANCELLED ❌",
        message: type === "schedule"
          ? "Fantastic! Your table reservation has been confirmed. Our team is preparing to provide you with an exceptional dining experience. We look forward to welcoming you!"
          : `We sincerely regret that your reservation has been cancelled. ${
              appointment.cancellationReason
                ? `Reason: ${appointment.cancellationReason}.`
                : ""
            } Please contact us at your convenience to reschedule your visit.`,
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

      console.log("📧 Sending email notification from modal...");
      const success = await sendConfirmationEmail(emailData);
      
      if (success) {
        console.log("✅ Email notification sent successfully!");
      } else {
        console.error("❌ Failed to send email notification");
      }
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  const handleFormSuccess = () => {
    // Mark that email should be sent when modal closes
    setEmailSent(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={`capitalize ${type === "schedule" && "text-green-500"}`}
        >
          {type}
        </Button>
      </DialogTrigger>
      <DialogContent className="shad-dialog sm:max-w-md">
        <DialogHeader className="mb-4 space-y-3">
          <DialogTitle className="capitalize">{type} Reservation</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <AppointmentForm
          userId={userId}
          patientId={patientId}
          type={type}
          appointment={appointment}
          setOpen={setOpen}
          onSuccess={handleFormSuccess}
        />
      </DialogContent>
    </Dialog>
  );
};