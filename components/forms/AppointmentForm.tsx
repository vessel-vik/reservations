"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dispatch, SetStateAction, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { motion } from "framer-motion";

import { SelectItem } from "@/components/ui/select";
import { Doctors, PartySize, OccasionTypes, TimeSlots } from "@/constants";
import {
  createAppointment,
  updateAppointment,
} from "@/lib/actions/appointment.actions";
import { sendConfirmationEmail } from "@/lib/client-email.service";
import { getAppointmentSchema } from "@/lib/validation";
import { Appointment } from "@/types/appwrite.types";

import "react-datepicker/dist/react-datepicker.css";

import CustomFormField, { FormFieldType } from "../CustomFormField";
import SubmitButton from "../SubmitButton";
import { Form } from "../ui/form";

export const AppointmentForm = ({
  userId,
  patientId,
  type = "create",
  appointment,
  setOpen,
  onSuccess,
}: {
  userId: string;
  patientId: string;
  type: "create" | "schedule" | "cancel";
  appointment?: Appointment;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onSuccess?: () => void;
}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const AppointmentFormValidation = getAppointmentSchema(type);

  const [userEmail, setUserEmail] = useState<string>("guest@example.com");
  const [userName, setUserName] = useState<string>("Valued Guest");

  // Fetch user details
  useState(() => {
    const fetchUserDetails = async () => {
      try {
        if (userId) {
          // We can't use server actions directly in useEffect if they are not exposed,
          // but we can assume the user might be passed or we can use a placeholder
          // Since we can't easily fetch user client-side without a dedicated API route or public action
          // We will use the placeholder, but if we had the patient prop we could use it.
          // However, let's try to see if we can use the `getPatient` action if it's available.
          // It is imported? No.
        }
      } catch (error) {
        console.error("Failed to fetch user details", error);
      }
    };
    fetchUserDetails();
  });

  const form = useForm<z.infer<typeof AppointmentFormValidation>>({
    resolver: zodResolver(AppointmentFormValidation),
    defaultValues: {
      primaryPhysician: appointment ? appointment?.primaryPhysician : "",
      schedule: appointment
        ? new Date(appointment?.schedule!)
        : new Date(Date.now()),
      reason: appointment ? appointment.reason : "",
      note: appointment?.note || "",
      cancellationReason: appointment?.cancellationReason || "",
      partySize: appointment?.partySize
        ? (typeof appointment.partySize === 'string' ? parseInt(appointment.partySize) || 2 : appointment.partySize)
        : 2,
    },
  });

  const onSubmit = async (
    values: z.infer<typeof AppointmentFormValidation>
  ) => {
    setIsLoading(true);

    let status;
    switch (type) {
      case "schedule":
        status = "scheduled";
        break;
      case "cancel":
        status = "cancelled";
        break;
      default:
        status = "pending";
    }

    try {
      if (type === "create" && patientId) {
        const appointment = {
          userId,
          patient: patientId,
          primaryPhysician: values.primaryPhysician,
          schedule: new Date(values.schedule),
          reason: values.reason!,
          status: status as Status,
          note: values.note,
          partySize: values.partySize,
        };

        const newAppointment = await createAppointment(appointment);

        if (newAppointment) {
          // Send confirmation email
          const emailData = {
            to_email: "guest@example.com", // In a real app, this would come from the user's profile
            to_name: "Valued Guest",
            from_name: "AM | PM Lounge",
            reservation_date: new Date(values.schedule).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
            time: new Date(values.schedule).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            party_size: `${values.partySize} Guests`,
            location: 'Northern Bypass, Thome',
            welcome_drink: values.primaryPhysician,
            occasion: values.reason,
            special_requests: values.note,
            status: 'PENDING ⏳',
            message: "Thank you for your reservation request. We'll confirm your table shortly.",

            // Enhanced template data
            restaurant_name: 'AM | PM Lounge',
            booking_id: newAppointment.$id.slice(-8).toUpperCase(),
            phone: '+254 757 650 125',
            email_contact: 'reservations@ampmlounge.com'
          };

          await sendConfirmationEmail(emailData);

          setIsLoading(false); // Stop loading before showing success
          setShowSuccess(true);
          form.reset();
          // Add delay for success animation
          setTimeout(() => {
            router.push(
              `/guests/${userId}/new-appointment/success?appointmentId=${newAppointment.$id}`
            );
          }, 1200); // Slightly longer delay to enjoy the success animation
        }
      } else {
        const appointmentToUpdate = {
          userId,
          appointmentId: appointment?.$id!,
          appointment: {
            primaryPhysician: values.primaryPhysician,
            schedule: new Date(values.schedule),
            status: status as Status,
            cancellationReason: values.cancellationReason,
            partySize: values.partySize,
          },
          type,
        };

        const updatedAppointment = await updateAppointment(appointmentToUpdate);

        if (updatedAppointment) {
          setIsLoading(false); // Stop loading before showing success
          setShowSuccess(true);
          form.reset();
          // Call onSuccess to trigger email sending
          onSuccess?.();
          // Add delay for success animation
          setTimeout(() => {
            setOpen && setOpen(false);
          }, 1200); // Slightly longer delay to enjoy the success animation
        }
      }
    } catch (error) {
      console.log(error);
      setIsLoading(false); // Only set loading false on error
    }
  };

  let buttonLabel;
  switch (type) {
    case "cancel":
      buttonLabel = "Cancel Reservation";
      break;
    case "schedule":
      buttonLabel = "Confirm Reservation";
      break;
    default:
      buttonLabel = "Submit Reservation";
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-6">
        {type === "create" && (
          <section className="mb-12 space-y-4">
            <h1 className="text-2xl font-bold text-white">Make Your Reservation</h1>
            <p className="text-gray-400">
              Book your table and enjoy a complimentary welcome drink 🥂
            </p>
          </section>
        )}

        {type !== "cancel" && (
          <>
            {/* Party Size and Date/Time Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CustomFormField
                fieldType={FormFieldType.GUEST_COUNTER}
                control={form.control}
                name="partySize"
                label="Number of Guests 👥"
                placeholder="Select party size"
              />

              <CustomFormField
                fieldType={FormFieldType.DATETIME_PICKER}
                control={form.control}
                name="schedule"
                label="Date & Time 📅"
                placeholder="Select your reservation date and time"
              />
            </div>

            {/* Welcome Drink Selection */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300">Complimentary Welcome Drink 🍹</h3>
              <CustomFormField
                fieldType={FormFieldType.SELECT}
                control={form.control}
                name="primaryPhysician"
                label=""
                placeholder="Choose your welcome drink"
              >
                {Doctors.map((drink, i) => (
                  <SelectItem key={drink.name + i} value={drink.name}>
                    <div className="flex cursor-pointer items-center gap-3">
                      <div>
                        <p className="font-medium">{drink.name}</p>
                        <p className="text-xs text-gray-500">{drink.description}</p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </CustomFormField>
            </div>

            {/* Occasion Selection */}
            <CustomFormField
              fieldType={FormFieldType.SELECT}
              control={form.control}
              name="reason"
              label="Occasion 🎉"
              placeholder="What are you celebrating?"
            >
              {OccasionTypes.map((occasion, i) => (
                <SelectItem key={occasion + i} value={occasion}>
                  <div className="flex cursor-pointer items-center gap-2">
                    <p>{occasion}</p>
                  </div>
                </SelectItem>
              ))}
            </CustomFormField>

            {/* Special Requests */}
            <CustomFormField
              fieldType={FormFieldType.TEXTAREA}
              control={form.control}
              name="note"
              label="Special Requests 📝"
              placeholder="Any dietary restrictions, seating preferences, or special arrangements? Let us know!"
              disabled={type === "schedule"}
            />

            {/* Additional Information Card */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-400 text-sm font-medium mb-2">ℹ️ Good to Know</p>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• Tables are held for 15 minutes past reservation time</li>
                <li>• Free valet parking available</li>
                <li>• Smart casual dress code</li>
                <li>• Live music on Friday & Saturday nights</li>
              </ul>
            </div>
          </>
        )}

        {type === "cancel" && (
          <CustomFormField
            fieldType={FormFieldType.TEXTAREA}
            control={form.control}
            name="cancellationReason"
            label="Reason for cancellation"
            placeholder="Please let us know why you need to cancel"
          />
        )}

        <SubmitButton
          isLoading={isLoading}
          showSuccess={showSuccess}
          loadingText={
            type === "cancel"
              ? "Cancelling reservation..."
              : type === "schedule"
                ? "Confirming reservation..."
                : "Submitting reservation..."
          }
          successText={
            type === "cancel"
              ? "Reservation cancelled!"
              : type === "schedule"
                ? "Reservation confirmed! 🎉"
                : "Reservation submitted! ✨"
          }
          className={`${type === "cancel"
            ? "shad-danger-btn"
            : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300"
            } w-full font-semibold py-3`}
        >
          <motion.span
            className="flex items-center justify-center gap-2"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            {buttonLabel}
            {type !== "cancel" && (
              <motion.span
                animate={{
                  rotate: [0, 15, -15, 0],
                  scale: [1, 1.2, 1.2, 1]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3
                }}
              >
                🥂
              </motion.span>
            )}
          </motion.span>
        </SubmitButton>
      </form>
    </Form>
  );
};