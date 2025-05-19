require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];

// Function to recursively get all command files
function getCommandFiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            getCommandFiles(filePath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(`Loaded command: ${command.data.name}`);
                } else {
                    console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
            }
        }
    }
}

// Get all commands from the commands directory and its subdirectories
const commandsPath = path.join(__dirname, 'commands');
getCommandFiles(commandsPath);

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('[ERROR] DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('[ERROR] CLIENT_ID is not set in .env file');
    process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('[ERROR] Failed to deploy commands:', error);
        process.exit(1);
    }
})(); 