# MAS Astronomy Bot

Daily astronomy content bot for Manipur Astronomical Society Discord server.

## Features

🌌 **Daily NASA Astronomy Picture of the Day**
🛰️ **ISS real-time tracking and pass predictions for Manipur**
🌙 **Current moon phase**
👨‍🚀 **Astronauts currently in space**
🔭 **Daily viewing tips for Manipur**

## Deployment on Railway

### Prerequisites
- Railway account (free tier available)
- GitHub account
- Discord webhook URL
- NASA API key

### Environment Variables
Set these in Railway dashboard:
```
DISCORD_WEBHOOK_URL=your_discord_webhook_url
NASA_API_KEY=your_nasa_api_key
NODE_ENV=production
```

### Schedule
Posts daily at **8:00 AM IST** to Discord channel.

## Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export DISCORD_WEBHOOK_URL="your_webhook"
export NASA_API_KEY="your_api_key"

# Run bot
npm start
```

## APIs Used
- NASA APOD API (requires key)
- Open Notify ISS API (free, no key)
- Moon phase calculation (built-in)

## Location
Configured for **Imphal, Manipur** coordinates: 24.8170°N, 93.9368°E