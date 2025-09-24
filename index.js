// MAS Astronomy Daily Bot + Member Verification System
// Posts daily astronomy content to Discord + handles member verification

import fetch from 'node-fetch';
import cron from 'node-cron';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from 'discord.js';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const NASA_API_KEY = process.env.NASA_API_KEY;

// Discord Bot Configuration (for verification system)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Your Discord server ID
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID; // "MAS Member" role ID
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : []; // Admin Discord user IDs

// Firebase Configuration (for member verification)
const FIREBASE_CONFIG = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null;

// Manipur coordinates (Imphal)
const MANIPUR_LAT = 24.8170;
const MANIPUR_LON = 93.9368;

// Get current ISS position
async function getISSPosition() {
  try {
    const response = await fetch('http://api.open-notify.org/iss-now.json');
    const data = await response.json();

    if (data.message === 'success') {
      const lat = parseFloat(data.iss_position.latitude);
      const lon = parseFloat(data.iss_position.longitude);

      // Calculate distance from Manipur
      const distance = calculateDistance(MANIPUR_LAT, MANIPUR_LON, lat, lon);

      return {
        latitude: lat,
        longitude: lon,
        distance: Math.round(distance),
        timestamp: new Date(data.timestamp * 1000)
      };
    }
  } catch (error) {
    console.error('Error fetching ISS position:', error);
    return null;
  }
}

// Get next ISS pass over Manipur
async function getNextISSPass() {
  try {
    const response = await fetch(`http://api.open-notify.org/iss-pass.json?lat=${MANIPUR_LAT}&lon=${MANIPUR_LON}&n=1`);
    const data = await response.json();

    if (data.message === 'success' && data.response.length > 0) {
      const pass = data.response[0];
      const passTime = new Date(pass.risetime * 1000);
      const duration = Math.round(pass.duration / 60); // Convert to minutes

      return {
        passTime,
        duration,
        formattedTime: passTime.toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      };
    }
  } catch (error) {
    console.error('Error fetching ISS pass:', error);
    return null;
  }
}

