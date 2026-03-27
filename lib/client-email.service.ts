"use client";

import emailjs from '@emailjs/browser';

// Initialize EmailJS once
if (typeof window !== 'undefined') {
  emailjs.init(process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || 'zsP1UMPiRDwHjuv1x');
}

interface EmailData {
  to_email: string;
  to_name: string;
  from_name: string;
  reservation_date: string;
  time: string;
  party_size: string;
  location: string;
  welcome_drink: string;
  special_requests: string;
  occasion: string;
  status: string;
  message: string;
  // Enhanced email template fields
  restaurant_name?: string;
  restaurant_tagline?: string;
  booking_id?: string;
  phone?: string;
  email_contact?: string;
  dress_code?: string;
  parking?: string;
  cancellation_policy?: string;
}

export const sendConfirmationEmail = async (emailData: EmailData): Promise<boolean> => {
  try {
    console.log('📧 Sending confirmation email to:', emailData.to_email);
    console.log('📋 Email data:', emailData);

    // Format enhanced email template data
    const templateData = {
      // Basic recipient info
      to_email: emailData.to_email,
      to_name: emailData.to_name,
      from_name: emailData.from_name || 'AM | PM Lounge',
      
      // Reservation details
      reservation_date: emailData.reservation_date,
      time: emailData.time,
      party_size: emailData.party_size,
      location: emailData.location || 'Northern Bypass, Thome - Kiambu Road',
      welcome_drink: emailData.welcome_drink,
      special_requests: emailData.special_requests,
      occasion: emailData.occasion,
      status: emailData.status,
      message: emailData.message,
      
      // Enhanced restaurant information
      restaurant_name: emailData.restaurant_name || 'AM | PM Lounge',
      restaurant_tagline: emailData.restaurant_tagline || 'Premium Restaurant & Bar Experience',
      booking_id: emailData.booking_id || 'BOOK-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      phone: emailData.phone || '+254 757 650 125',
      email_contact: emailData.email_contact || 'reservations@ampmlounge.com',
      dress_code: emailData.dress_code || 'Smart Casual',
      parking: emailData.parking || 'Complimentary Valet Parking Available',
      cancellation_policy: emailData.cancellation_policy || 'Free cancellation up to 2 hours before reservation time',
      
      // Additional useful information
      current_year: new Date().getFullYear(),
      website: 'www.ampmlounge.com',
      social_facebook: 'facebook.com/ampmlounge',
      social_instagram: '@ampmlounge',
      social_twitter: '@ampmlounge'
    };
    
    console.log('📤 Sending template data:', templateData);

    console.log('📧 Using service:', process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || 'service_9q14lw5');
    console.log('📧 Using confirmation template:', process.env.NEXT_PUBLIC_EMAILJS_CONFIRMATION_TEMPLATE_ID || 'template_oxo9v3d');
    
    const result = await emailjs.send(
      process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || 'service_9q14lw5',
      process.env.NEXT_PUBLIC_EMAILJS_CONFIRMATION_TEMPLATE_ID || 'template_oxo9v3d',
      templateData
    );

    if (result.status === 200) {
      console.log('✅ Email sent successfully!');
      console.log('Response:', result);
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        // eslint-disable-next-line no-new
        new Notification('Email Sent! 📧', {
          body: `Confirmation sent to ${emailData.to_email}`,
          icon: '/assets/icons/check.svg',
          badge: '/assets/icons/check.svg',
        });
      }
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
};

export const sendAdminNotificationEmail = async (adminEmailData: any): Promise<boolean> => {
  try {
    console.log('📧 Sending admin notification');

    console.log('📧 Sending admin notification with template:', process.env.NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE_ID || 'template_zxc4lem');
    
    const result = await emailjs.send(
      process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || 'service_9q14lw5',
      process.env.NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE_ID || 'template_zxc4lem',
      {
        ...adminEmailData,
        to_email: 'info@ampm.co.ke', // Admin email
      }
    );

    if (result.status === 200) {
      console.log('✅ Admin notification sent!');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to send admin notification:', error);
    return false;
  }
};

// Request notification permission
export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return Notification.permission === 'granted';
};