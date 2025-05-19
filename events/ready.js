const { EmbedBuilder } = require('discord.js');
const { getSettings } = require('../config/guildSettings');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}!`);

        // Get the first guild (server) the bot is in
        const guild = client.guilds.cache.first();
        if (!guild) return;

        // Send initial message
        const channel = guild.systemChannel || guild.channels.cache.find(ch => ch.type === 0); // 0 is GUILD_TEXT
        if (!channel) return;

        // Send "I'm alive" message
        const aliveMsg = await channel.send('👋 Hello! I am alive now!');
        
        // Send loading message
        const loadingMsg = await channel.send('⏳ Checking configuration...');

        // Load settings from guildSettings.json
        const settings = getSettings(guild.id) || {
            creatorVC: null,
            categories: [],
            defaultSettings: {
                userLimit: 0,
                bitrate: 64000
            }
        };

        // Check creator VC
        let creatorVCStatus = '❌ Not set';
        if (settings.creatorVC) {
            const creatorVC = await guild.channels.fetch(settings.creatorVC).catch(() => null);
            if (creatorVC) {
                creatorVCStatus = `✅ ${creatorVC.name}`;
            } else {
                creatorVCStatus = '❌ Channel not found';
            }
        }

        // Check categories
        const categoryStatuses = [];
        if (settings.categories && settings.categories.length > 0) {
            for (const categoryId of settings.categories) {
                const category = await guild.channels.fetch(categoryId).catch(() => null);
                if (category) {
                    categoryStatuses.push(`✅ ${category.name}`);
                } else {
                    categoryStatuses.push(`❌ Category not found (ID: ${categoryId})`);
                }
            }
        } else {
            categoryStatuses.push('❌ No categories configured');
        }

        // Create status embed
        const statusEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎙️ Voice Channel System Status')
            .setDescription('Configuration check results:')
            .addFields(
                { name: 'Creator Voice Channel', value: creatorVCStatus },
                { name: 'Categories', value: categoryStatuses.join('\n') || 'None' }
            )
            .setFooter({ text: 'Use /setupjoin commands to configure the system' });

        // Delete loading message and send status
        await loadingMsg.delete();
        await channel.send({ embeds: [statusEmbed] });

        // If there are issues, send setup instructions
        if (creatorVCStatus.startsWith('❌') || categoryStatuses.some(status => status.startsWith('❌'))) {
            const setupEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Setup Required')
                .setDescription('Some configuration is missing or invalid. Please use these commands to set up the system:')
                .addFields(
                    { name: '1. Initialize System', value: '`/setupjoin init` - Set up the join-to-create channel' },
                    { name: '2. Add Categories', value: '`/setupjoin add_category` - Add categories for temporary channels' },
                    { name: '3. Check Status', value: '`/setupjoin list` - View current configuration' }
                );

            await channel.send({ embeds: [setupEmbed] });
        }
    },
}; 