const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { getSettings, setSettings } = require('../../config/guildSettings');

// Function to save settings to JSON
async function saveSettings(settings) {
    const settingsPath = path.join(__dirname, '..', 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 4));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupjoin')
        .setDescription('Admin command to manage temporary voice channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // This makes the command admin-only
        .addSubcommand(subcommand =>
            subcommand
                .setName('init')
                .setDescription('[Admin] Initialize the join-to-create system')
                .addChannelOption(option =>
                    option.setName('join_channel')
                        .setDescription('The voice channel where users will join to create temporary channels')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_category')
                .setDescription('[Admin] Add a category for temporary channels')
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('The category to add for temporary channels')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Maximum number of channels in this category (0 for unlimited)')
                        .setMinValue(0)
                        .setMaxValue(50)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_category')
                .setDescription('[Admin] Remove a category from the temporary channel system')
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('The category to remove')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('[Admin] List current join-to-create configuration')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        let settings = getSettings(guildId) || {
            creatorVC: null,
            categories: [],
            defaultSettings: {
                userLimit: 0,
                bitrate: 64000
            }
        };

        // Double-check admin permissions (extra security)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ This command can only be used by administrators!',
                ephemeral: true
            });
        }

        // Check if the bot has necessary permissions
        const botMember = interaction.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.MoveMembers
        ];

        const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
        if (missingPermissions.length > 0) {
            return interaction.reply({
                content: `❌ I'm missing the following permissions: ${missingPermissions.join(', ')}. Please grant these permissions to use this command.`,
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'init': {
                const joinChannel = interaction.options.getChannel('join_channel');

                // Check if setup already exists
                if (settings.creatorVC) {
                    const existingChannel = await interaction.guild.channels.fetch(settings.creatorVC).catch(() => null);
                    if (existingChannel) {
                        return interaction.reply({
                            content: `❌ A join-to-create channel is already set up at ${existingChannel}. Please remove it first before creating a new one.`,
                            ephemeral: true
                        });
                    }
                }

                // Update settings
                settings.creatorVC = joinChannel.id;
                setSettings(guildId, settings);

                await interaction.reply({
                    content: `✅ Join-to-create system initialized!\nJoin Channel: ${joinChannel}\n\nUse \`/setupjoin add_category\` to add categories for temporary channels.`,
                    ephemeral: true
                });
                break;
            }

            case 'add_category': {
                const category = interaction.options.getChannel('category');
                const limit = interaction.options.getInteger('limit');

                // Check if join channel is set up
                if (!settings.creatorVC) {
                    return interaction.reply({
                        content: '❌ Please initialize the join-to-create system first using `/setupjoin init`!',
                        ephemeral: true
                    });
                }

                // Check if category already exists
                if (settings.categories.includes(category.id)) {
                    return interaction.reply({
                        content: `❌ ${category} is already configured as a temporary channel category!`,
                        ephemeral: true
                    });
                }

                // Add new category
                settings.categories.push(category.id);
                setSettings(guildId, settings);

                await interaction.reply({
                    content: `✅ Added ${category} as a temporary channel category with a limit of ${limit === 0 ? 'unlimited' : limit} channels!`,
                    ephemeral: true
                });
                break;
            }

            case 'remove_category': {
                const category = interaction.options.getChannel('category');

                // Check if category exists
                const categoryIndex = settings.categories.indexOf(category.id);
                if (categoryIndex === -1) {
                    return interaction.reply({
                        content: `❌ ${category} is not configured as a temporary channel category!`,
                        ephemeral: true
                    });
                }

                // Remove category
                settings.categories.splice(categoryIndex, 1);
                setSettings(guildId, settings);

                await interaction.reply({
                    content: `✅ Removed ${category} from temporary channel categories!`,
                    ephemeral: true
                });
                break;
            }

            case 'list': {
                if (!settings.creatorVC) {
                    return interaction.reply({
                        content: '❌ Join-to-create system is not initialized! Use `/setupjoin init` to set it up.',
                        ephemeral: true
                    });
                }

                const joinChannel = await interaction.guild.channels.fetch(settings.creatorVC).catch(() => null);
                if (!joinChannel) {
                    return interaction.reply({
                        content: '❌ The configured join channel no longer exists! Please reinitialize the system.',
                        ephemeral: true
                    });
                }

                let response = `📋 Current Join-to-Create Configuration:\n\nJoin Channel: ${joinChannel}\n\nCategories:\n`;
                
                if (settings.categories.length === 0) {
                    response += 'No categories configured. Use `/setupjoin add_category` to add categories.';
                } else {
                    for (const [index, categoryId] of settings.categories.entries()) {
                        const categoryChannel = await interaction.guild.channels.fetch(categoryId).catch(() => null);
                        if (categoryChannel) {
                            response += `${index + 1}. ${categoryChannel}\n`;
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