// Get NASA Astronomy Picture of the Day
async function getNASAAPOD() {
  try {
    const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`);
    const data = await response.json();

    if (data.title) {
      return {
        title: data.title,
        explanation: data.explanation,
        url: data.url,
        hdurl: data.hdurl,
        mediaType: data.media_type,
        date: data.date,
        copyright: data.copyright
      };
    }
  } catch (error) {
    console.error('Error fetching NASA APOD:', error);
    return null;
  }
}

// Get current moon phase
async function getMoonPhase() {
  try {
    // Using a simple calculation for moon phase
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Simple moon phase calculation (approximation)
    const totalDays = Math.floor((year - 2000) * 365.25) +
                     Math.floor((month - 1) * 30.44) + day;
    const moonCycle = 29.53; // Average lunar cycle in days
    const phase = (totalDays % moonCycle) / moonCycle;

    let phaseName = '';
    let phaseEmoji = '';

    if (phase < 0.0625 || phase >= 0.9375) {
      phaseName = 'New Moon';
      phaseEmoji = '🌑';
    } else if (phase < 0.1875) {
      phaseName = 'Waxing Crescent';
      phaseEmoji = '🌒';
    } else if (phase < 0.3125) {
      phaseName = 'First Quarter';
      phaseEmoji = '🌓';
    } else if (phase < 0.4375) {
      phaseName = 'Waxing Gibbous';
      phaseEmoji = '🌔';
    } else if (phase < 0.5625) {
      phaseName = 'Full Moon';
      phaseEmoji = '🌕';
    } else if (phase < 0.6875) {
      phaseName = 'Waning Gibbous';
      phaseEmoji = '🌖';
    } else if (phase < 0.8125) {
      phaseName = 'Last Quarter';
      phaseEmoji = '🌗';
    } else {
      phaseName = 'Waning Crescent';
      phaseEmoji = '🌘';
    }

    return { phaseName, phaseEmoji };
  } catch (error) {
    console.error('Error calculating moon phase:', error);
    return { phaseName: 'Unknown', phaseEmoji: '🌙' };
  }
}

// Get astronauts currently in space
async function getAstronautsInSpace() {
  try {
    const response = await fetch('http://api.open-notify.org/astros.json');
    const data = await response.json();

    if (data.message === 'success') {
      return {
        number: data.number,
        people: data.people
      };
    }
  } catch (error) {
    console.error('Error fetching astronauts:', error);
    return null;
  }
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Send daily astronomy content to Discord
async function sendDailyContent() {
  console.log('🚀 Fetching daily astronomy content...');

  try {
    // Fetch all data in parallel
    const [apod, issPosition, issPass, moonPhase, astronauts] = await Promise.all([
      getNASAAPOD(),
      getISSPosition(),
      getNextISSPass(),
      getMoonPhase(),
      getAstronautsInSpace()
    ]);

    // Create Discord embed
    const embed = {
      title: "🌌 Daily Astronomy Update",
      description: "Your daily dose of cosmic wonders!",
      color: 3447003, // Blue color
      fields: [],
      footer: {
        text: "Manipur Astronomical Society • Data from NASA & Open Notify APIs"
      },
      timestamp: new Date().toISOString()
    };

    // Add NASA APOD
    if (apod) {
      embed.fields.push({
        name: "🖼️ NASA Astronomy Picture of the Day",
        value: `**${apod.title}**\n${apod.explanation.length > 200 ? apod.explanation.substring(0, 200) + "..." : apod.explanation}`,
        inline: false
      });

      if (apod.mediaType === 'image') {
        embed.image = { url: apod.hdurl || apod.url };
      }

      if (apod.copyright) {
        embed.fields.push({
          name: "📸 Credit",
          value: apod.copyright,
          inline: true
        });
      }
    }

    // Add ISS Information
    if (issPosition) {
      embed.fields.push({
        name: "🛰️ International Space Station",
        value: `**Current Location:** ${issPosition.latitude.toFixed(2)}°, ${issPosition.longitude.toFixed(2)}°\n**Distance from Manipur:** ${issPosition.distance.toLocaleString()} km`,
        inline: true
      });
    }

    if (issPass) {
      embed.fields.push({
        name: "👀 Next ISS Pass Over Manipur",
        value: `**When:** ${issPass.formattedTime}\n**Duration:** ${issPass.duration} minutes\n🔭 *Look up and wave!*`,
        inline: true
      });
    }

    // Add Moon Phase
    embed.fields.push({
      name: `${moonPhase.phaseEmoji} Moon Phase`,
      value: `**Current:** ${moonPhase.phaseName}`,
      inline: true
    });

    // Add Astronauts in Space
    if (astronauts) {
      const astronautNames = astronauts.people
        .map(person => `• ${person.name} (${person.craft})`)
        .join('\n');

      embed.fields.push({
        name: "👨‍🚀 People Currently in Space",
        value: `**Total:** ${astronauts.number}\n${astronautNames}`,
        inline: false
      });
    }

    // Add viewing tip
    const currentHour = new Date().getHours();
    let viewingTip = '';
    if (currentHour >= 18 || currentHour <= 6) {
      viewingTip = "🌃 **Perfect time for stargazing!** Clear skies tonight in Manipur.";
    } else {
      viewingTip = "☀️ **Daytime astronomy:** Try observing the Moon if visible, or plan tonight's viewing session.";
    }

    embed.fields.push({
      name: "🔭 Today's Viewing Tip",
      value: viewingTip,
      inline: false
    });

    // Send to Discord
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "🌟 **Good morning, space enthusiasts!** Here's your daily astronomy update:",
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log('✅ Daily astronomy content sent successfully!');
    } else {
      console.error('❌ Failed to send daily content:', response.statusText);
    }

  } catch (error) {
    console.error('❌ Error sending daily content:', error);
  }
}

// Health check endpoint for Railway
async function healthCheck() {
  console.log('✅ Bot is healthy and running!');
}

// Schedule daily posts at 8:00 AM IST
cron.schedule('0 8 * * *', sendDailyContent, {
  timezone: "Asia/Kolkata"
});

// Also run immediately on startup for testing
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Running in development mode - sending test content...');
  setTimeout(sendDailyContent, 5000); // Wait 5 seconds then send
}

// Keep the process alive and log status every hour
cron.schedule('0 * * * *', healthCheck, {
  timezone: "Asia/Kolkata"
});

// Initialize Discord Bot (for verification system)
let discordClient = null;
let firebaseDb = null;

if (DISCORD_TOKEN && CLIENT_ID && GUILD_ID && MEMBER_ROLE_ID) {
  // Initialize Firebase Admin (if config provided)
  if (FIREBASE_CONFIG) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(FIREBASE_CONFIG),
      });
      firebaseDb = admin.firestore();
      console.log('🔥 Firebase Admin initialized for member verification');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error.message);
    }
  }

  // Initialize Discord client
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  // Discord bot event handlers
  discordClient.once('ready', () => {
    console.log(`✅ Discord bot logged in as ${discordClient.user.tag}`);
    console.log('🔐 Member verification system active');
  });

  // Handle slash commands
  discordClient.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
      await handleVerificationCommand(interaction);
    } else if (interaction.commandName === 'status') {
      await handleStatusCommand(interaction);
    } else if (interaction.commandName === 'events') {
      await handleEventsCommand(interaction);
    } else if (interaction.commandName === 'register') {
      await handleRegisterCommand(interaction);
    } else if (interaction.commandName === 'my-events') {
      await handleMyEventsCommand(interaction);
    } else if (interaction.commandName === 'event-details') {
      await handleEventDetailsCommand(interaction);
    } else if (interaction.commandName === 'announce') {
      await handleAnnounceCommand(interaction);
    } else if (interaction.commandName === 'clean-chat') {
      await handleCleanChatCommand(interaction);
    } else if (interaction.commandName === 'member-info') {
      await handleMemberInfoCommand(interaction);
    } else if (interaction.commandName === 'poll') {
      await handlePollCommand(interaction);
    } else if (interaction.commandName === 'add-admin') {
      await handleAddAdminCommand(interaction);
    } else if (interaction.commandName === 'remove-admin') {
      await handleRemoveAdminCommand(interaction);
    } else if (interaction.commandName === 'list-admins') {
      await handleListAdminsCommand(interaction);
    } else if (interaction.commandName === 'add-web-admin') {
      await handleAddWebAdminCommand(interaction);
    } else if (interaction.commandName === 'remove-web-admin') {
      await handleRemoveWebAdminCommand(interaction);
    } else if (interaction.commandName === 'list-web-admins') {
      await handleListWebAdminsCommand(interaction);
    } else if (interaction.commandName === 'update-web-admin') {
      await handleUpdateWebAdminCommand(interaction);
    }
  });

  // Login Discord bot
  discordClient.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Discord bot login failed:', error.message);
  });
} else {
  console.log('⚠️  Discord bot credentials not provided - running in webhook-only mode');
}

// Member Verification Command Handlers
async function handleVerificationCommand(interaction) {
  const email = interaction.options.getString('email');

  try {
    // Defer reply since database lookup might take time
    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Verification system is currently unavailable. Please contact an admin.',
      });
      return;
    }

    // Search for member in Firebase
    const memberSnapshot = await firebaseDb.collection('membershipApplications')
      .where('email', '==', email.toLowerCase())
      .where('status', '==', 'approved')
      .get();

    if (memberSnapshot.empty) {
      await interaction.editReply({
        content: `❌ **Verification Failed**\n\nNo approved membership found for email: \`${email}\`\n\n**Next Steps:**\n• Check if you used the correct email address\n• Make sure your membership application has been approved\n• Apply for membership at: https://manipurastronomy.org/join\n• Contact admins if you believe this is an error`,
      });
      return;
    }

    const memberData = memberSnapshot.docs[0].data();
    const member = interaction.member;

    // Check if user already has the member role
    if (member.roles.cache.has(MEMBER_ROLE_ID)) {
      await interaction.editReply({
        content: `✅ You are already verified as a MAS member!\n\n**Member Info:**\n• Name: ${memberData.fullName}\n• Status: Approved Member\n• Join Date: ${memberData.applicationDate || 'N/A'}`,
      });
      return;
    }

    // Assign member role
    await member.roles.add(MEMBER_ROLE_ID);

    // Update member record with Discord info (optional)
    await firebaseDb.collection('membershipApplications').doc(memberSnapshot.docs[0].id).update({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      discordVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await interaction.editReply({
      content: `🎉 **Verification Successful!**\n\n**Welcome to the MAS Member community, ${memberData.fullName}!**\n\nYou now have access to:\n• 🔒 Member-only channels\n• 🎯 Priority event registration\n• 🔭 Equipment sharing access\n• 📚 Advanced astronomy discussions\n\n**Explore your new channels and connect with fellow astronomers!** ✨`,
    });

    // Log successful verification
    console.log(`✅ Member verified: ${memberData.fullName} (${email}) - Discord: ${interaction.user.username}`);

  } catch (error) {
    console.error('❌ Verification error:', error);
    await interaction.editReply({
      content: '❌ An error occurred during verification. Please try again later or contact an admin.',
    });
  }
}

