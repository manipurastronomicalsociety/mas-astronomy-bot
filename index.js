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

// Get current ISS position (using the same API as MAS website)
async function getISSPosition() {
  try {
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544');

    if (!response.ok) {
      console.error(`ISS Position API returned status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`🛰️ ISS Position API Response: Lat: ${data.latitude}, Lon: ${data.longitude}`);

    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);

    // Calculate distance from Manipur (same formula as website)
    const distance = calculateDistance(MANIPUR_LAT, MANIPUR_LON, lat, lon);

    return {
      latitude: lat,
      longitude: lon,
      distance: Math.round(distance),
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error fetching ISS position:', error);
    return null;
  }
}

// Get next ISS pass over Manipur
async function getNextISSPass() {
  try {
    const response = await fetch(`http://api.open-notify.org/iss-pass.json?lat=${MANIPUR_LAT}&lon=${MANIPUR_LON}&n=1`);

    if (!response.ok) {
      console.error(`ISS Pass API returned status: ${response.status}`);
      return null;
    }

    const text = await response.text();
    console.log(`🛰️ ISS Pass API Response: ${text.substring(0, 100)}...`);

    const data = JSON.parse(text);

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
    const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`, {
      headers: {
        'User-Agent': 'MAS-Astronomy-Bot/1.0 (Manipur Astronomical Society)'
      }
    });
    const data = await response.json();

    if (data.title) {
      console.log(`🌍 NASA APOD fetched: ${data.title}`);
      console.log(`📅 Date: ${data.date}, Media: ${data.media_type}`);

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

    if (!response.ok) {
      console.error(`Astronauts API returned status: ${response.status}`);
      return null;
    }

    const text = await response.text();
    console.log(`👨‍🚀 Astronauts API Response: ${text.substring(0, 100)}...`);

    const data = JSON.parse(text);

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

// Get moon observing tips based on phase
function getMoonObservingTip(phaseName) {
  switch (phaseName) {
    case 'New Moon': return 'Deep sky objects & galaxies';
    case 'Waxing Crescent': return 'Evening lunar craters';
    case 'First Quarter': return 'Lunar mountains & valleys';
    case 'Waxing Gibbous': return 'Detailed lunar surface';
    case 'Full Moon': return 'Bright night photography';
    case 'Waning Gibbous': return 'Late night observing';
    case 'Last Quarter': return 'Early morning viewing';
    case 'Waning Crescent': return 'Pre-dawn lunar features';
    default: return 'Night sky exploration';
  }
}

// Inspiring astronomy quotes
const astronomyQuotes = [
  { quote: "The cosmos is within us. We are made of star-stuff.", author: "Carl Sagan" },
  { quote: "Two things are infinite: the universe and human stupidity; and I'm not sure about the universe.", author: "Albert Einstein" },
  { quote: "Look up at the stars and not down at your feet.", author: "Stephen Hawking" },
  { quote: "The universe is not only stranger than we imagine, it is stranger than we can imagine.", author: "J.B.S. Haldane" },
  { quote: "Space is big. You just won't believe how vastly, hugely, mind-bogglingly big it is.", author: "Douglas Adams" },
  { quote: "We are all in the gutter, but some of us are looking at the stars.", author: "Oscar Wilde" },
  { quote: "The sky is not the limit, it's just the beginning.", author: "Unknown" },
  { quote: "Astronomy is humbling and character-building.", author: "Carl Sagan" },
  { quote: "The Earth is the cradle of humanity, but mankind cannot stay in the cradle forever.", author: "Konstantin Tsiolkovsky" },
  { quote: "I have loved the stars too fondly to be fearful of the night.", author: "Sarah Williams" },
  { quote: "The universe is a pretty big place. If it's just us, seems like an awful waste of space.", author: "Carl Sagan" },
  { quote: "Keep looking up. I learn from the past, dream about the future, and look up.", author: "Neil deGrasse Tyson" },
  { quote: "The stars are the jewels of the night, and perchance surpass anything which day has to show.", author: "Henry David Thoreau" },
  { quote: "Science is not only a disciple of reason but also one of romance and passion.", author: "Stephen Hawking" },
  { quote: "The important thing is not to stop questioning.", author: "Albert Einstein" }
];

// Get random daily quote based on date (same quote for whole day)
function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const quoteIndex = dayOfYear % astronomyQuotes.length;
  return astronomyQuotes[quoteIndex];
}

// ===== FUN INTERACTIVE FEATURES =====

// Space jokes database
const spaceJokes = [
  "Why didn't the sun go to college? Because it already had a million degrees!",
  "How do you organize a space party? You planet!",
  "What did Mars say to Saturn? Give me a ring sometime!",
  "Why didn't the asteroid hit the moon? It was a miss-ile!",
  "What do you call a tick on the moon? A luna-tick!",
  "How do you get a baby astronaut to sleep? You rocket!",
  "Why didn't aliens ever land at airports? They were looking for space!",
  "What's an astronaut's favorite part of a computer? The space bar!",
  "Why did the star go to school? To get brighter!",
  "What do you call an alien with three eyes? An aliiien!",
  "How does the solar system hold up its pants? With an asteroid belt!",
  "What did Earth say to the other planets? You guys have no life!",
  "Why don't aliens ever visit our solar system? They looked at the reviews and we only have one star!",
  "What's a light-year? The same as a regular year, but with fewer calories!",
  "Why did the astronaut break up with the moon? Because she needed some space!",
  "What do you call a robot that takes the long way around? R2-Detour!",
  "How do you organize a party in space? You planet ahead!",
  "Why don't aliens ever eat lunch? They prefer space food!",
  "What's an astronaut's favorite chocolate? A Mars bar!",
  "Why did Pluto get kicked out of the solar system? It wasn't meeting its orbit requirements!"
];

// Planet orbital periods (in Earth years)
const planetData = {
  Mercury: { period: 0.24, emoji: "☿️", fact: "closest to the Sun" },
  Venus: { period: 0.62, emoji: "♀️", fact: "hottest planet" },
  Mars: { period: 1.88, emoji: "♂️", fact: "the red planet" },
  Jupiter: { period: 11.86, emoji: "♃", fact: "largest planet" },
  Saturn: { period: 29.46, emoji: "♄", fact: "has beautiful rings" },
  Uranus: { period: 84.01, emoji: "♅", fact: "tilted on its side" },
  Neptune: { period: 164.8, emoji: "♆", fact: "windiest planet" }
};

// NASA space sounds (public domain)
const spaceSounds = [
  {
    name: "Saturn's Radio Emissions",
    url: "https://archive.org/download/NASASoundofSaturn/Saturn.mp3",
    description: "Eerie radio waves from Saturn's magnetosphere"
  },
  {
    name: "Jupiter's Sounds",
    url: "https://www.nasa.gov/wav/144208main_Jupiter1.wav",
    description: "Radio emissions from Jupiter captured by Voyager"
  },
  {
    name: "Apollo 11 Launch",
    url: "https://www.nasa.gov/wav/84869main_liftoff.wav",
    description: "The roar of Saturn V rocket launching to the Moon"
  },
  {
    name: "Sputnik Beep",
    url: "https://www.nasa.gov/wav/84865main_sputnik-beep.wav",
    description: "Historic beeping from the first artificial satellite"
  },
  {
    name: "Solar Wind",
    url: "https://www.nasa.gov/wav/84866main_wind.wav",
    description: "The sound of solar particles hitting spacecraft"
  }
];

// Famous astronomers database
const astronomers = [
  {
    name: "Carl Sagan",
    era: "1934-1996",
    achievement: "Popularized astronomy through Cosmos TV series",
    quote: "The cosmos is within us. We are made of star-stuff.",
    emoji: "🌌"
  },
  {
    name: "Galileo Galilei",
    era: "1564-1642",
    achievement: "First to use telescope for astronomy, discovered Jupiter's moons",
    quote: "And yet it moves! (referring to Earth orbiting the Sun)",
    emoji: "🔭"
  },
  {
    name: "Edwin Hubble",
    era: "1889-1953",
    achievement: "Discovered the expansion of the universe",
    quote: "Equipped with his five senses, man explores the universe.",
    emoji: "🌌"
  },
  {
    name: "Stephen Hawking",
    era: "1942-2018",
    achievement: "Revolutionary work on black holes and cosmology",
    quote: "Look up at the stars and not down at your feet.",
    emoji: "🕳️"
  },
  {
    name: "Marie Curie",
    era: "1867-1934",
    achievement: "Pioneer in radioactivity research, first woman Nobel Prize winner",
    quote: "Nothing in life is to be feared, it is only to be understood.",
    emoji: "⚛️"
  },
  {
    name: "Neil deGrasse Tyson",
    era: "1958-present",
    achievement: "Modern science communicator and astrophysicist",
    quote: "The universe is under no obligation to make sense to you.",
    emoji: "🌟"
  },
  {
    name: "Copernicus",
    era: "1473-1543",
    achievement: "Proposed heliocentric model of solar system",
    quote: "Mathematics is written for mathematicians.",
    emoji: "☀️"
  },
  {
    name: "Johannes Kepler",
    era: "1571-1630",
    achievement: "Discovered laws of planetary motion",
    quote: "The diversity of the phenomena of nature is so great.",
    emoji: "🪐"
  },
  {
    name: "Isaac Newton",
    era: "1643-1727",
    achievement: "Laws of motion and universal gravitation",
    quote: "I can calculate the motion of heavenly bodies, but not the madness of people.",
    emoji: "🍎"
  },
  {
    name: "Katherine Johnson",
    era: "1918-2020",
    achievement: "NASA mathematician who calculated trajectories for moon missions",
    quote: "I counted everything. I counted the steps, the dishes, the stars in the sky.",
    emoji: "🚀"
  }
];

// Helper functions for interactive commands
function getRandomJoke() {
  return spaceJokes[Math.floor(Math.random() * spaceJokes.length)];
}

function calculatePlanetAge(earthAge, planet) {
  const planetInfo = planetData[planet];
  if (!planetInfo) return null;

  const planetAge = (earthAge / planetInfo.period).toFixed(1);
  return {
    age: planetAge,
    emoji: planetInfo.emoji,
    fact: planetInfo.fact
  };
}

function getRandomSpaceSound() {
  return spaceSounds[Math.floor(Math.random() * spaceSounds.length)];
}

function getRandomAstronomer() {
  return astronomers[Math.floor(Math.random() * astronomers.length)];
}

// Track last post to prevent duplicates
let lastPostTime = 0;

// Send daily astronomy content to Discord
async function sendDailyContent() {
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;

  // Prevent duplicate posts within 5 minutes (300,000 ms)
  if (timeSinceLastPost < 300000 && lastPostTime > 0) {
    console.log(`⏰ Skipping duplicate post - only ${Math.round(timeSinceLastPost / 1000)} seconds since last post`);
    return;
  }

  console.log('🚀 Fetching daily astronomy content...');
  lastPostTime = now;

  try {
    // Fetch all data in parallel
    const [apod, issPosition, issPass, moonPhase, astronauts] = await Promise.all([
      getNASAAPOD(),
      getISSPosition(),
      getNextISSPass(),
      getMoonPhase(),
      getAstronautsInSpace()
    ]);

    // Create Discord embed with better design
    const embed = {
      title: "🌌 Daily Astronomy Update",
      description: "✨ **Your daily dose of cosmic wonders from Manipur!** ✨",
      color: 0x4f46e5, // Modern indigo color
      fields: [],
      footer: {
        text: "🔭 Manipur Astronomical Society • 🌍 Imphal, Manipur • 📡 Live Data",
        icon_url: "https://manipurastronomy.org/logo.png"
      },
      timestamp: new Date().toISOString(),
      thumbnail: {
        url: "https://manipurastronomy.org/logo.png"
      }
    };

    // Add a separator field for better organization
    embed.fields.push({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      value: "🌟 **TODAY'S COSMIC HIGHLIGHTS** 🌟",
      inline: false
    });

    // Add NASA APOD
    if (apod) {
      console.log(`📸 APOD Media Type: ${apod.mediaType}`);
      console.log(`🔗 APOD URL: ${apod.hdurl || apod.url}`);

      if (apod.mediaType === 'image') {
        // Discord has issues with NASA APOD images - try multiple approaches
        const hdImageUrl = apod.hdurl;
        const regularImageUrl = apod.url;

        console.log(`🔍 Trying different image URLs:`);
        console.log(`📸 HD URL: ${hdImageUrl}`);
        console.log(`📸 Regular URL: ${regularImageUrl}`);

        // Try the regular URL first (sometimes works better than HD)
        if (regularImageUrl) {
          embed.image = { url: regularImageUrl };
          console.log(`✅ Set embed.image.url to regular: ${regularImageUrl}`);
        }

        // Always provide clickable link as backup
        embed.fields.push({
          name: "🖼️ View Today's NASA Image",
          value: `🔗 [**${apod.title}**](${hdImageUrl || regularImageUrl})\n*Click to view the full image*`,
          inline: true
        });

        // Add image info
        embed.fields.push({
          name: "📸 Image Details",
          value: `📅 **Date:** ${apod.date}\n🎯 **Type:** ${apod.mediaType}${apod.copyright ? `\n👤 **Credit:** ${apod.copyright}` : ''}`,
          inline: true
        });
      } else if (apod.mediaType === 'video') {
        embed.fields.push({
          name: "🎥 NASA Video of the Day",
          value: `[**${apod.title}** - Watch Video](${apod.url})`,
          inline: false
        });
        console.log(`🎥 Added video link: ${apod.url}`);
      }

      embed.fields.push({
        name: "🖼️ NASA Astronomy Picture of the Day",
        value: `**${apod.title}**\n\n${apod.explanation.length > 300 ? apod.explanation.substring(0, 300) + "..." : apod.explanation}${apod.copyright ? `\n\n*📸 Credit: ${apod.copyright}*` : ''}`,
        inline: false
      });
    }

    // Add separator for space tracking section
    embed.fields.push({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      value: "🛰️ **LIVE SPACE TRACKING** 🛰️",
      inline: false
    });

    // ISS and Astronauts in organized layout
    if (issPosition) {
      embed.fields.push({
        name: "🛰️ International Space Station",
        value: `📍 **Location:** ${issPosition.latitude.toFixed(1)}°, ${issPosition.longitude.toFixed(1)}°\n📏 **Distance from Manipur:** ${issPosition.distance.toLocaleString()} km\n⚡ **Speed:** 27,600 km/h`,
        inline: true
      });
    } else {
      console.log('⚠️ ISS position data unavailable');
      embed.fields.push({
        name: "🛰️ International Space Station",
        value: "📡 Location data temporarily unavailable\n*Check back later for live tracking*",
        inline: true
      });
    }

    // Add Astronauts in Space (simplified)
    if (astronauts) {
      embed.fields.push({
        name: "👨‍🚀 Crew in Space",
        value: `🏠 **${astronauts.number} astronauts** aboard ISS\n🌍 Living 400km above Earth\n🔬 Conducting space research`,
        inline: true
      });
    }

    // Add Moon Phase
    embed.fields.push({
      name: `${moonPhase.phaseEmoji} Moon Phase`,
      value: `🌙 **Tonight:** ${moonPhase.phaseName}\n🔭 **Perfect for:** ${getMoonObservingTip(moonPhase.phaseName)}`,
      inline: true
    });

    // ISS Pass information
    if (issPass) {
      embed.fields.push({
        name: "👀 Next ISS Pass Over Manipur",
        value: `⏰ **When:** ${issPass.formattedTime}\n⏱️ **Duration:** ${issPass.duration} minutes\n🔭 **Look up and wave!**`,
        inline: false
      });
    } else {
      console.log('⚠️ ISS pass data unavailable');
      embed.fields.push({
        name: "👀 ISS Passes Over Manipur",
        value: "📅 Pass predictions updating...\n🔭 *ISS passes occur daily - check back soon!*",
        inline: false
      });
    }

    // Add final separator and viewing tips
    embed.fields.push({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      value: "🔭 **STARGAZING GUIDE FOR MANIPUR** 🔭",
      inline: false
    });

    // Enhanced viewing tip based on time and moon phase
    const currentHour = new Date().getHours();
    let viewingTip = '';
    let additionalTips = '';

    if (currentHour >= 18 || currentHour <= 6) {
      viewingTip = "🌃 **Perfect time for stargazing!**";
      additionalTips = "🏔️ Head to higher elevations around Imphal for clearer skies\n🌡️ Dress warmly - temperatures drop at night";
    } else {
      viewingTip = "☀️ **Daytime astronomy planning:**";
      additionalTips = "📱 Download stargazing apps to plan tonight's session\n🌙 Check if the Moon is visible during daylight";
    }

    // Get today's inspiring quote
    const dailyQuote = getDailyQuote();

    // General viewing tips based on moon phase
    let viewingAdvice = "";
    if (moonPhase.phaseName === 'New Moon' || moonPhase.phaseName.includes('Crescent')) {
      viewingAdvice = "🌑 **Dark sky conditions:** Perfect for deep sky objects\n🔭 Find an open area away from city lights\n⭐ Look for the Milky Way and star clusters";
    } else {
      viewingAdvice = "🌝 **Bright moon tonight:** Great for lunar observation\n🔍 Use binoculars to see lunar craters and mountains\n📸 Excellent for moon photography";
    }

    embed.fields.push({
      name: viewingTip,
      value: `${additionalTips}\n\n${viewingAdvice}`,
      inline: false
    });

    // Add daily inspiration
    embed.fields.push({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      value: `✨ **COSMIC INSPIRATION** ✨\n\n*"${dailyQuote.quote}"*\n\n— **${dailyQuote.author}**`,
      inline: false
    });

    // Send to Discord
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "🌟 **Khurumjari, space enthusiasts of Manipur!** 🇮🇳\n✨ Your daily cosmic journey begins now ✨",
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

    // ===== FUN INTERACTIVE COMMANDS =====
    } else if (interaction.commandName === 'spacejoke') {
      await handleSpaceJokeCommand(interaction);
    } else if (interaction.commandName === 'yourage') {
      await handleYourAgeCommand(interaction);
    } else if (interaction.commandName === 'spacemusic') {
      await handleSpaceMusicCommand(interaction);
    } else if (interaction.commandName === 'astronomer') {
      await handleAstronomerCommand(interaction);
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

// ===== FUN INTERACTIVE COMMAND HANDLERS =====

async function handleSpaceJokeCommand(interaction) {
  try {
    const joke = getRandomJoke();

    const embed = {
      title: "🚀 Space Joke of the Moment!",
      description: `*${joke}*`,
      color: 0x9333ea, // Purple color
      footer: {
        text: "😄 Brought to you by MAS • Making space fun!",
        icon_url: "https://manipurastronomy.org/logo.png"
      },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({
      embeds: [embed]
    });

    console.log(`😄 Space joke sent to ${interaction.user.username}`);

  } catch (error) {
    console.error('❌ Space joke command error:', error);
    await interaction.reply({
      content: '❌ Sorry, something went wrong with the joke generator! Try again later.',
      ephemeral: true
    });
  }
}

async function handleYourAgeCommand(interaction) {
  try {
    const earthAge = interaction.options.getInteger('age');
    const planetName = interaction.options.getString('planet');

    const result = calculatePlanetAge(earthAge, planetName);

    if (!result) {
      await interaction.reply({
        content: '❌ Invalid planet selected. Please try again.',
        ephemeral: true
      });
      return;
    }

    const embed = {
      title: `${result.emoji} Your Age on ${planetName}`,
      description: `🌍 **On Earth:** ${earthAge} years old\n${result.emoji} **On ${planetName}:** ${result.age} years old!`,
      color: 0x3b82f6, // Blue color
      fields: [
        {
          name: "🔬 Fun Fact",
          value: `${planetName} is ${result.fact}`,
          inline: true
        },
        {
          name: "⏰ Why the Difference?",
          value: `${planetName} takes ${planetData[planetName].period} Earth years to complete one orbit around the Sun!`,
          inline: false
        }
      ],
      footer: {
        text: "🪐 Powered by MAS • Exploring the cosmos together!",
        icon_url: "https://manipurastronomy.org/logo.png"
      },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({
      embeds: [embed]
    });

    console.log(`🪐 Planet age calculated for ${interaction.user.username}: ${earthAge} Earth years = ${result.age} ${planetName} years`);

  } catch (error) {
    console.error('❌ Planet age command error:', error);
    await interaction.reply({
      content: '❌ Failed to calculate your planetary age. Please try again.',
      ephemeral: true
    });
  }
}

async function handleSpaceMusicCommand(interaction) {
  try {
    const sound = getRandomSpaceSound();

    const embed = {
      title: "🎵 Sounds from Space",
      description: `🛰️ **${sound.name}**\n\n${sound.description}`,
      color: 0x06b6d4, // Cyan color
      fields: [
        {
          name: "🎧 Listen Now",
          value: `[🔊 **Click here to play audio**](${sound.url})`,
          inline: false
        },
        {
          name: "📡 About Space Sounds",
          value: "These are real recordings from NASA missions! Space doesn't carry sound waves, but spacecraft can detect radio emissions and electromagnetic vibrations that we convert to audio.",
          inline: false
        }
      ],
      footer: {
        text: "🎵 NASA Public Domain • Curated by MAS",
        icon_url: "https://manipurastronomy.org/logo.png"
      },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({
      embeds: [embed]
    });

    console.log(`🎵 Space sound sent to ${interaction.user.username}: ${sound.name}`);

  } catch (error) {
    console.error('❌ Space music command error:', error);
    await interaction.reply({
      content: '❌ Failed to load space sounds. Please try again.',
      ephemeral: true
    });
  }
}

async function handleAstronomerCommand(interaction) {
  try {
    const astronomer = getRandomAstronomer();

    const embed = {
      title: `${astronomer.emoji} ${astronomer.name}`,
      description: `**${astronomer.era}**`,
      color: 0xf59e0b, // Amber color
      fields: [
        {
          name: "🏆 Major Achievement",
          value: astronomer.achievement,
          inline: false
        },
        {
          name: "💭 Famous Quote",
          value: `*"${astronomer.quote}"*`,
          inline: false
        },
        {
          name: "🌟 Legacy",
          value: "This brilliant mind helped expand our understanding of the universe and continues to inspire future generations of astronomers and space enthusiasts!",
          inline: false
        }
      ],
      footer: {
        text: "👨‍🚀 Honoring space pioneers • MAS",
        icon_url: "https://manipurastronomy.org/logo.png"
      },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({
      embeds: [embed]
    });

    console.log(`👨‍🚀 Astronomer profile sent to ${interaction.user.username}: ${astronomer.name}`);

  } catch (error) {
    console.error('❌ Astronomer command error:', error);
    await interaction.reply({
      content: '❌ Failed to load astronomer information. Please try again.',
      ephemeral: true
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