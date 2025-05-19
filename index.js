require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Events, ChannelType } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./config/database');
const { getSettings, setSettings } = require('./config/guildSettings');
const { initializeTimers } = require('./utils/roleTimerDB');
const { initializeSchedules } = require('./utils/studyScheduler');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Create collections for commands and settings
client.commands = new Collection();
client.tempVCs = new Map();
client.settings = new Map();

// Function to recursively load commands
function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
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

// Load commands from the commands directory and its subdirectories
const commandsPath = path.join(__dirname, 'commands');
loadCommands(commandsPath);

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`Loaded event: ${event.name}`);
    } catch (error) {
        console.error(`[ERROR] Failed to load event at ${filePath}:`, error);
    }
}

// Listen for interactions (slash commands)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);
        const errorMessage = 'There was an error while executing this command!';
        
        // Try to respond to the user, but don't throw if we can't
        try {
            // Check if the interaction is still valid
            if (Date.now() - interaction.createdTimestamp < 14000) { // Discord's timeout is 15 seconds
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true })
                        .catch(e => console.error('[ERROR] Failed to follow up:', e));
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true })
                        .catch(e => console.error('[ERROR] Failed to reply:', e));
                }
            } else {
                console.log(`[INFO] Interaction for ${interaction.commandName} timed out, cannot respond`);
            }
        } catch (replyError) {
            console.error('[ERROR] Failed to send error message:', replyError);
        }
    }
});

// Function to find available category
async function findAvailableCategory(guild) {
    const categories = client.settings.get('categories');
    if (!categories || categories.length === 0) {
        console.warn('[WARNING] No categories configured for temporary voice channels');
        return null;
    }

    for (const category of categories) {
        try {
            const categoryChannel = await guild.channels.fetch(category.id);
            if (!categoryChannel) {
                console.warn(`[WARNING] Category ${category.id} not found`);
                continue;
            }

            const existingChannels = categoryChannel.children.cache.filter(channel => 
                channel.type === ChannelType.GuildVoice
            ).size;

            if (category.limit === 0 || existingChannels < category.limit) {
                return categoryChannel;
            }
        } catch (error) {
            console.error(`[ERROR] Failed to fetch category ${category.id}:`, error);
        }
    }

    return null;
}

// Handle voice state updates
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const joinChannelId = client.settings.get('joinChannelId');
    if (!joinChannelId) return;

    try {
        // Check if user joined the join-to-create channel
        if (newState.channelId === joinChannelId) {
            const category = await findAvailableCategory(newState.guild);
            if (!category) {
                await newState.setChannel(null);
                const user = newState.member;
                await user.send('❌ All categories are full! Please try again later.').catch(() => {});
                return;
            }

            const channelName = `${newState.member.displayName}'s Channel`;

            // Create a new temporary voice channel
            let channel;
            try {
                channel = await newState.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: category,
                    permissionOverwrites: [
                        {
                            id: newState.member.id,
                            allow: ['ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers']
                        },
                        {
                            id: newState.guild.id, // @everyone role
                            allow: ['ViewChannel', 'Connect']
                        }
                    ]
                });
            } catch (channelError) {
                console.error('[ERROR] Failed to create voice channel:', channelError);
                await newState.member.send('❌ Failed to create voice channel. Please try again later.').catch(() => {});
                return;
            }

            // Store the channel info in SQLite using a transaction
            try {
                db.transaction(() => {
                    // First ensure guild exists
                    db.run(`
                        INSERT OR IGNORE INTO guilds (guild_id, created_at)
                        VALUES (?, ?)
                    `, [newState.guild.id, Date.now()]);

                    // Then insert the voice channel with additional info
                    db.run(`
                INSERT INTO voice_channels (
                            channel_id, guild_id, creator_id, creator_username,
                            channel_name, virtual_owner_id, virtual_owner_username,
                            created_at, category_id, is_private, user_limit, bitrate
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                    channel.id,
                    channel.guild.id,
                    newState.member.id,
                        newState.member.user.username,
                        channelName,
                        newState.member.id, // Initially, virtual owner is same as creator
                        newState.member.user.username,
                    Date.now(),
                    category.id,
                    0, // is_private
                    0, // user_limit
                    64000 // bitrate
                    ]);
                })();

                console.log('Inserted new temp VC into SQLite:', channel.id);
            } catch (err) {
                console.error('Failed to insert temp VC into SQLite:', err);
                // Clean up the created channel if database insert fails
                await channel.delete().catch(console.error);
                throw err;
            }

            // Keep tempVCs Map for backward compatibility
            client.tempVCs.set(channel.id, {
                creatorId: newState.member.id,
                creatorUsername: newState.member.user.username,
                channelName: channelName,
                virtualOwnerId: newState.member.id,
                virtualOwnerUsername: newState.member.user.username,
                createdAt: Date.now(),
                categoryId: category.id
            });

            // Move the user to the new channel
            try {
                await newState.setChannel(channel);
                console.log(`Created temporary voice channel: ${channel.name} for user ${newState.member.user.tag}`);
            } catch (moveError) {
                console.error('[ERROR] Failed to move user to new channel:', moveError);
                // Don't delete the channel - user can still join manually
                await newState.member.send(`✅ Your voice channel was created, but I couldn't move you there automatically. Please join manually.`).catch(() => {});
            }
        }

        // Check if the channel is a temporary voice channel and is now empty
        if (oldState.channel) {
            const channelData = db.get('SELECT * FROM voice_channels WHERE channel_id = ?', [oldState.channel.id]);

            if (channelData && oldState.channel.members.size === 0) {
                await oldState.channel.delete();
                
                // Remove from database using a transaction
                try {
                    db.transaction(() => {
                        db.run('DELETE FROM voice_channels WHERE channel_id = ?', [oldState.channel.id]);
                    })();
                } catch (dbError) {
                    console.error(`[ERROR] Failed to delete voice channel ${oldState.channel.id} from database:`, dbError);
                    // Continue execution - we still want to remove from the Map even if DB fails
                }

                // Remove from tempVCs Map
                client.tempVCs.delete(oldState.channel.id);
                console.log(`Deleted temporary voice channel: ${oldState.channel.name}`);
            }
        }
    } catch (error) {
        console.error('[ERROR] Error in voice state update handler:', error);
    }
});

