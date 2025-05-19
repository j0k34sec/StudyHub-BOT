const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands and their descriptions'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Acknowledge immediately
        const commands = interaction.client.commands;
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📚 Available Commands')
            .setDescription('Here are all the commands you can use:')
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
            
            if (commandName.startsWith('setup') || commandName === 'modsetup') {
                categories['Admin Commands'].push(`\`/${commandName}\` - ${description}`);
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

        await interaction.editReply({ embeds: [embed] });
    }
}; 