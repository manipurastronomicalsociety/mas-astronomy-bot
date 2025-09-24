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
    .setDescription('Check your current MAS membership status on Discord')
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