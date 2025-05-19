const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forcemute')
        .setDescription('Force mute or unmute all members in your temporary voice channel (virtual owner only)')
        .addBooleanOption(option =>
            option.setName('mute')
                .setDescription('Set to true to mute, false to unmute')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.member;
        const channel = member.voice.channel;
        const mute = interaction.options.getBoolean('mute');

        // Check if user is in a voice channel
        if (!channel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to use this command!',
                ephemeral: true
            });
        }

        // Check if the channel is a temporary voice channel
        const channelData = db.get('SELECT * FROM voice_channels WHERE channel_id = ?', [channel.id]);
        if (!channelData) {
            return interaction.reply({
                content: '❌ You can only use this command in a temporary voice channel!',
                ephemeral: true
            });
        }

        // Check if the user is the virtual owner
        if (member.id !== channelData.virtual_owner_id) {
            return interaction.reply({
                content: '❌ Only the virtual owner of this channel can use this command!',
                ephemeral: true
            });
        }

        // Mute or unmute all members except the virtual owner
        let affectedCount = 0;
        for (const [id, m] of channel.members) {
            if (id !== member.id && m.voice.serverMute !== mute) {
                try {
                    await m.voice.setMute(mute, mute ? 'Force muted by virtual owner' : 'Force unmuted by virtual owner');
                    affectedCount++;
                } catch (error) {
                    console.error(`[ERROR] Failed to ${mute ? 'mute' : 'unmute'} member ${id} in channel ${channel.id}:`, error);
                }
            }
        }

        await interaction.reply({
            content: mute
                ? `🔇 Force muted ${affectedCount} member(s) in this channel.`
                : `🔊 Force unmuted ${affectedCount} member(s) in this channel.`,
            ephemeral: true
        });
    },
}; 