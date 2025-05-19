const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('private')
        .setDescription('Make your temporary voice channel private or public')
        .addBooleanOption(option =>
            option.setName('private')
                .setDescription('Set to true to make private, false to make public')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.member;
        const makePrivate = interaction.options.getBoolean('private');

        // Check if user is in a voice channel
        if (!member.voice.channel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to use this command!',
                ephemeral: true
            });
        }

        const channel = member.voice.channel;

        // Check if the channel is a temporary voice channel
        if (!interaction.client.tempVCs.has(channel.id)) {
            return interaction.reply({
                content: '❌ You can only use this command in your temporary voice channel!',
                ephemeral: true
            });
        }

        // Check if the user is the creator of the channel
        const channelInfo = interaction.client.tempVCs.get(channel.id);
        if (channelInfo.creatorId !== member.id) {
            return interaction.reply({
                content: '❌ You can only use this command in a channel you created!',
                ephemeral: true
            });
        }

        try {
            if (makePrivate) {
                // Deny @everyone from connecting
                await channel.permissionOverwrites.edit(channel.guild.id, {
                    Connect: false
                });

                // Ensure creator always has connect permission
                await channel.permissionOverwrites.create(member, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    ManageChannels: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });

                // Grant Connect permission to all current members (except creator/virtual owner)
                for (const [memberId, m] of channel.members) {
                    if (memberId !== member.id) {
                        await channel.permissionOverwrites.create(m, {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        });
                    }
                }

                // Update database to mark channel as private
                db.run('UPDATE voice_channels SET is_private = 1 WHERE channel_id = ?', [channel.id]);
                // Debug log: fetch and print the value
                const updated = db.get('SELECT is_private FROM voice_channels WHERE channel_id = ?', [channel.id]);
                console.log(`[DEBUG] After /private: is_private for channel ${channel.id} =`, updated ? updated.is_private : 'not found');

                await interaction.reply({
                    content: '🔒 Your channel is now private! Only you and current members can join.',
                    ephemeral: true
                });
            } else {
                // Allow @everyone to connect
                await channel.permissionOverwrites.edit(channel.guild.id, {
                    Connect: true
                });

                // Keep creator's permissions
                await channel.permissionOverwrites.create(member, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    ManageChannels: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });

                // Optionally: Remove explicit Connect permissions for other users (cleanup)
                for (const [memberId, m] of channel.members) {
                    if (memberId !== member.id) {
                        try {
                            await channel.permissionOverwrites.delete(m);
                        } catch (e) {
                            // Ignore if no overwrite exists
                        }
                    }
                }

                // Update database to mark channel as public
                db.run('UPDATE voice_channels SET is_private = 0 WHERE channel_id = ?', [channel.id]);
                // Debug log: fetch and print the value
                const updatedPub = db.get('SELECT is_private FROM voice_channels WHERE channel_id = ?', [channel.id]);
                console.log(`[DEBUG] After /private: is_private for channel ${channel.id} =`, updatedPub ? updatedPub.is_private : 'not found');

                await interaction.reply({
                    content: '🌐 Your channel is now public! Anyone can join.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error updating channel privacy:', error);
            await interaction.reply({
                content: '❌ There was an error updating your channel privacy. Please try again later.',
                ephemeral: true
            });
        }
    },
}; 