const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../config/database');

// Store active vote kicks
const activeVoteKicks = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('votekick')
        .setDescription('Kick a user from the voice channel (immediate for virtual owner, vote for others)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration of the vote in seconds (optional, default: 30)')
                .setMinValue(10)
                .setMaxValue(60)
                .setRequired(false)),

    async execute(interaction) {
        const member = interaction.member;
        const targetUser = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration') || 30;

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
        if (!channelData) {
            return interaction.reply({
                content: '❌ You can only use this command in a temporary voice channel!',
                ephemeral: true
            });
        }

        // Check if target is in the same voice channel
        const targetMember = channel.members.get(targetUser.id);
        if (!targetMember) {
            return interaction.reply({
                content: '❌ The target user must be in the same voice channel!',
                ephemeral: true
            });
        }

        // Check if user is trying to kick the virtual owner
        if (targetUser.id === channelData.virtual_owner_id) {
            return interaction.reply({
                content: '❌ You cannot kick the virtual owner of the channel!',
                ephemeral: true
            });
        }

        // Check if the command user is the virtual owner
        if (member.id === channelData.virtual_owner_id) {
            // Virtual owner can kick immediately
            try {
                await targetMember.voice.disconnect();
                await interaction.reply({
                    content: `👢 ${targetUser} has been kicked from the channel by the virtual owner.`
                });
            } catch (error) {
                console.error('Error kicking user:', error);
                await interaction.reply({
                    content: `❌ Failed to kick ${targetUser}. They may have left the channel.`,
                    ephemeral: true
                });
            }
            return;
        }

        // For non-virtual owners, start a vote kick
        // Check if there's already an active vote kick
        if (activeVoteKicks.has(channel.id)) {
            return interaction.reply({
                content: '❌ There is already an active vote kick in this channel!',
                ephemeral: true
            });
        }

        // Get channel members excluding the target
        const eligibleVoters = channel.members.filter(m => m.id !== targetUser.id).size;
        if (eligibleVoters < 2) {
            return interaction.reply({
                content: '❌ You need at least 2 other members in the channel to start a vote kick!',
                ephemeral: true
            });
        }

        // Calculate required votes (50% of eligible voters, rounded up)
        const requiredVotes = Math.ceil(eligibleVoters * 0.5);

        // Create vote kick object
        const voteKick = {
            targetId: targetUser.id,
            initiatorId: member.id,
            votes: new Set([member.id]), // Initiator automatically votes yes
            requiredVotes: requiredVotes,
            channelId: channel.id,
            message: null,
            timeout: null
        };

        // Store the vote kick
        activeVoteKicks.set(channel.id, voteKick);

        // Create vote message with optional duration display
        const voteMessage = await interaction.reply({
            content: `🗳️ Vote Kick Started!\n` +
                    `Target: ${targetUser}\n` +
                    `Required Votes: ${requiredVotes}/${eligibleVoters}\n` +
                    (interaction.options.getInteger('duration') ? `Duration: ${duration} seconds\n\n` : '\n') +
                    `React with ✅ to vote kick\n` +
                    `React with ❌ to vote no\n\n` +
                    `Votes: 1/${requiredVotes}`,
            fetchReply: true
        });

        // Add reactions
        await voteMessage.react('✅');
        await voteMessage.react('❌');

        // Store the message
        voteKick.message = voteMessage;

        // Create reaction collector
        const filter = (reaction, user) => {
            const member = channel.members.get(user.id);
            return ['✅', '❌'].includes(reaction.emoji.name) && member && user.id !== targetUser.id;
        };

        const collector = voteMessage.createReactionCollector({ filter, time: duration * 1000 });

        collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '✅') {
                voteKick.votes.add(user.id);
            } else if (reaction.emoji.name === '❌') {
                voteKick.votes.delete(user.id);
            }

            // Update vote count with optional duration display
            const currentVotes = voteKick.votes.size;
            voteMessage.edit({
                content: `🗳️ Vote Kick Started!\n` +
                        `Target: ${targetUser}\n` +
                        `Required Votes: ${requiredVotes}/${eligibleVoters}\n` +
                        (interaction.options.getInteger('duration') ? `Duration: ${duration} seconds\n\n` : '\n') +
                        `React with ✅ to vote kick\n` +
                        `React with ❌ to vote no\n\n` +
                        `Votes: ${currentVotes}/${requiredVotes}`
            });

            // Check if enough votes
            if (currentVotes >= requiredVotes) {
                collector.stop('success');
            }
        });

        collector.on('end', async (collected, reason) => {
            const voteKick = activeVoteKicks.get(channel.id);
            if (!voteKick) return;

            if (reason === 'success') {
                // Kick the user
                try {
                    await targetMember.voice.disconnect();
                    await voteMessage.edit({
                        content: `✅ Vote Kick Successful!\n` +
                                `${targetUser} has been kicked from the channel.`
                    });
                } catch (error) {
                    console.error('Error kicking user:', error);
                    await voteMessage.edit({
                        content: `❌ Failed to kick ${targetUser}. They may have left the channel.`
                    });
                }
            } else {
                await voteMessage.edit({
                    content: `❌ Vote Kick Failed!\n` +
                            `Not enough votes to kick ${targetUser}.`
                });
            }

            // Clean up
            activeVoteKicks.delete(channel.id);
        });
    },
}; 