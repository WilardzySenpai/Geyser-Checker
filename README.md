# Geyser Monitor Bot

Small Discord bot that checks GeyserMC download pages for build headings and posts updates to a channel.

Setup

1. Install deps

```bash
cd bot
npm install
```

2. Create `.env` based on `.env.example` and set `DISCORD_TOKEN` and `CHANNEL_ID`.

3. Start the bot

```bash
npm start
```

Notes

- The bot stores state in `bot/state.json` to remember last posted messages and will edit them when the detected text changes.
- Adjust the check interval with `CHECK_INTERVAL_MIN` in the environment.