async function handleStatusCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const isMember = member.roles.cache.has(MEMBER_ROLE_ID);

    let statusMessage = `**Your MAS Discord Status:**\n\n`;
    statusMessage += `👤 **Username:** ${interaction.user.username}\n`;
    statusMessage += `🏷️ **Status:** ${isMember ? '✅ Verified MAS Member' : '🔄 Guest (Not Verified)'}\n`;
    statusMessage += `📅 **Joined Discord:** ${member.joinedAt.toLocaleDateString()}\n\n`;

    if (!isMember) {
      statusMessage += `**To become a verified member:**\n`;
      statusMessage += `1. Apply at: https://manipurastronomy.org/join\n`;
      statusMessage += `2. Wait for admin approval\n`;
      statusMessage += `3. Use \`/verify your-email@example.com\`\n\n`;
      statusMessage += `**Benefits of membership:**\n`;
      statusMessage += `• Access to member-only channels\n`;
      statusMessage += `• Priority event registration\n`;
      statusMessage += `• Equipment sharing privileges\n`;
      statusMessage += `• Advanced astronomy resources`;
    } else {
      statusMessage += `**Your member benefits:**\n`;
      statusMessage += `• 🔒 Access to all member channels\n`;
      statusMessage += `• 🎯 Priority event registration\n`;
      statusMessage += `• 🔭 Equipment sharing access\n`;
      statusMessage += `• 📚 Advanced discussions\n\n`;
      statusMessage += `Thank you for being a valued MAS member! 🌟`;
    }

    await interaction.editReply({ content: statusMessage });

  } catch (error) {
    console.error('❌ Status command error:', error);
    await interaction.editReply({
      content: '❌ Unable to retrieve status. Please try again later.',
    });
  }
}

// Event Management Command Handlers
async function handleEventsCommand(interaction) {
  try {
    await interaction.deferReply();

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Get upcoming events from Firebase
    const eventsSnapshot = await firebaseDb.collection('events')
      .where('status', '==', 'upcoming')
      .orderBy('date', 'asc')
      .limit(10)
      .get();

    if (eventsSnapshot.empty) {
      await interaction.editReply({
        content: '📅 **No Upcoming Events**\n\nNo upcoming events scheduled at the moment. Check back soon for new astronomy activities!',
      });
      return;
    }

    let eventsMessage = '🌟 **Upcoming MAS Events**\n\n';

    eventsSnapshot.forEach(doc => {
      const event = doc.data();
      const eventDate = new Date(event.date);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      eventsMessage += `**${event.title}**\n`;
      eventsMessage += `📅 ${formattedDate} at ${event.time || 'Time TBA'}\n`;
      eventsMessage += `📍 ${event.location || 'Location TBA'}\n`;
      eventsMessage += `🏷️ **Slug:** \`${event.slug}\`\n`;

      if (event.maxParticipants) {
        eventsMessage += `👥 Capacity: ${event.maxParticipants} participants\n`;
      }

      if (event.description) {
        const shortDesc = event.description.length > 100
          ? event.description.substring(0, 100) + "..."
          : event.description;
        eventsMessage += `📝 ${shortDesc}\n`;
      }

      eventsMessage += `\n`;
    });

    eventsMessage += `\n**To register:** Use \`/register event-slug\`\n`;
    eventsMessage += `**For details:** Use \`/event-details event-slug\``;

    await interaction.editReply({ content: eventsMessage });

  } catch (error) {
    console.error('❌ Events command error:', error);
    await interaction.editReply({
      content: '❌ Unable to fetch events. Please try again later.',
    });
  }
}

async function handleRegisterCommand(interaction) {
  try {
    const eventSlug = interaction.options.getString('event-slug');
    const fullName = interaction.options.getString('name');
    const email = interaction.options.getString('email').toLowerCase();
    const phone = interaction.options.getString('phone');
    const status = interaction.options.getString('status');
    const education = interaction.options.getString('education');
    const message = interaction.options.getString('message') || '';

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Check if event exists and is available for registration
    const eventSnapshot = await firebaseDb.collection('events')
      .where('slug', '==', eventSlug)
      .get();

    if (eventSnapshot.empty) {
      await interaction.editReply({
        content: `❌ **Event Not Found**\n\nNo event found with slug: \`${eventSlug}\`\n\nUse \`/events\` to see available events.`,
      });
      return;
    }

    const eventDoc = eventSnapshot.docs[0];
    const eventData = eventDoc.data();

    // Check event status
    if (eventData.status !== 'upcoming') {
      const statusMessage = eventData.status === 'cancelled' ? 'cancelled' :
                          eventData.status === 'completed' ? 'completed' :
                          'not available for registration';

      await interaction.editReply({
        content: `❌ **Registration Closed**\n\n**${eventData.title}** is ${statusMessage}.\n\nUse \`/events\` to see available events.`,
      });
      return;
    }

    // Check if event date has passed
    const eventDate = new Date(eventData.date);
    const now = new Date();
    if (eventDate < now) {
      await interaction.editReply({
        content: `❌ **Registration Closed**\n\n**${eventData.title}** has already occurred.\n\nUse \`/events\` to see upcoming events.`,
      });
      return;
    }

    // Check for duplicate registration
    const existingRegistration = await firebaseDb.collection('eventRegistrations')
      .where('eventSlug', '==', eventSlug)
      .where('email', '==', email)
      .get();

    if (!existingRegistration.empty) {
      await interaction.editReply({
        content: `❌ **Already Registered**\n\nYou're already registered for **${eventData.title}**.\n\nUse \`/my-events ${email}\` to see your registrations.`,
      });
      return;
    }

    // Check capacity if specified
    if (eventData.maxParticipants) {
      const registrationCount = await firebaseDb.collection('eventRegistrations')
        .where('eventSlug', '==', eventSlug)
        .get();

      if (registrationCount.size >= eventData.maxParticipants) {
        await interaction.editReply({
          content: `❌ **Event Full**\n\n**${eventData.title}** has reached maximum capacity (${eventData.maxParticipants} participants).\n\nUse \`/events\` to see other available events.`,
        });
        return;
      }
    }

    // Create registration
    const registrationData = {
      eventSlug: eventSlug,
      eventTitle: eventData.title,
      eventDate: eventData.date,
      eventTime: eventData.time,
      fullName: fullName,
      email: email,
      phone: phone,
      status: status,
      education: education,
      message: message,
      registrationDate: admin.firestore.FieldValue.serverTimestamp(),
      registrationId: `REG${Date.now()}`
    };

    await firebaseDb.collection('eventRegistrations').add(registrationData);

    // Send success message
    const eventDateFormatted = eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    await interaction.editReply({
      content: `🎉 **Registration Successful!**\n\n**Event:** ${eventData.title}\n**Date:** ${eventDateFormatted} at ${eventData.time}\n**Location:** ${eventData.location}\n\n**Your Details:**\n• Name: ${fullName}\n• Email: ${email}\n• Status: ${status}\n\nWe'll send you event updates and reminders. See you there! ✨`,
    });

    // Log successful registration
    console.log(`✅ Event registration: ${fullName} (${email}) registered for ${eventData.title}`);

  } catch (error) {
    console.error('❌ Registration error:', error);
    await interaction.editReply({
      content: '❌ Registration failed. Please try again later or contact an admin.',
    });
  }
}

