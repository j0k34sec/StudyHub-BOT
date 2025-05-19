const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserSchedules, removeSchedule, formatScheduleTime } = require('../utils/studyScheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('studyschedule')
        .setDescription('Manage your scheduled study sessions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your scheduled study sessions'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel a scheduled study session')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The ID of the schedule to cancel')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            // Check if the interaction has already been acknowledged
            if (interaction.replied || interaction.deferred) {
                console.log('Interaction already acknowledged, skipping deferReply');
            } else {
                // Defer the reply with ephemeral flag to make it only visible to the user
                await interaction.deferReply({ flags: 1 << 6 }); // Using flags instead of ephemeral (1 << 6 is the EPHEMERAL flag)
            }
            
            // Check if a subcommand was provided
            let subcommand;
            try {
                subcommand = interaction.options.getSubcommand();
            } catch (error) {
                // If no subcommand was provided, default to 'list'
                console.log('No subcommand specified for studyschedule, defaulting to list');
                subcommand = 'list';
            }
            
            if (subcommand === 'list') {
                // Get user's scheduled sessions
                const schedules = getUserSchedules(interaction.user.id, interaction.guild.id);
                
                if (schedules.length === 0) {
                    return interaction.editReply({
                        content: '📅 You have no scheduled study sessions.'
                    });
                }
                
                // Create an embed to display the schedules
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Your Scheduled Study Sessions')
                    .setDescription('Here are your upcoming study sessions:')
                    .setTimestamp()
                    .setFooter({ text: 'Study Schedule Manager' });
                
                // Add each schedule to the embed
                schedules.forEach(schedule => {
                    const startTime = new Date(schedule.start_time);
                    const endTime = new Date(startTime.getTime() + (schedule.duration_minutes * 60 * 1000));
                    
                    const formattedStartTime = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const formattedEndTime = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const formattedDate = startTime.toLocaleDateString();
                    
                    const isRecurring = schedule.is_recurring === 1 ? '🔄 Daily recurring' : '1️⃣ One-time';
                    
                    embed.addFields({
                        name: `ID: ${schedule.id} - ${formattedDate}`,
                        value: `⏰ **Time**: ${formattedStartTime} to ${formattedEndTime}\n📝 **Type**: ${isRecurring}\n\nTo cancel this schedule, use: \`/studyschedule cancel id:${schedule.id}\``
                    });
                });
                
                return interaction.editReply({
                    embeds: [embed]
                });
                
            } else if (subcommand === 'cancel') {
                const scheduleId = interaction.options.getInteger('id');
                
                // Get user's scheduled sessions to verify ownership
                const schedules = getUserSchedules(interaction.user.id, interaction.guild.id);
                const schedule = schedules.find(s => s.id === scheduleId);
                
                if (!schedule) {
                    return interaction.editReply({
                        content: '❌ No schedule found with that ID, or you do not have permission to cancel it.'
                    });
                }
                
                // Remove the schedule
                const success = removeSchedule(scheduleId);
                
                if (success) {
                    return interaction.editReply({
                        content: '✅ Your scheduled study session has been cancelled successfully.'
                    });
                } else {
                    return interaction.editReply({
                        content: '❌ Failed to cancel the study session. Please try again.'
                    });
                }
            }
            
        } catch (error) {
            console.error('Error executing studyschedule command:', error);
            
            try {
                // Check if we've already replied or deferred
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ 
                        content: 'There was an error managing your study schedules. Please try again later.'
                    }).catch(() => {});
                } else {
                    await interaction.reply({ 
                        content: 'There was an error managing your study schedules. Please try again later.', 
                        flags: 1 << 6 // Using flags instead of ephemeral
                    }).catch(() => {});
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};
