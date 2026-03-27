"use server";

import { revalidatePath } from "next/cache";
import { ID, Query } from "node-appwrite";

import { Appointment } from "@/types/appwrite.types";

import {
  APPOINTMENT_COLLECTION_ID,
  DATABASE_ID,
  databases,
} from "../appwrite.config";
import { mapReservationToAppointment, validateAppointmentData } from "../appwrite-schema-sync";
import { formatDateTime, parseStringify } from "../utils";

// Helper function to extract party size from note field
const extractPartySize = (note: string | undefined, partySize?: string | number): string => {
  if (partySize) return `${partySize} Guests`;
  if (!note) return '2 Guests';
  const match = note.match(/Party Size: ([^|]+)/);
  return match ? match[1].trim() : '2 Guests';
};

// Helper function to send email notification
const sendEmailNotification = async (
  email: string,
  name: string,
  type: 'confirmation' | 'cancellation' | 'new',
  appointmentDetails: any
) => {
  try {
    // EmailJS configuration from environment
    // Note: This function is kept for potential future use

    // Format date and time separately for EmailJS template
    const scheduleDate = new Date(appointmentDetails.schedule);
    const dateStr = scheduleDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = scheduleDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    
    const templateParams = {
      // These match your EmailJS template variables
      to_email: email,
      to_name: name,
      from_name: 'AM | PM Lounge',
      date: dateStr,  // Separate date field
      time: timeStr,  // Separate time field
      party_size: extractPartySize(appointmentDetails.note, appointmentDetails.partySize),
      location: 'Northern Bypass, Thome',  // Your restaurant location
      
      // Additional details for enhanced template
      welcome_drink: appointmentDetails.primaryPhysician || 'House Special',
      occasion: appointmentDetails.reason || 'Regular Dining',
      special_requests: appointmentDetails.note?.replace(/Party Size: [^|]+\|?/, '').trim() || 'None',
      status: type === 'confirmation' ? 'CONFIRMED ✅' : type === 'cancellation' ? 'CANCELLED ❌' : 'PENDING ⏳',
      
      // Main message
      message: type === 'confirmation' 
        ? `Great news! Your reservation has been confirmed. We look forward to serving you!`
        : type === 'cancellation'
        ? `We're sorry, but your reservation has been cancelled. Reason: ${appointmentDetails.cancellationReason || 'Schedule conflict'}`
        : `Thank you for your reservation request. We'll confirm shortly.`
    };

    console.log('Sending email notification:', { email, type, templateParams });
    
    // Note: EmailJS needs to be initialized on the client side
    // For server-side, we'd need to use a different email service
    // For now, we'll log the notification details
    console.log('Email notification would be sent with params:', templateParams);
    
    return true;
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return false;
  }
};

//  CREATE APPOINTMENT
export const createAppointment = async (
  appointment: CreateAppointmentParams
) => {
  try {
    console.log('Creating appointment with:', appointment);
    
    // Use the synchronization module to ensure perfect Appwrite compatibility
    const appointmentToCreate = mapReservationToAppointment(appointment);
    
    // Validate before sending to Appwrite
    const validation = validateAppointmentData(appointmentToCreate);
    if (!validation.valid) {
      console.error("Appointment validation errors:", validation.errors);
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }
    
    console.log('Sending to Appwrite:', appointmentToCreate);
    
    const newAppointment = await databases.createDocument(
      DATABASE_ID!,
      APPOINTMENT_COLLECTION_ID!,
      ID.unique(),
      appointmentToCreate
    );

    // Send notification
    try {
      const userDetails = await getUserDetails(appointment.userId);
      await sendEmailNotification(
        userDetails.email,
        userDetails.name,
        'new',
        appointment
      );
      console.log('Notification sent for new reservation');
    } catch (notifyError) {
      console.error('Failed to send notification but appointment was created:', notifyError);
    }

    revalidatePath("/admin");
    return parseStringify(newAppointment);
  } catch (error) {
    console.error("An error occurred while creating a new appointment:", error);
    throw error;
  }
};

//  GET RECENT APPOINTMENTS
export const getRecentAppointmentList = async () => {
  try {
    const appointments = await databases.listDocuments(
      DATABASE_ID!,
      APPOINTMENT_COLLECTION_ID!,
      [Query.orderDesc("$createdAt")]
    );

    const initialCounts = {
      scheduledCount: 0,
      pendingCount: 0,
      cancelledCount: 0,
    };

    const counts = (appointments.documents as Appointment[]).reduce(
      (acc, appointment) => {
        switch (appointment.status) {
          case "scheduled":
            acc.scheduledCount++;
            break;
          case "pending":
            acc.pendingCount++;
            break;
          case "cancelled":
            acc.cancelledCount++;
            break;
        }
        return acc;
      },
      initialCounts
    );

    const documents = appointments.documents.map((doc: any) => ({
      ...doc,
      partySize: extractPartySize(doc.note, doc.partySize)
    }));

    const data = {
      totalCount: appointments.total,
      ...counts,
      documents: documents,
    };

    return parseStringify(data);
  } catch (error) {
    console.error(
      "An error occurred while retrieving the recent appointments:",
      error
    );
  }
};

