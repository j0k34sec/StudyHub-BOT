const { SlashCommandBuilder } = require('discord.js');

// Store rename cooldowns
const renameCooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename your temporary voice channel')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The new name for your channel')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.member;
        const newName = interaction.options.getString('name');

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
                content: '❌ You can only rename temporary voice channels!',
                ephemeral: true
            });
        }

        // Check if the user is the creator of the channel
        const channelInfo = interaction.client.tempVCs.get(channel.id);
        if (channelInfo.creatorId !== member.id) {
            return interaction.reply({
                content: '❌ You can only rename channels that you created!',
                ephemeral: true
            });
        }

        // Check cooldown
        const now = Date.now();
        const userCooldown = renameCooldowns.get(member.id) || { count: 0, lastReset: now };
        
        // Reset count if 15 minutes have passed
        if (now - userCooldown.lastReset > 15 * 60 * 1000) {
            userCooldown.count = 0;
            userCooldown.lastReset = now;
        }

        // Check if user has exceeded rename limit
        if (userCooldown.count >= 2) {
            const timeLeft = Math.ceil((userCooldown.lastReset + 15 * 60 * 1000 - now) / 1000 / 60);
            return interaction.reply({
                content: `❌ You can only rename your channel 2 times per 15 minutes. Please wait ${timeLeft} minutes.`,
                ephemeral: true
            });
        }

        try {
            // Update channel name
            await channel.setName(newName);
            
            // Update cooldown
            userCooldown.count++;
            renameCooldowns.set(member.id, userCooldown);

            // Calculate remaining renames
            const remainingRenames = 2 - userCooldown.count;
            const timeUntilReset = Math.ceil((userCooldown.lastReset + 15 * 60 * 1000 - now) / 1000 / 60);

            await interaction.reply({
                content: `✅ Channel renamed to "${newName}"!\nYou have ${remainingRenames} rename${remainingRenames !== 1 ? 's' : ''} left in the next ${timeUntilReset} minutes.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error renaming channel:', error);
            await interaction.reply({
                content: '❌ There was an error renaming your channel. Please try again later.',
                ephemeral: true
            });
        }
    },
}; 