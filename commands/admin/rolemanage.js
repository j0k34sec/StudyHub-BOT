const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isModerator } = require('../../utils/moderatorCheck');
const { setStudyRoleId, getStudyRoleId } = require('../../config/studyConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolemanage')
        .setDescription('Moderator command to set the role used by the /study command')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set which role will be used by the /study command')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to be used by the /study command')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View which role is currently being used by the /study command')),

    async execute(interaction) {
        // Check if the user is a moderator
        if (!(await isModerator(interaction.member))) {
            return interaction.reply({
                content: '❌ This command can only be used by moderators!',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set': {
                    const role = interaction.options.getRole('role');
                    
                    if (!role) {
                        return interaction.reply({
                            content: '❌ Invalid role selected.',
                            ephemeral: true
                        });
                    }
                    
                    // Save the role ID to the config for this guild
                    setStudyRoleId(interaction.guild.id, role.id);
                    
                    await interaction.reply({
                        content: `✅ Successfully set "${role.name}" (ID: ${role.id}) as the role for the /study command.`,
                        ephemeral: true
                    });
                    break;
                }
                
                case 'view': {
                    // Get the current role ID from config for this guild
                    const currentRoleId = getStudyRoleId(interaction.guild.id);
                    
                    if (!currentRoleId) {
                        return interaction.reply({
                            content: '❌ No role has been configured for the /study command in this server yet. Use `/rolemanage set` to set a role.',
                            ephemeral: true
                        });
                    }
                    
                    const currentRole = await interaction.guild.roles.fetch(currentRoleId).catch(() => null);
                    
                    if (!currentRole) {
                        return interaction.reply({
                            content: `❌ The currently configured role (ID: ${currentRoleId}) could not be found in this server. Use \`/rolemanage set\` to set a new role.`,
                            ephemeral: true
                        });
                    }
                    
                    await interaction.reply({
                        content: `📝 The /study command is currently using the "${currentRole.name}" role (ID: ${currentRole.id}).`,
                        ephemeral: true
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Error managing study role:', error);
            await interaction.reply({
                content: '❌ There was an error managing the study role. Please try again later.',
                ephemeral: true
            });
        }
    },
};
