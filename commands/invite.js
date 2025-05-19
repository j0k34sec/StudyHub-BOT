const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Invite a user to your private temporary voice channel')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to invite')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.member;
        const targetUser = interaction.options.getUser('user');

        // Check if user is in a voice channel
        if (!member.voice.channel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to use this command!',
                ephemeral: true
            });
        }

        const channel = member.voice.channel;

        // Check if the channel is a temporary voice channel
        const channelData = db.get('SELECT * FROM voice_channels WHERE channel_id = ?', [channel.id]);
        console.log(`[DEBUG] /invite: is_private for channel ${channel.id} =`, channelData ? channelData.is_private : 'not found');
        if (!channelData) {
            return interaction.reply({
                content: '❌ You can only use this command in a temporary voice channel!',
                ephemeral: true
            });
        }

        // Check if the user is the creator or virtual owner
        if (channelData.creator_id !== member.id && channelData.virtual_owner_id !== member.id) {
            return interaction.reply({
                content: '❌ Only the channel creator or virtual owner can invite users!',
                ephemeral: true
            });
        }

        // If public, just send a DM and reply, do not change permissions
        if (!channelData.is_private || channelData.is_private === 0 || channelData.is_private === '0') {
            let dmFailed = false;
            try {
                await targetUser.send(`🔗 <@${member.id}> has invited you to join <#${channel.id}> (**${channel.name}**) in **${channel.guild.name}**`);
            } catch (error) {
                console.log(`Could not send DM to ${targetUser.tag}`);
                dmFailed = true;
            }
            await interaction.reply({
                content: `✅ ${targetUser} has been invited to the channel! (Channel is public, no special permissions needed)`,
                ephemeral: true
            });
            if (dmFailed) {
                await interaction.followUp({
                    content: `⚠️ I couldn't DM ${targetUser}. Please let them know manually if you want them to join!`,
                    ephemeral: false
                });
            }
            return;
        }

        // If private, grant permissions and send DM
        let dmFailed = false;
        try {
            await channel.permissionOverwrites.create(targetUser, {
                ViewChannel: true,
                Connect: true,
                Speak: true
            });
            try {
                await targetUser.send(`🔗 <@${member.id}> has invited you to join <#${channel.id}> (**${channel.name}**) in **${channel.guild.name}**`);
            } catch (error) {
                console.log(`Could not send DM to ${targetUser.tag}`);
                dmFailed = true;
            }
            await interaction.reply({
                content: `✅ ${targetUser} has been invited to the channel!`,
                ephemeral: true
            });
            if (dmFailed) {
                await interaction.followUp({
                    content: `⚠️ I couldn't DM ${targetUser}. Please let them know manually if you want them to join!`,
                    ephemeral: false
                });
            }
        } catch (error) {
            console.error('Error inviting user:', error);
            await interaction.reply({
                content: '❌ There was an error inviting the user. Please try again later.',
                ephemeral: true
            });
        }
    },
};