async function handleMyEventsCommand(interaction) {
  try {
    const email = interaction.options.getString('email').toLowerCase();

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Get user's registrations
    const registrationsSnapshot = await firebaseDb.collection('eventRegistrations')
      .where('email', '==', email)
      .orderBy('eventDate', 'desc')
      .get();

    if (registrationsSnapshot.empty) {
      await interaction.editReply({
        content: `📅 **No Event Registrations**\n\nNo event registrations found for: \`${email}\`\n\nUse \`/events\` to see upcoming events you can register for!`,
      });
      return;
    }

    let eventsMessage = `📋 **Your Event Registrations**\n\n`;

    registrationsSnapshot.forEach(doc => {
      const registration = doc.data();
      const eventDate = new Date(registration.eventDate);
      const now = new Date();
      const isPast = eventDate < now;

      const formattedDate = eventDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const statusEmoji = isPast ? '✅' : '📅';
      const statusText = isPast ? 'Completed' : 'Upcoming';

      eventsMessage += `${statusEmoji} **${registration.eventTitle}**\n`;
      eventsMessage += `   ${formattedDate} at ${registration.eventTime || 'Time TBA'} • ${statusText}\n`;
      eventsMessage += `   Registration ID: \`${registration.registrationId}\`\n\n`;
    });

    eventsMessage += `\n**Total registrations:** ${registrationsSnapshot.size}`;

    await interaction.editReply({ content: eventsMessage });

  } catch (error) {
    console.error('❌ My events command error:', error);
    await interaction.editReply({
      content: '❌ Unable to fetch your registrations. Please try again later.',
    });
  }
}

async function handleEventDetailsCommand(interaction) {
  try {
    const eventSlug = interaction.options.getString('event-slug');

    await interaction.deferReply();

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Get event details
    const eventSnapshot = await firebaseDb.collection('events')
      .where('slug', '==', eventSlug)
      .get();

    if (eventSnapshot.empty) {
      await interaction.editReply({
        content: `❌ **Event Not Found**\n\nNo event found with slug: \`${eventSlug}\`\n\nUse \`/events\` to see available events.`,
      });
      return;
    }

    const eventData = eventSnapshot.docs[0].data();
    const eventDate = new Date(eventData.date);
    const formattedDate = eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Get registration count
    const registrationsSnapshot = await firebaseDb.collection('eventRegistrations')
      .where('eventSlug', '==', eventSlug)
      .get();

    const registrationCount = registrationsSnapshot.size;

    let detailsMessage = `🌟 **${eventData.title}**\n\n`;

    detailsMessage += `📅 **Date:** ${formattedDate}\n`;
    detailsMessage += `⏰ **Time:** ${eventData.time || 'Time TBA'}\n`;
    detailsMessage += `📍 **Location:** ${eventData.location || 'Location TBA'}\n`;
    detailsMessage += `📊 **Status:** ${eventData.status || 'Unknown'}\n`;

    if (eventData.maxParticipants) {
      detailsMessage += `👥 **Capacity:** ${registrationCount}/${eventData.maxParticipants} registered\n`;
    } else {
      detailsMessage += `👥 **Registered:** ${registrationCount} participants\n`;
    }

    detailsMessage += `🏷️ **Slug:** \`${eventData.slug}\`\n\n`;

    if (eventData.description) {
      detailsMessage += `📝 **Description:**\n${eventData.description}\n\n`;
    }

    if (eventData.highlights && eventData.highlights.length > 0) {
      detailsMessage += `✨ **Highlights:**\n`;
      eventData.highlights.forEach(highlight => {
        detailsMessage += `• ${highlight}\n`;
      });
      detailsMessage += `\n`;
    }

    if (eventData.status === 'upcoming') {
      detailsMessage += `**To register:** \`/register ${eventData.slug}\``;
    } else if (eventData.status === 'cancelled') {
      detailsMessage += `❌ **This event has been cancelled.**`;
    } else if (eventData.status === 'completed') {
      detailsMessage += `✅ **This event has been completed.**`;
    }

    await interaction.editReply({ content: detailsMessage });

  } catch (error) {
    console.error('❌ Event details command error:', error);
    await interaction.editReply({
      content: '❌ Unable to fetch event details. Please try again later.',
    });
  }
}

// Admin Command Handlers
async function handleAnnounceCommand(interaction) {
  try {
    // Check admin permissions
    if (!(await isAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to administrators only.',
        ephemeral: true
      });
      return;
    }

    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const type = interaction.options.getString('type') || 'general';

    await interaction.deferReply({ ephemeral: true });

    // Create formatted announcement based on type
    let announcementEmbed = {
      title: `📢 ${title}`,
      description: message,
      color: getAnnouncementColor(type),
      timestamp: new Date().toISOString(),
      footer: {
        text: `MAS Announcement • ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        icon_url: interaction.client.user.displayAvatarURL()
      }
    };

    // Add type-specific formatting
    if (type === 'emergency') {
      announcementEmbed.title = `🚨 URGENT: ${title}`;
    } else if (type === 'important') {
      announcementEmbed.title = `⚠️ IMPORTANT: ${title}`;
    } else if (type === 'event') {
      announcementEmbed.title = `🎯 EVENT: ${title}`;
    }

    // Check bot permissions in target channel
    const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
    const channelPermissions = channel.permissionsFor(botMember);

    if (!channelPermissions || !channelPermissions.has(['SendMessages', 'EmbedLinks'])) {
      await interaction.editReply({
        content: `❌ **Missing Permissions**\n\nI don't have the required permissions in ${channel}.\n\n**Required permissions:**\n• Send Messages\n• Embed Links\n\nPlease check the bot's role permissions for that channel.`
      });
      return;
    }

    await channel.send({ embeds: [announcementEmbed] });

    await interaction.editReply({
      content: `✅ Announcement posted successfully in ${channel}!`
    });

    console.log(`📢 Announcement posted by ${interaction.user.username}: "${title}" in #${channel.name}`);

  } catch (error) {
    console.error('❌ Announce command error:', error);
    await interaction.editReply({
      content: '❌ Failed to post announcement. Please try again.',
    });
  }
}

async function handleCleanChatCommand(interaction) {
  try {
    // Check admin permissions
    if (!(await isAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to administrators only.',
        ephemeral: true
      });
      return;
    }

    const count = interaction.options.getInteger('count');
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    // Fetch messages
    const messages = await interaction.channel.messages.fetch({ limit: count + 1 });

    let messagesToDelete = Array.from(messages.values()).slice(1); // Exclude the command message

    // Filter by user if specified
    if (targetUser) {
      messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
    }

    if (messagesToDelete.length === 0) {
      await interaction.editReply({
        content: '❌ No messages found to delete.'
      });
      return;
    }

    // Delete messages (Discord API limitation: can only bulk delete messages less than 2 weeks old)
    const now = Date.now();
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);

    const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
    const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

    let deletedCount = 0;

    // Bulk delete recent messages
    if (recentMessages.length > 0) {
      if (recentMessages.length === 1) {
        await recentMessages[0].delete();
        deletedCount += 1;
      } else {
        const deleted = await interaction.channel.bulkDelete(recentMessages, true);
        deletedCount += deleted.size;
      }
    }

    // Individual delete for old messages
    for (const msg of oldMessages) {
      try {
        await msg.delete();
        deletedCount += 1;
      } catch (err) {
        console.log(`Could not delete message ${msg.id}: ${err.message}`);
      }
    }

    const userFilter = targetUser ? ` from ${targetUser.username}` : '';
    await interaction.editReply({
      content: `✅ Successfully deleted ${deletedCount} message(s)${userFilter} from #${interaction.channel.name}`
    });

    console.log(`🧹 ${interaction.user.username} deleted ${deletedCount} messages in #${interaction.channel.name}${userFilter}`);

  } catch (error) {
    console.error('❌ Clean chat command error:', error);
    await interaction.editReply({
      content: '❌ Failed to clean messages. Please check bot permissions.',
    });
  }
}