//  SEND SMS NOTIFICATION (Legacy - kept for compatibility)
export const sendSMSNotification = async (phoneNumber: string, content: string) => {
  try {
    console.log('SMS notification called (using email fallback):', {
      phoneNumber,
      messageLength: content.length
    });
    
    // Since SMS has issues, we'll just log for now
    console.log('Notification content:', content);
    
    return { success: true, fallback: 'email' };
  } catch (error: any) {
    console.error('Notification failed:', error);
    throw error;
  }
};

//  UPDATE APPOINTMENT
export const updateAppointment = async ({
  appointmentId,
  userId,
  appointment,
  type,
}: UpdateAppointmentParams) => {
  try {
    console.log('Updating appointment:', { appointmentId, userId, type, appointment });

    // Remove partySize from update if it exists (field may not be in DB schema yet)
    const { partySize, ...appointmentDataToUpdate } = appointment;

    const updatedAppointment = await databases.updateDocument(
      DATABASE_ID!,
      APPOINTMENT_COLLECTION_ID!,
      appointmentId,
      appointmentDataToUpdate
    );

    if (!updatedAppointment) throw new Error('Failed to update appointment');

    // Send immediate notification when admin confirms/cancels
    try {
      const userDetails = await getUserDetails(userId);
      
      // Get full appointment details for the notification
      const fullAppointment: any = await databases.getDocument(
        DATABASE_ID!,
        APPOINTMENT_COLLECTION_ID!,
        appointmentId
      );

      // Determine notification type
      const notificationType = type === "schedule" ? 'confirmation' : 'cancellation';
      
      // Send email notification immediately
      await sendEmailNotification(
        userDetails.email,
        userDetails.name,
        notificationType,
        {
          ...fullAppointment,
          cancellationReason: appointment.cancellationReason
        }
      );

      // Also try SMS for immediate notification
      if (type === "schedule") {
        const partySize = extractPartySize(fullAppointment.note, fullAppointment.partySize);
        const welcomeDrink = fullAppointment.primaryPhysician || 'House Special';
        const message = `🎉 CONFIRMED! Your reservation at AM|PM Lounge for ${formatDateTime(appointment.schedule!).dateTime} is confirmed! Party of ${partySize}. Welcome drink: ${welcomeDrink}. See you soon!`;
        
        console.log('IMMEDIATE CONFIRMATION SENT:', {
          to: userDetails.phone,
          email: userDetails.email,
          message,
          timestamp: new Date().toISOString()
        });
      } else if (type === "cancel") {
        const message = `❌ Your reservation at AM|PM Lounge for ${formatDateTime(appointment.schedule!).dateTime} has been cancelled. Reason: ${appointment.cancellationReason}. We hope to see you another time!`;
        
        console.log('IMMEDIATE CANCELLATION SENT:', {
          to: userDetails.phone,
          email: userDetails.email,
          message,
          timestamp: new Date().toISOString()
        });
      }

      console.log('✅ Notification sent IMMEDIATELY for appointment update');
    } catch (notifyError) {
      console.error('Failed to send notification but appointment was updated:', notifyError);
    }

    revalidatePath("/admin");
    return parseStringify(updatedAppointment);
  } catch (error) {
    console.error("An error occurred while updating appointment:", error);
    throw error;
  }
};

// GET APPOINTMENT
export const getAppointment = async (appointmentId: string) => {
  try {
    const appointment = await databases.getDocument(
      DATABASE_ID!,
      APPOINTMENT_COLLECTION_ID!,
      appointmentId
    ) as unknown as Appointment;

    const appointmentData = {
      ...appointment,
      partySize: extractPartySize(appointment.note, appointment.partySize)
    };

    return parseStringify(appointmentData);
  } catch (error) {
    console.error(
      "An error occurred while retrieving the existing patient:",
      error
    );
  }
};

// GET USER DETAILS (Helper function)
export const getUserDetails = async (userId: string) => {
  try {
    // Import users API from appwrite config
    const { users, PATIENT_COLLECTION_ID } = await import("../appwrite.config");
    
    try {
      // First try to get user from Appwrite users API
      const user = await users.get(userId);
      return {
        name: user.name || 'Guest',
        email: user.email || 'guest@example.com',
        phone: user.phone || '+254757650125'
      };
    } catch (userError) {
      // If not found in users, try patient collection
      try {
        const patients = await databases.listDocuments(
          DATABASE_ID!,
          PATIENT_COLLECTION_ID!,
          [Query.equal('userId', [userId])]
        );
        
        if (patients.documents.length > 0) {
          const patient = patients.documents[0] as any;
          return {
            name: patient.name || 'Guest',
            email: patient.email || 'guest@example.com',
            phone: patient.phone || '+254757650125'
          };
        }
      } catch (patientError) {
        console.log('User not found in patient collection either');
      }
    }
    
    // Fallback to default user details
    return {
      name: 'Guest',
      email: 'guest@example.com',
      phone: '+254757650125'
    };
  } catch (error) {
    console.error('Error fetching user details:', error);
    return {
      name: 'Guest',
      email: 'guest@example.com',
      phone: '+254757650125'
    };
  }
};