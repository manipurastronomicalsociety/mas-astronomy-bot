// MAS Astronomy Daily Bot + Member Verification System
// Posts daily astronomy content to Discord + handles member verification

import fetch from 'node-fetch';
import cron from 'node-cron';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from 'discord.js';
import admin from 'firebase-admin';

// Configuration from environment variables
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const NASA_API_KEY = process.env.NASA_API_KEY;

// Discord Bot Configuration (for verification system)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Your Discord server ID
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID; // "MAS Member" role ID

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
    const memberSnapshot = await firebaseDb.collection('memberships')
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
    await firebaseDb.collection('memberships').doc(memberSnapshot.docs[0].id).update({
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