async function handleMemberInfoCommand(interaction) {
  try {
    // Check admin permissions
    if (!(await isAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to administrators only.',
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = interaction.guild.members.cache.get(targetUser.id);

    await interaction.deferReply({ ephemeral: true });

    if (!targetMember) {
      await interaction.editReply({
        content: '❌ User not found in this server.'
      });
      return;
    }

    // Build member info
    let memberInfo = `👤 **Member Information**\n\n`;
    memberInfo += `**Discord Details:**\n`;
    memberInfo += `• Username: ${targetUser.username}\n`;
    memberInfo += `• Display Name: ${targetMember.displayName}\n`;
    memberInfo += `• User ID: \`${targetUser.id}\`\n`;
    memberInfo += `• Account Created: ${targetUser.createdAt.toLocaleDateString()}\n`;
    memberInfo += `• Joined Server: ${targetMember.joinedAt.toLocaleDateString()}\n\n`;

    // Roles
    const roles = targetMember.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .join(', ') || 'None';
    memberInfo += `**Roles:** ${roles}\n\n`;

    // Check if verified MAS member
    const isMember = targetMember.roles.cache.has(MEMBER_ROLE_ID);
    memberInfo += `**MAS Status:** ${isMember ? '✅ Verified Member' : '❌ Not Verified'}\n\n`;

    // If verified, try to get Firebase data
    if (isMember && firebaseDb) {
      try {
        const memberSnapshot = await firebaseDb.collection('membershipApplications')
          .where('discordUserId', '==', targetUser.id)
          .get();

        if (!memberSnapshot.empty) {
          const memberData = memberSnapshot.docs[0].data();
          memberInfo += `**MAS Member Data:**\n`;
          memberInfo += `• Name: ${memberData.fullName || 'N/A'}\n`;
          memberInfo += `• Email: ${memberData.email || 'N/A'}\n`;
          memberInfo += `• Status: ${memberData.status || 'N/A'}\n`;
          memberInfo += `• Application Date: ${memberData.applicationDate || 'N/A'}\n`;
          memberInfo += `• Verified: ${memberData.discordVerifiedAt ? new Date(memberData.discordVerifiedAt.toDate()).toLocaleDateString() : 'N/A'}\n`;
        }
      } catch (dbError) {
        memberInfo += `**MAS Member Data:** Unable to fetch from database\n`;
      }
    }

    // Server activity
    memberInfo += `\n**Server Activity:**\n`;
    memberInfo += `• Last Message: ${targetMember.lastMessage ? targetMember.lastMessage.createdAt.toLocaleDateString() : 'No recent messages'}\n`;
    memberInfo += `• Permissions: ${targetMember.permissions.has('Administrator') ? 'Administrator' : 'Standard'}\n`;

    await interaction.editReply({ content: memberInfo });

  } catch (error) {
    console.error('❌ Member info command error:', error);
    await interaction.editReply({
      content: '❌ Failed to retrieve member information.',
    });
  }
}

async function handlePollCommand(interaction) {
  try {
    // Check admin permissions
    if (!(await isAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to administrators only.',
        ephemeral: true
      });
      return;
    }

    const question = interaction.options.getString('question');
    const option1 = interaction.options.getString('option1');
    const option2 = interaction.options.getString('option2');
    const option3 = interaction.options.getString('option3');
    const option4 = interaction.options.getString('option4');
    const duration = interaction.options.getString('duration') || '24h';
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    await interaction.deferReply({ ephemeral: true });

    // Build options array
    const options = [option1, option2];
    if (option3) options.push(option3);
    if (option4) options.push(option4);

    // Create poll embed
    let pollDescription = `${question}\n\n`;
    const pollEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

    options.forEach((option, index) => {
      pollDescription += `${pollEmojis[index]} ${option}\n`;
    });

    // Calculate end time
    const endTime = new Date();
    switch (duration) {
      case '1h': endTime.setHours(endTime.getHours() + 1); break;
      case '6h': endTime.setHours(endTime.getHours() + 6); break;
      case '24h': endTime.setHours(endTime.getHours() + 24); break;
      case '3d': endTime.setDate(endTime.getDate() + 3); break;
      case '1w': endTime.setDate(endTime.getDate() + 7); break;
      default: endTime.setHours(endTime.getHours() + 24);
    }

    const pollEmbed = {
      title: '📊 Community Poll',
      description: pollDescription,
      color: 0x3498db,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Poll ends at ${endTime.toLocaleString()} • Created by ${interaction.user.username}`
      },
      fields: [{
        name: 'How to Vote',
        value: 'React with the corresponding emoji to vote!',
        inline: false
      }]
    };

    // Check bot permissions in target channel
    const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
    const channelPermissions = channel.permissionsFor(botMember);

    // Debug permission info
    console.log(`🔍 Poll permission check for channel: ${channel.name} (${channel.id})`);
    console.log(`   Bot permissions:`, channelPermissions?.toArray() || 'None');
    console.log(`   Has SendMessages:`, channelPermissions?.has('SendMessages'));
    console.log(`   Has EmbedLinks:`, channelPermissions?.has('EmbedLinks'));
    console.log(`   Has AddReactions:`, channelPermissions?.has('AddReactions'));

    if (!channelPermissions || !channelPermissions.has('SendMessages')) {
      await interaction.editReply({
        content: `❌ **Missing Send Messages Permission**\n\nI don't have permission to send messages in ${channel}.\n\nPlease:\n1. Go to Server Settings → Roles\n2. Find "MAS Bot" role and give it "Send Messages" permission\n3. OR right-click ${channel} → Edit Channel → Permissions → Add "MAS Bot" role with "Send Messages"`
      });
      return;
    }

    if (!channelPermissions.has('EmbedLinks')) {
      await interaction.editReply({
        content: `❌ **Missing Embed Links Permission**\n\nI need "Embed Links" permission to create polls in ${channel}.`
      });
      return;
    }

    if (!channelPermissions.has('AddReactions')) {
      await interaction.editReply({
        content: `❌ **Missing Add Reactions Permission**\n\nI need "Add Reactions" permission to create interactive polls in ${channel}.`
      });
      return;
    }

    try {
      // Try simple text poll first as fallback
      console.log('🧪 Trying simplified poll format...');

      let simplePollMessage = `📊 **${question}**\n\n`;
      options.forEach((option, index) => {
        simplePollMessage += `${pollEmojis[index]} ${option}\n`;
      });
      simplePollMessage += `\n*Poll ends: ${endTime.toLocaleString()}*\n*React with emojis to vote!*`;

      const pollMessage = await channel.send(simplePollMessage);

      // Add reaction emojis
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(pollEmojis[i]);
      }
    } catch (sendError) {
      console.error('❌ Failed to send poll message:', sendError);
      await interaction.editReply({
        content: `❌ **Failed to send poll**\n\nError: ${sendError.message}\n\nThe bot might be missing permissions in ${channel}. Please check:\n• Send Messages\n• Embed Links\n• Add Reactions\n• View Channel`
      });
      return;
    }

    await interaction.editReply({
      content: `✅ Poll created successfully in ${channel}!\n\n**Question:** ${question}\n**Duration:** ${duration}\n**Options:** ${options.length}`
    });

    console.log(`📊 Poll created by ${interaction.user.username} in #${channel.name}: "${question}"`);

  } catch (error) {
    console.error('❌ Poll command error:', error);
    await interaction.editReply({
      content: '❌ Failed to create poll. Please try again.',
    });
  }
}

