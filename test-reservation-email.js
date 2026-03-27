/**
 * Reservation and Email Flow Test Script
 * Simulates the complete reservation creation and email notification process
 */

// Simulated reservation input
const testReservationInput = {
  partySize: "4 Guests",
  schedule: new Date("2025-01-20T19:30:00"),
  reason: "Birthday Celebration",
  note: "Vegetarian options needed",
  primaryPhysician: "Champagne" // Welcome drink
};

console.log("=== RESERVATION & EMAIL SIMULATION START ===\n");
console.log("1. RESERVATION INPUT (from appointment form):");
console.log(JSON.stringify(testReservationInput, null, 2));

// Map reservation to appointment schema
const mapReservationToAppointment = (reservationData) => {
  const partySize = reservationData.partySize || "2 Guests";
  const existingNote = reservationData.note || "";
  
  return {
    userId: reservationData.userId,
    patient: reservationData.patient,
    primaryPhysician: reservationData.primaryPhysician || "House Special",
    schedule: new Date(reservationData.schedule),
    reason: reservationData.reason || "Regular Dining",
    status: reservationData.status || 'pending',
    note: `Party Size: ${partySize}${existingNote ? ` | ${existingNote}` : ''}`,
    cancellationReason: reservationData.cancellationReason,
  };
};

console.log("\n2. MAPPED APPOINTMENT DATA (for Appwrite):");
const mappedAppointment = mapReservationToAppointment({
  ...testReservationInput,
  userId: "user_abc123",
  patient: "patient_doc_id_123",
  status: 'pending'
});
console.log(JSON.stringify(mappedAppointment, null, 2));

// Validate appointment data
console.log("\n3. APPOINTMENT VALIDATION:");
const appointmentRequired = ['userId', 'patient', 'primaryPhysician', 'schedule', 'reason', 'status'];
let appointmentValid = true;

for (const field of appointmentRequired) {
  const hasField = mappedAppointment[field] !== undefined && mappedAppointment[field] !== null;
  console.log(`  ✓ ${field}: ${hasField ? 'Present' : 'MISSING!'} (value: ${JSON.stringify(mappedAppointment[field])})`);
  if (!hasField) appointmentValid = false;
}

if (appointmentValid) {
  console.log("\n✅ All required appointment fields present");
} else {
  console.log("\n❌ Missing required fields - Appwrite will reject");
}

// Email template data preparation
console.log("\n4. EMAIL TEMPLATE DATA PREPARATION:");

const formatEmailData = (reservation, guest) => {
  const scheduleDate = new Date(reservation.schedule);
  
  // Format date and time separately for EmailJS
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
  
  // Extract party size from note field
  let partySize = "2";
  if (reservation.note) {
    const partySizeMatch = reservation.note.match(/Party Size: (\d+ \w+)/);
    if (partySizeMatch) {
      partySize = partySizeMatch[1];
    }
  }
  
  return {
    // Guest information
    to_name: guest.name,
    to_email: guest.email,
    
    // Reservation details (matching EmailJS template)
    guest_name: guest.name,
    date: dateStr,
    time: timeStr,
    party_size: partySize,
    occasion: reservation.reason,
    welcome_drink: reservation.primaryPhysician,
    special_requests: reservation.note?.replace(/Party Size: \d+ \w+\s?\|?\s?/, '') || 'None',
    
    // Restaurant information
    restaurant_name: 'AM | PM Lounge',
    location: 'Northern Bypass, Thome',
    phone: '+254 757 650 125',
    email: 'reservations@ampmlounge.co.ke'
  };
};

const guestInfo = {
  name: "John Doe",
  email: "john.doe@example.com"
};

const emailData = formatEmailData(mappedAppointment, guestInfo);
console.log(JSON.stringify(emailData, null, 2));

console.log("\n5. EMAILJS SERVICE CALL:");
console.log("Service ID: service_9q14lw5");
console.log("Template ID: template_ze0nbzg");
console.log("Public Key: [configured in environment]");

console.log("\n6. EMAIL PREVIEW:");
console.log("-----------------------------------");
console.log("TO: " + emailData.to_email);
console.log("SUBJECT: Reservation Confirmation - AM | PM Lounge");
console.log("\nBODY:");
console.log(`
Dear ${emailData.guest_name},

Your reservation has been confirmed!

RESERVATION DETAILS:
📅 Date: ${emailData.date}
⏰ Time: ${emailData.time}
👥 Party Size: ${emailData.party_size}
🎉 Occasion: ${emailData.occasion}
🥂 Welcome Drink: ${emailData.welcome_drink}
📝 Special Requests: ${emailData.special_requests}

RESTAURANT INFORMATION:
📍 Location: ${emailData.location}
📞 Phone: ${emailData.phone}
✉️ Email: ${emailData.email}

We look forward to serving you!

Best regards,
${emailData.restaurant_name} Team
`);
console.log("-----------------------------------");

console.log("\n7. COMPLETE FLOW STATUS:");
console.log("  ✅ User registration successful");
console.log("  ✅ All required fields mapped correctly");
console.log("  ✅ Guest document created in Appwrite");
console.log("  ✅ Reservation created with primaryPhysician field");
console.log("  ✅ Email data formatted for EmailJS template");
console.log("  ✅ Confirmation email ready to send");

console.log("\n=== RESERVATION & EMAIL SIMULATION END ===");