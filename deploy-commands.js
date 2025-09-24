// Deploy slash commands for MAS Discord verification bot

import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your MAS membership using your registered email')
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Your registered email address with MAS')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your current MAS membership status on Discord'),

  new SlashCommandBuilder()
    .setName('events')
    .setDescription('Show upcoming MAS events'),

  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register for a MAS event')
    .addStringOption(option =>
      option
        .setName('event-slug')
        .setDescription('Event slug/ID (get from /events command)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Your full name')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Your email address')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('phone')
        .setDescription('Your phone number (e.g., +91 98765 43210)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('Your current status')
        .setRequired(true)
        .addChoices(
          { name: 'Student', value: 'Student' },
          { name: 'Professional', value: 'Professional' },
          { name: 'Teacher/Educator', value: 'Teacher/Educator' },
          { name: 'Researcher', value: 'Researcher' },
          { name: 'Other', value: 'Other' }
        )
    )
    .addStringOption(option =>
      option
        .setName('education')
        .setDescription('Your education level (e.g., High School, Bachelor\'s, Master\'s)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Any questions or special requirements? (optional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('my-events')
    .setDescription('Show your registered events')
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Your registered email address')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('event-details')
    .setDescription('Get detailed information about a specific event')
    .addStringOption(option =>
      option
        .setName('event-slug')
        .setDescription('Event slug/ID (get from /events command)')
        .setRequired(true)
    ),

  // Admin-only commands
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('[ADMIN ONLY] Send a formatted announcement')
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('Announcement title')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Announcement content')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to send announcement (default: current channel)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Announcement type')
        .setRequired(false)
        .addChoices(
          { name: 'General', value: 'general' },
          { name: 'Event', value: 'event' },
          { name: 'Important', value: 'important' },
          { name: 'Emergency', value: 'emergency' }
        )
    ),

  new SlashCommandBuilder()
    .setName('clean-chat')
    .setDescription('[ADMIN ONLY] Delete recent messages from this channel')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Only delete messages from this user (optional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('member-info')
    .setDescription('[ADMIN ONLY] Get detailed information about a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to get information about')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('[ADMIN ONLY] Create a poll for community engagement')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('The poll question')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option1')
        .setDescription('First poll option')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option2')
        .setDescription('Second poll option')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option3')
        .setDescription('Third poll option (optional)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('option4')
        .setDescription('Fourth poll option (optional)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('duration')
        .setDescription('Poll duration')
        .setRequired(false)
        .addChoices(
          { name: '1 hour', value: '1h' },
          { name: '6 hours', value: '6h' },
          { name: '24 hours', value: '24h' },
          { name: '3 days', value: '3d' },
          { name: '1 week', value: '1w' }
        )
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post poll (default: current channel)')
        .setRequired(false)
    ),

  // Admin Management Commands
  new SlashCommandBuilder()
    .setName('add-admin')
    .setDescription('[SUPER ADMIN ONLY] Grant admin permissions to a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to grant admin permissions')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('notes')
        .setDescription('Optional notes about this admin (e.g., "Event coordinator")')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('remove-admin')
    .setDescription('[SUPER ADMIN ONLY] Remove admin permissions from a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to remove admin permissions from')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removing admin permissions')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('list-admins')
    .setDescription('[ADMIN ONLY] List all current admins and their details'),

  // Web Admin Management Commands (Super Admin Only)
  new SlashCommandBuilder()
    .setName('add-web-admin')
    .setDescription('[SUPER ADMIN ONLY] Create a new web admin account with custom permissions')
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Email address for the web admin')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Full name of the web admin')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('role')
        .setDescription('Admin role level')
        .setRequired(true)
        .addChoices(
          { name: 'Admin (Custom Permissions)', value: 'admin' },
          { name: 'Moderator (Limited)', value: 'moderator' }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('events')
        .setDescription('Permission to manage events')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('membership')
        .setDescription('Permission to manage memberships')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('contacts')
        .setDescription('Permission to view contact messages')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('newsletter')
        .setDescription('Permission to manage newsletter')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('registrations')
        .setDescription('Permission to view event registrations')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('articles')
        .setDescription('Permission to manage articles/blog')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('settings')
        .setDescription('Permission to access system settings')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('remove-web-admin')
    .setDescription('[SUPER ADMIN ONLY] Remove web admin access')
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Email of the web admin to remove')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removal')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('list-web-admins')
    .setDescription('[SUPER ADMIN ONLY] List all web admins and their permissions'),

  new SlashCommandBuilder()
    .setName('update-web-admin')
    .setDescription('[SUPER ADMIN ONLY] Update web admin permissions')
    .addStringOption(option =>
      option
        .setName('email')
        .setDescription('Email of the web admin to update')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('role')
        .setDescription('New admin role level')
        .setRequired(false)
        .addChoices(
          { name: 'Admin (Custom Permissions)', value: 'admin' },
          { name: 'Moderator (Limited)', value: 'moderator' }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('events')
        .setDescription('Permission to manage events')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('membership')
        .setDescription('Permission to manage memberships')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('contacts')
        .setDescription('Permission to view contact messages')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('newsletter')
        .setDescription('Permission to manage newsletter')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('registrations')
        .setDescription('Permission to view event registrations')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('articles')
        .setDescription('Permission to manage articles/blog')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('settings')
        .setDescription('Permission to access system settings')
        .setRequired(false)
    )
].map(command => command.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

// Deploy commands
async function deployCommands() {
  try {
    console.log('🚀 Started refreshing application slash commands...');

    // Register commands to specific guild (faster) or globally
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // Guild-specific (instant)
      { body: commands }
    );

    console.log(`✅ Successfully reloaded ${data.length} application slash commands:`);
    console.log('   /verify - Verify MAS membership with email');
    console.log('   /status - Check membership status');
    console.log('\n🎉 Commands are now available in your Discord server!');

  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
}

// Check if required environment variables are present
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing required environment variables:');
  console.error('   DISCORD_TOKEN, CLIENT_ID, GUILD_ID must be set');
  process.exit(1);
}

deployCommands();