// Helper function to get announcement color based on type
function getAnnouncementColor(type) {
  switch (type) {
    case 'emergency': return 0xff0000; // Red
    case 'important': return 0xff6600; // Orange
    case 'event': return 0x00ff00; // Green
    case 'general':
    default: return 0x3498db; // Blue
  }
}

// Helper function to check if user is admin
async function isAdmin(member) {
  // Check Discord server administrator permission
  if (member.permissions.has('Administrator')) {
    return true;
  }

  // Check environment variable (fallback)
  if (ADMIN_USER_IDS.includes(member.user.id)) {
    return true;
  }

  // Check Firebase admins collection
  if (firebaseDb) {
    try {
      const adminSnapshot = await firebaseDb.collection('discordAdmins')
        .where('userId', '==', member.user.id)
        .where('status', '==', 'active')
        .get();

      return !adminSnapshot.empty;
    } catch (error) {
      console.error('❌ Error checking admin status:', error);
      return false;
    }
  }

  return false;
}

// Helper function to check if user is super admin
async function isSuperAdmin(member) {
  // Check environment variable first (original super admin)
  if (ADMIN_USER_IDS.includes(member.user.id)) {
    return true;
  }

  // Check Firebase for isSuperAdmin flag
  if (firebaseDb) {
    try {
      const adminSnapshot = await firebaseDb.collection('discordAdmins')
        .where('userId', '==', member.user.id)
        .where('status', '==', 'active')
        .where('isSuperAdmin', '==', true)
        .get();

      return !adminSnapshot.empty;
    } catch (error) {
      console.error('❌ Error checking super admin status:', error);
      return false;
    }
  }

  return false;
}

// Admin Management Command Handlers
async function handleAddAdminCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const notes = interaction.options.getString('notes') || '';

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Check if user is already an admin
    const existingAdminSnapshot = await firebaseDb.collection('discordAdmins')
      .where('userId', '==', targetUser.id)
      .get();

    if (!existingAdminSnapshot.empty) {
      const existingAdmin = existingAdminSnapshot.docs[0].data();
      if (existingAdmin.status === 'active') {
        await interaction.editReply({
          content: `❌ ${targetUser.username} is already an active admin.`
        });
        return;
      }
    }

    // Get target member info
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const displayName = targetMember ? targetMember.displayName : targetUser.username;

    // Add new admin to Firebase
    const adminData = {
      userId: targetUser.id,
      username: targetUser.username,
      displayName: displayName,
      addedBy: interaction.user.id,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      permissions: ['all'],
      status: 'active',
      isSuperAdmin: false,
      notes: notes
    };

    await firebaseDb.collection('discordAdmins').add(adminData);

    await interaction.editReply({
      content: `✅ **Admin Added Successfully!**\n\n👤 **User:** ${targetUser.username} (${displayName})\n🔑 **Permissions:** All admin commands\n📝 **Notes:** ${notes || 'None'}\n👨‍💼 **Added by:** ${interaction.user.username}\n\n${targetUser.username} now has admin permissions for the MAS bot.`
    });

    console.log(`👑 Admin added: ${targetUser.username} (${targetUser.id}) by ${interaction.user.username}`);

  } catch (error) {
    console.error('❌ Add admin command error:', error);
    await interaction.editReply({
      content: '❌ Failed to add admin. Please try again.',
    });
  }
}

async function handleRemoveAdminCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Check if user is an admin
    const adminSnapshot = await firebaseDb.collection('discordAdmins')
      .where('userId', '==', targetUser.id)
      .where('status', '==', 'active')
      .get();

    if (adminSnapshot.empty) {
      await interaction.editReply({
        content: `❌ ${targetUser.username} is not currently an admin.`
      });
      return;
    }

    const adminDoc = adminSnapshot.docs[0];
    const adminData = adminDoc.data();

    // Prevent removing super admin
    if (adminData.isSuperAdmin) {
      await interaction.editReply({
        content: `❌ Cannot remove super admin ${targetUser.username}. Super admins cannot be demoted.`
      });
      return;
    }

    // Prevent self-removal (additional safety)
    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({
        content: `❌ You cannot remove your own admin permissions.`
      });
      return;
    }

    // Remove admin (set status to inactive with removal info)
    await adminDoc.ref.update({
      status: 'removed',
      removedBy: interaction.user.id,
      removedAt: admin.firestore.FieldValue.serverTimestamp(),
      removalReason: reason
    });

    await interaction.editReply({
      content: `✅ **Admin Removed Successfully!**\n\n👤 **User:** ${targetUser.username}\n📝 **Reason:** ${reason}\n👨‍💼 **Removed by:** ${interaction.user.username}\n\n${targetUser.username} no longer has admin permissions.`
    });

    console.log(`👑 Admin removed: ${targetUser.username} (${targetUser.id}) by ${interaction.user.username} - Reason: ${reason}`);

  } catch (error) {
    console.error('❌ Remove admin command error:', error);
    await interaction.editReply({
      content: '❌ Failed to remove admin. Please try again.',
    });
  }
}

