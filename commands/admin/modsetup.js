const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { isOwner } = require('../../utils/adminCheck');

// Function to save moderators to JSON
async function saveModerators(moderators) {
    const modPath = path.join(__dirname, '..', '..', 'moderators.json');
    await fs.writeFile(modPath, JSON.stringify(moderators, null, 4));
}

// Function to load moderators from JSON
async function loadModerators() {
    const modPath = path.join(__dirname, '..', '..', 'moderators.json');
    try {
        const data = await fs.readFile(modPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { roles: [], users: [] };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modsetup')
        .setDescription('Manage bot moderators (Owner only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a moderator role or user')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to add as moderator'))
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to add as moderator')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a moderator role or user')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to remove from moderators'))
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to remove from moderators')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all moderators')),

    async execute(interaction) {
        // Check if the user is the owner
        if (!await isOwner(interaction.member)) {
            return interaction.reply({
                content: '❌ This command can only be used by the server owner!',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const moderators = await loadModerators();

        switch (subcommand) {
            case 'add': {
                const role = interaction.options.getRole('role');
                const user = interaction.options.getUser('user');

                if (!role && !user) {
                    return interaction.reply({
                        content: '❌ Please specify either a role or a user to add as moderator!',
                        ephemeral: true
                    });
                }

                if (role) {
                    if (moderators.roles.includes(role.id)) {
                        return interaction.reply({
                            content: `❌ ${role} is already a moderator!`,
                            ephemeral: true
                        });
                    }
                    moderators.roles.push(role.id);
                }

                if (user) {
                    if (moderators.users.includes(user.id)) {
                        return interaction.reply({
                            content: `❌ ${user} is already a moderator!`,
                            ephemeral: true
                        });
                    }
                    moderators.users.push(user.id);
                }

                await saveModerators(moderators);

                const addedItems = [];
                if (role) addedItems.push(role.toString());
                if (user) addedItems.push(user.toString());

                await interaction.reply({
                    content: `✅ Added ${addedItems.join(' and ')} as moderator(s)!`,
                    ephemeral: true
                });
                break;
            }

            case 'remove': {
                const role = interaction.options.getRole('role');
                const user = interaction.options.getUser('user');

                if (!role && !user) {
                    return interaction.reply({
                        content: '❌ Please specify either a role or a user to remove from moderators!',
                        ephemeral: true
                    });
                }

                let removed = false;

                if (role) {
                    const roleIndex = moderators.roles.indexOf(role.id);
                    if (roleIndex === -1) {
                        return interaction.reply({
                            content: `❌ ${role} is not a moderator!`,
                            ephemeral: true
                        });
                    }
                    moderators.roles.splice(roleIndex, 1);
                    removed = true;
                }

                if (user) {
                    const userIndex = moderators.users.indexOf(user.id);
                    if (userIndex === -1) {
                        return interaction.reply({
                            content: `❌ ${user} is not a moderator!`,
                            ephemeral: true
                        });
                    }
                    moderators.users.splice(userIndex, 1);
                    removed = true;
                }

                if (removed) {
                    await saveModerators(moderators);
                }

                const removedItems = [];
                if (role) removedItems.push(role.toString());
                if (user) removedItems.push(user.toString());

                await interaction.reply({
                    content: `✅ Removed ${removedItems.join(' and ')} from moderators!`,
                    ephemeral: true
                });
                break;
            }

            case 'list': {
                let response = '📋 **Current Moderators**\n\n';

                if (moderators.roles.length === 0 && moderators.users.length === 0) {
                    response += 'No moderators configured.';
                } else {
                    if (moderators.roles.length > 0) {
                        response += '**Roles:**\n';
                        for (const roleId of moderators.roles) {
                            const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
                            if (role) {
                                response += `• ${role}\n`;
                            }
                        }
                        response += '\n';
                    }

                    if (moderators.users.length > 0) {
                        response += '**Users:**\n';
                        for (const userId of moderators.users) {
                            const user = await interaction.guild.members.fetch(userId).catch(() => null);
                            if (user) {
                                response += `• ${user}\n`;
                            }
                        }
                    }
                }

                await interaction.reply({
                    content: response,
                    ephemeral: true
                });
                break;
            }
        }
    },
}; 