// Error handling for the client
client.on('error', error => {
    console.error('[ERROR] Discord client error:', error);
});

client.on('warn', warning => {
    console.warn('[WARNING] Discord client warning:', warning);
});

// Function to clean up orphaned channels
async function cleanupOrphanedChannels() {
    try {
        const allChannels = db.prepare('SELECT channel_id FROM voice_channels').all();
        for (const row of allChannels) {
            try {
                const channel = await client.channels.fetch(row.channel_id).catch(() => null);
                if (!channel) {
                    try {
                        db.prepare('DELETE FROM voice_channels WHERE channel_id = ?').run(row.channel_id);
                        console.log('Cleaned up orphaned channel:', row.channel_id);
                    } catch (dbError) {
                        console.error(`[ERROR] Failed to delete orphaned channel ${row.channel_id} from database:`, dbError);
                    }
                }
            } catch (channelError) {
                console.error(`[ERROR] Error processing channel ${row.channel_id} during cleanup:`, channelError);
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to fetch channels for cleanup:', error);
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await cleanupOrphanedChannels();
    
    // Initialize role timers and scheduled study sessions
    initializeTimers();
    initializeSchedules();
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('[ERROR] Failed to login to Discord:', error);
    // Log more details about the environment to help diagnose the issue
    console.error('[DEBUG] Environment check:', {
        nodeVersion: process.version,
        platform: process.platform,
        tokenExists: !!process.env.DISCORD_TOKEN,
        tokenLength: process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 0
    });
    process.exit(1);
}); 

// --- SETTINGS MIGRATION ---
const oldSettingsPath = path.join(__dirname, 'settings.json');
const newSettingsPath = path.join(__dirname, 'guildSettings.json');
if (fs.existsSync(oldSettingsPath)) {
    try {
        const oldSettings = JSON.parse(fs.readFileSync(oldSettingsPath, 'utf8'));
        // Assume oldSettings is for the first guild the bot is in
        (async () => {
            try {
                const client = new Client({ intents: [] });
                await client.login(process.env.DISCORD_TOKEN);
                const guilds = client.guilds.cache;
                if (guilds.size > 0) {
                    const firstGuildId = guilds.first().id;
                    let allSettings = {};
                    try {
                        if (fs.existsSync(newSettingsPath)) {
                            allSettings = JSON.parse(fs.readFileSync(newSettingsPath, 'utf8'));
                        }
                    } catch (readError) {
                        console.error('[MIGRATION ERROR] Failed to read existing settings:', readError);
                        // Continue with empty settings object
                    }
                    
                    allSettings[firstGuildId] = oldSettings;
                    
                    try {
                        fs.writeFileSync(newSettingsPath, JSON.stringify(allSettings, null, 4));
                        console.log(`[MIGRATION] Migrated settings.json to guildSettings.json for guild ${firstGuildId}`);
                        fs.renameSync(oldSettingsPath, oldSettingsPath + '.migrated');
                    } catch (writeError) {
                        console.error('[MIGRATION ERROR] Failed to write new settings file:', writeError);
                    }
                }
                client.destroy();
            } catch (loginError) {
                console.error('[MIGRATION ERROR] Failed to login for settings migration:', loginError);
            }
        })();
    } catch (e) {
        console.error('[MIGRATION ERROR] Failed to migrate settings.json:', e);
    }
}
// --- END SETTINGS MIGRATION --- 

// Export the client for other modules to use
module.exports = { client };