async function handleListAdminsCommand(interaction) {
  try {
    // Check admin permissions
    if (!(await isAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to administrators only.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Get all active admins
    const adminsSnapshot = await firebaseDb.collection('discordAdmins')
      .where('status', '==', 'active')
      .orderBy('addedAt', 'asc')
      .get();

    if (adminsSnapshot.empty) {
      await interaction.editReply({
        content: '👑 **No admins found in database.**\n\nNote: Admins with server administrator permissions or in environment variables may still have access.'
      });
      return;
    }

    let adminsList = '👑 **Current MAS Bot Admins**\n\n';

    adminsSnapshot.forEach((doc, index) => {
      const admin = doc.data();
      const addedDate = admin.addedAt ? new Date(admin.addedAt.toDate()).toLocaleDateString() : 'Unknown';
      const superAdminBadge = admin.isSuperAdmin ? ' 🔴 **SUPER ADMIN**' : '';

      adminsList += `**${index + 1}. ${admin.displayName || admin.username}**${superAdminBadge}\n`;
      adminsList += `   • Username: @${admin.username}\n`;
      adminsList += `   • User ID: \`${admin.userId}\`\n`;
      adminsList += `   • Added: ${addedDate}\n`;
      adminsList += `   • Permissions: ${admin.permissions?.join(', ') || 'All'}\n`;
      if (admin.notes) {
        adminsList += `   • Notes: ${admin.notes}\n`;
      }
      adminsList += `\n`;
    });

    // Add note about other admin sources
    adminsList += `\n📝 **Note:** Users with Discord server administrator permissions also have bot admin access.`;

    await interaction.editReply({ content: adminsList });

  } catch (error) {
    console.error('❌ List admins command error:', error);
    await interaction.editReply({
      content: '❌ Failed to retrieve admin list. Please try again.',
    });
  }
}

// Web Admin Management Command Handlers
async function handleAddWebAdminCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    const email = interaction.options.getString('email').toLowerCase();
    const name = interaction.options.getString('name');
    const role = interaction.options.getString('role');
    const events = interaction.options.getBoolean('events') ?? false;
    const membership = interaction.options.getBoolean('membership') ?? false;
    const contacts = interaction.options.getBoolean('contacts') ?? false;
    const newsletter = interaction.options.getBoolean('newsletter') ?? false;
    const registrations = interaction.options.getBoolean('registrations') ?? false;
    const articles = interaction.options.getBoolean('articles') ?? false;
    const settings = interaction.options.getBoolean('settings') ?? false;

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Check if email already exists
    const existingAdminSnapshot = await firebaseDb.collection('adminRoles')
      .where('email', '==', email)
      .get();

    if (!existingAdminSnapshot.empty) {
      const existingAdmin = existingAdminSnapshot.docs[0].data();
      if (existingAdmin.status === 'active') {
        await interaction.editReply({
          content: `❌ Web admin already exists for email: ${email}`
        });
        return;
      }
    }

    // Generate secure password
    const password = generateSecurePassword();

    try {
      // Create Firebase Auth user
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: name,
        disabled: false
      });

      // Create admin role document
      const permissions = {
        events,
        membership,
        contacts,
        newsletter,
        registrations,
        articles,
        settings
      };

      const adminData = {
        email: email,
        name: name,
        role: role,
        permissions: permissions,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: interaction.user.username,
        lastLogin: null,
        uid: userRecord.uid
      };

      await firebaseDb.collection('adminRoles').add(adminData);

      // Success response with credentials
      let permissionsList = '';
      Object.entries(permissions).forEach(([key, value]) => {
        if (value) {
          permissionsList += `✅ ${key.charAt(0).toUpperCase() + key.slice(1)}\n`;
        }
      });

      if (!permissionsList) {
        permissionsList = '❌ No permissions granted';
      }

      await interaction.editReply({
        content: `✅ **Web Admin Created Successfully!**\n\n👤 **Details:**\n• Name: ${name}\n• Email: ${email}\n• Role: ${role}\n• Password: \`${password}\`\n\n🔑 **Permissions:**\n${permissionsList}\n\n⚠️ **Important:** Save these credentials securely and share them with the admin. The password cannot be recovered.`
      });

      console.log(`🌐 Web admin created: ${name} (${email}) by ${interaction.user.username}`);

    } catch (authError) {
      console.error('❌ Firebase Auth error:', authError);
      await interaction.editReply({
        content: `❌ Failed to create Firebase Auth account: ${authError.message}`
      });
    }

  } catch (error) {
    console.error('❌ Add web admin command error:', error);
    await interaction.editReply({
      content: '❌ Failed to create web admin. Please try again.',
    });
  }
}

async function handleRemoveWebAdminCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    const email = interaction.options.getString('email').toLowerCase();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Find admin in adminRoles
    const adminSnapshot = await firebaseDb.collection('adminRoles')
      .where('email', '==', email)
      .where('status', '==', 'active')
      .get();

    if (adminSnapshot.empty) {
      await interaction.editReply({
        content: `❌ No active web admin found with email: ${email}`
      });
      return;
    }

    const adminDoc = adminSnapshot.docs[0];
    const adminData = adminDoc.data();

    // Prevent removing super admin
    if (adminData.role === 'superadmin') {
      await interaction.editReply({
        content: `❌ Cannot remove super admin ${email}. Super admins cannot be demoted.`
      });
      return;
    }

    try {
      // Disable Firebase Auth user
      if (adminData.uid) {
        await admin.auth().updateUser(adminData.uid, {
          disabled: true
        });
      }

      // Update admin role document
      await adminDoc.ref.update({
        status: 'removed',
        removedBy: interaction.user.username,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        removalReason: reason
      });

      await interaction.editReply({
        content: `✅ **Web Admin Removed Successfully!**\n\n👤 **Admin:** ${adminData.name} (${email})\n📝 **Reason:** ${reason}\n👨‍💼 **Removed by:** ${interaction.user.username}\n\n🔒 The admin's Firebase Auth account has been disabled.`
      });

      console.log(`🌐 Web admin removed: ${adminData.name} (${email}) by ${interaction.user.username} - Reason: ${reason}`);

    } catch (authError) {
      console.error('❌ Firebase Auth error:', authError);
      await interaction.editReply({
        content: `⚠️ **Partially Removed**\n\nAdmin removed from database but Firebase Auth disable failed: ${authError.message}`
      });
    }

  } catch (error) {
    console.error('❌ Remove web admin command error:', error);
    await interaction.editReply({
      content: '❌ Failed to remove web admin. Please try again.',
    });
  }
}

