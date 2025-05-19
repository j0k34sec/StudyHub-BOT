const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const { getSettings } = require('../config/guildSettings');

// Function to load settings for a specific guild
async function loadGuildSettings(guildId) {
    try {
        const settings = getSettings(guildId);
        if (!settings) {
            console.log(`[INFO] No settings found for guild ${guildId}`);
            return {
                creatorVC: null,
                categories: [],
                defaultSettings: {
                    userLimit: 0,
                    bitrate: 64000
                }
            };
        }
        console.log(`[INFO] Loaded settings for guild ${guildId}:`, settings);
        return settings;
    } catch (error) {
        console.error('[ERROR] Failed to load guild settings:', error);
        return {
            creatorVC: null,
            categories: [],
            defaultSettings: {
                userLimit: 0,
                bitrate: 64000
            }
        };
    }
}

// Function to create help embed
function createHelpEmbed(commands, guildId) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📚 Available Commands')
        .setDescription('Here are all the commands you can use in your temporary voice channel:')
        .setTimestamp();

    // Group commands by category
    const categories = {
        'Voice Channel Commands': [],
        'Admin Commands': [],
        'Basic Commands': []
    };

    // Sort commands into categories
    commands.forEach(command => {
        const commandName = command.data.name;
        const description = command.data.description;
        
        // Check if command is available for this guild
        if (command.data.default_member_permissions) {
            const permissions = BigInt(command.data.default_member_permissions);
            if (permissions === PermissionFlagsBits.Administrator) {
                categories['Admin Commands'].push(`\`/${commandName}\` - ${description}`);
            }
        } else if (['rename', 'invite', 'votekick', 'forcemute', 'private'].includes(commandName)) {
            categories['Voice Channel Commands'].push(`\`/${commandName}\` - ${description}`);
        } else {
            categories['Basic Commands'].push(`\`/${commandName}\` - ${description}`);
        }
    });

    // Add fields for each category
    for (const [category, commands] of Object.entries(categories)) {
        if (commands.length > 0) {
            embed.addFields({
                name: category,
                value: commands.join('\n'),
                inline: false
            });
        }
    }

    // Add footer with note about permissions
    embed.setFooter({ 
        text: 'Note: Some commands may require specific permissions to use.' 
    });

    return embed;
}

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const guildId = newState.guild.id;
        let settings;
        try {
            settings = await loadGuildSettings(guildId);
        } catch (error) {
            console.error('[ERROR] Could not load settings in voiceStateUpdate:', error);
            return;
        }

        // Handle user joining or switching to the creator channel
        if (newState.channelId === settings.creatorVC) {
            let newChannel;
            try {
                newChannel = await newState.guild.channels.create({
                name: `${newState.member.displayName}'s Channel`,
                type: ChannelType.GuildVoice,
                parent: settings.categories[0] || null, // Use first category if available
                userLimit: settings.defaultSettings.userLimit,
                    bitrate: settings.defaultSettings.bitrate
                });
            } catch (error) {
                console.error('[ERROR] Failed to create tempVC:', error, 'Guild:', guildId, 'User:', newState.member.id);
                return;
            }

            try {
                await newChannel.permissionOverwrites.edit(newState.member.id, {
                    ManageChannels: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });
            } catch (error) {
                console.error('[ERROR] Failed to set creator permissions on tempVC:', error, 'Channel:', newChannel.id, 'User:', newState.member.id);
            }

            // Insert the guild into the database first (to satisfy foreign key constraint)
            try {
                db.run(
                    `INSERT OR IGNORE INTO guilds (guild_id, created_at) VALUES (?, ?)`,
                    [guildId, Date.now()]
                );
            } catch (err) {
                console.error('[ERROR] Failed to insert guild into SQLite (event handler):', err, 'Guild:', guildId);
            }

            // Insert the new tempVC into the database
            try {
                db.run(
                    `INSERT INTO voice_channels (
                        channel_id, guild_id, creator_id, creator_username,
                        channel_name, virtual_owner_id, virtual_owner_username,
                        created_at, category_id, is_private, user_limit, bitrate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newChannel.id,
                        guildId,
                        newState.member.id,
                        newState.member.user.username,
                        newChannel.name,
                        newState.member.id,
                        newState.member.user.username,
                        Date.now(),
                        newChannel.parentId,
                        0, // is_private
                        newChannel.userLimit || 0,
                        newChannel.bitrate || 64000
                    ]
                );
                console.log('Inserted new temp VC into SQLite (event handler):', newChannel.id);
            } catch (err) {
                console.error('[ERROR] Failed to insert temp VC into SQLite (event handler):', err, 'Channel:', newChannel.id);
            }

            try {
            await newState.setChannel(newChannel);
            } catch (error) {
                console.error('[ERROR] Failed to move user to new tempVC:', error, 'User:', newState.member.id, 'Channel:', newChannel.id);
            }

            // Register the temp VC in client.tempVCs
            try {
            if (newState.client && newState.client.tempVCs) {
                newState.client.tempVCs.set(newChannel.id, {
                    creatorId: newState.member.id,
                    createdAt: Date.now(),
                        categoryId: newChannel.parentId,
                        guildId: guildId
                });
            }
            } catch (error) {
                console.error('[ERROR] Failed to register tempVC in tempVCs map:', error, 'Channel:', newChannel.id);
            }

            // Send help command information to the channel
            try {
                const helpEmbed = createHelpEmbed(newState.client.commands, guildId);
                await newState.guild.channels.cache.get(newState.channelId).send({
                    content: `🎉 Welcome to your new temporary voice channel, ${newState.member}! Here are the commands you can use:`,
                    embeds: [helpEmbed]
                });
            } catch (error) {
                console.error('[ERROR] Failed to send help message:', error);
            }

            console.log(`Created temporary voice channel: ${newChannel.name} for user ${newState.member.user.tag} in guild ${guildId}`);
        }

        // Handle channel deletion when empty
        if (oldState.channelId && !newState.channelId) {
            const channel = oldState.channel;
            try {
            if (channel && channel.members.size === 0) {
                    const channelData = db.get('SELECT * FROM voice_channels WHERE channel_id = ?', [channel.id]);
                    if (channelData && channelData.guild_id === guildId) {
                    await channel.delete();
                        console.log(`Deleted temporary voice channel: ${channel.name} in guild ${guildId}`);
                    }
                }
            } catch (error) {
                console.error('[ERROR] Failed to delete empty tempVC:', error, 'Channel:', channel ? channel.id : 'unknown');
            }
        }
    }
}; 