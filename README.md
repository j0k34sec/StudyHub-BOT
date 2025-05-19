# 🎙️ TempVC Discord Bot

A modern Discord bot that automatically creates and manages temporary voice channels for your server. Perfect for gaming, study groups, or any community that needs on-demand voice spaces!

---

## 🚀 Features

- **Join-to-Create**: Users join a special channel to get their own temporary voice channel.
- **Automatic Cleanup**: Channels are deleted when empty.
- **Custom Permissions**: Channel creators get special permissions (mute, move, etc).
- **Easy Setup**: Slash commands for quick configuration.
- **Persistent Settings**: Uses SQLite for reliable storage.
- **Rich Command Set**: Rename, privatize, vote-kick, and more!

---

## 🛠️ Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd tempVC
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a Discord Bot**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application & add a bot
   - Enable the following intents:
     - MESSAGE CONTENT INTENT
     - SERVER MEMBERS INTENT
     - PRESENCE INTENT
   - Copy your bot token and client ID

4. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Fill in your bot token and client ID:
     ```env
     DISCORD_TOKEN=your_bot_token_here
     CLIENT_ID=your_application_client_id_here
     ```

5. **Invite the Bot to Your Server**
   - Use the OAuth2 URL Generator in the Developer Portal
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Manage Channels`, `Move Members`, etc.

6. **Deploy Commands**
   ```bash
   node deploy-commands.js
   ```

7. **Start the Bot**
   ```bash
   node index.js
   ```

---

## 💡 Usage

1. **Initialize the system**
   - Use `/setupjoin init` to set up the join-to-create channel.
2. **Add categories**
   - Use `/setupjoin add_category` to add categories for temp channels.
3. **Check status**
   - Use `/setupjoin list` to view your configuration.
4. **Enjoy!**
   - Users join the special channel to get their own temp voice channel.

---

## 📝 Commands

| Command                | Description                                      |
|------------------------|--------------------------------------------------|
| `/setupjoin`           | Configure join-to-create system (admin only)      |
| `/rename`              | Rename your temporary voice channel               |
| `/private`             | Make your channel private                        |
| `/invite`              | Invite users to your temp channel                |
| `/votekick`            | Start a vote to kick someone from your channel   |
| `/forcemute`           | Mute a user in your temp channel                 |
| `/ping`                | Check bot latency                                |
| `/hello`               | Greet the bot                                    |
| `/help`                | List all available commands                      |

---

## 🧑‍💻 Contributing

1. Fork this repo
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## 📦 File Structure

```
├── commands/         # Slash command modules
├── config/           # Configuration and database setup
├── data/             # SQLite database storage
├── events/           # Discord event handlers
├── utils/            # Utility functions
├── index.js          # Main bot entry point
├── deploy-commands.js# Command deployment script
├── README.md         # This file
```

---

## 🙋 FAQ

- **Q: The bot says setup is required, but I configured everything!**
  - A: Make sure your channel/category IDs in `guildSettings.json` are correct and the bot has permission to view them.

- **Q: How do I add more commands?**
  - A: Add a new file in `commands/` using the provided template, then run `node deploy-commands.js` and restart the bot.

---

## 📝 License

MIT 