async function handleListWebAdminsCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Get all active web admins
    const adminsSnapshot = await firebaseDb.collection('adminRoles')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'asc')
      .get();

    if (adminsSnapshot.empty) {
      await interaction.editReply({
        content: '🌐 **No web admins found in database.**'
      });
      return;
    }

    let adminsList = '🌐 **Current Web Admins**\n\n';

    adminsSnapshot.forEach((doc, index) => {
      const admin = doc.data();
      const createdDate = admin.createdAt ? new Date(admin.createdAt.toDate()).toLocaleDateString() : 'Unknown';
      const superAdminBadge = admin.role === 'superadmin' ? ' 🔴 **SUPER ADMIN**' : '';
      const roleBadge = admin.role === 'admin' ? ' 🔵 **ADMIN**' : admin.role === 'moderator' ? ' 🟡 **MODERATOR**' : '';

      adminsList += `**${index + 1}. ${admin.name}**${superAdminBadge}${roleBadge}\n`;
      adminsList += `   • Email: ${admin.email}\n`;
      adminsList += `   • Role: ${admin.role}\n`;
      adminsList += `   • Created: ${createdDate}\n`;

      // Show permissions
      const permissions = admin.permissions || {};
      const activePerms = Object.entries(permissions)
        .filter(([key, value]) => value)
        .map(([key, value]) => key)
        .join(', ');

      adminsList += `   • Permissions: ${activePerms || 'None'}\n`;
      adminsList += `\n`;
    });

    await interaction.editReply({ content: adminsList });

  } catch (error) {
    console.error('❌ List web admins command error:', error);
    await interaction.editReply({
      content: '❌ Failed to retrieve web admin list. Please try again.',
    });
  }
}

async function handleUpdateWebAdminCommand(interaction) {
  try {
    // Check super admin permissions
    if (!(await isSuperAdmin(interaction.member))) {
      await interaction.reply({
        content: '❌ This command is restricted to super administrators only.',
        ephemeral: true
      });
      return;
    }

    const email = interaction.options.getString('email').toLowerCase();
    const newRole = interaction.options.getString('role');

    // Get permission options (null means no change)
    const events = interaction.options.getBoolean('events');
    const membership = interaction.options.getBoolean('membership');
    const contacts = interaction.options.getBoolean('contacts');
    const newsletter = interaction.options.getBoolean('newsletter');
    const registrations = interaction.options.getBoolean('registrations');
    const articles = interaction.options.getBoolean('articles');
    const settings = interaction.options.getBoolean('settings');

    await interaction.deferReply({ ephemeral: true });

    if (!firebaseDb) {
      await interaction.editReply({
        content: '❌ Database connection unavailable. Please try again later.',
      });
      return;
    }

    // Find admin in adminRoles
    const adminSnapshot = await firebaseDb.collection('adminRoles')
      .where('email', '==', email)
      .where('status', '==', 'active')
      .get();

    if (adminSnapshot.empty) {
      await interaction.editReply({
        content: `❌ No active web admin found with email: ${email}`
      });
      return;
    }

    const adminDoc = adminSnapshot.docs[0];
    const adminData = adminDoc.data();

    // Prevent updating super admin
    if (adminData.role === 'superadmin') {
      await interaction.editReply({
        content: `❌ Cannot update super admin ${email}. Super admin permissions cannot be modified.`
      });
      return;
    }

    // Build update object
    const updateData = {
      updatedBy: interaction.user.username,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Update role if specified
    if (newRole) {
      updateData.role = newRole;
    }

    // Update permissions (only if specified)
    const currentPermissions = adminData.permissions || {};
    const updatedPermissions = { ...currentPermissions };

    if (events !== null) updatedPermissions.events = events;
    if (membership !== null) updatedPermissions.membership = membership;
    if (contacts !== null) updatedPermissions.contacts = contacts;
    if (newsletter !== null) updatedPermissions.newsletter = newsletter;
    if (registrations !== null) updatedPermissions.registrations = registrations;
    if (articles !== null) updatedPermissions.articles = articles;
    if (settings !== null) updatedPermissions.settings = settings;

    updateData.permissions = updatedPermissions;

    // Update database
    await adminDoc.ref.update(updateData);

    // Build response
    let changes = '';
    if (newRole) changes += `• Role: ${adminData.role} → ${newRole}\n`;

    const permChanges = [];
    if (events !== null) permChanges.push(`events: ${events ? '✅' : '❌'}`);
    if (membership !== null) permChanges.push(`membership: ${membership ? '✅' : '❌'}`);
    if (contacts !== null) permChanges.push(`contacts: ${contacts ? '✅' : '❌'}`);
    if (newsletter !== null) permChanges.push(`newsletter: ${newsletter ? '✅' : '❌'}`);
    if (registrations !== null) permChanges.push(`registrations: ${registrations ? '✅' : '❌'}`);
    if (articles !== null) permChanges.push(`articles: ${articles ? '✅' : '❌'}`);
    if (settings !== null) permChanges.push(`settings: ${settings ? '✅' : '❌'}`);

    if (permChanges.length > 0) {
      changes += `• Permissions: ${permChanges.join(', ')}\n`;
    }

    if (!changes) {
      changes = 'No changes specified';
    }

    await interaction.editReply({
      content: `✅ **Web Admin Updated Successfully!**\n\n👤 **Admin:** ${adminData.name} (${email})\n📝 **Changes:**\n${changes}\n👨‍💼 **Updated by:** ${interaction.user.username}`
    });

    console.log(`🌐 Web admin updated: ${adminData.name} (${email}) by ${interaction.user.username}`);

  } catch (error) {
    console.error('❌ Update web admin command error:', error);
    await interaction.editReply({
      content: '❌ Failed to update web admin. Please try again.',
    });
  }
}

// Helper function to generate secure password
function generateSecurePassword() {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  // Ensure at least one character from each type
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

console.log('🚀 MAS Astronomy Bot started!');
console.log('📅 Scheduled to post daily at 8:00 AM IST');
console.log('🌍 Tracking ISS passes over Manipur (24.8170°N, 93.9368°E)');

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Received SIGINT, shutting down gracefully');
  process.exit(0);
});