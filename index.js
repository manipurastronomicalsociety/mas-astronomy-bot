// MAS Astronomy Daily Bot
// Posts daily astronomy content to Discord

import fetch from 'node-fetch';
import cron from 'node-cron';

// Configuration from environment variables
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const NASA_API_KEY = process.env.NASA_API_KEY;

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