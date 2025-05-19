const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getStudyRoleId } = require('../config/studyConfig');
const { addTimer, removeTimer, formatTime } = require('../utils/roleTimerDB');
const { addSchedule, getUserSchedules, removeSchedule, formatScheduleTime } = require('../utils/studyScheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('study')
        .setDescription('Toggle your study role')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle your study role on/off'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('timer')
                .setDescription('Set a timed study session')
                .addIntegerOption(option =>
                    option.setName('minutes')
                        .setDescription('Duration in minutes (max 1440)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('Schedule a future study session')
                .addStringOption(option =>
                    option.setName('start_time')
                        .setDescription('Start time (HH:MM in 24-hour format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('end_time')
                        .setDescription('End time (HH:MM in 24-hour format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('recurring')
                        .setDescription('Should this session repeat daily?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Yes', value: 'y' },
                            { name: 'No', value: 'n' }
                        ))),

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
                // If no subcommand was provided, default to 'toggle'
                console.log('No subcommand specified, defaulting to toggle');
                subcommand = 'toggle';
            }
            
            // Get the role ID from the config for this guild
            const roleId = getStudyRoleId(interaction.guild.id);
            
            if (!roleId) {
                return interaction.editReply({
                    content: '❌ No role has been configured for the /study command in this server yet. Ask a moderator to set it up.'
                });
            }
            
            const member = interaction.member;
            
            // Get the role object
            const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
            
            if (!role) {
                return interaction.editReply({
                    content: '❌ The configured role could not be found. Please contact a moderator.'
                });
            }
            
            // Check if the member has the role
            const hasRole = member.roles.cache.has(roleId);
            
            if (subcommand === 'toggle') {
                if (hasRole) {
                    try {
                        // Remove the role if they already have it
                        await member.roles.remove(roleId);
                        
                        // Remove any timer for this role
                        removeTimer(member.id, interaction.guild.id);
                        
                        await interaction.editReply({
                            content: `The "${role.name}" role has been removed. You now have access to all channels again.`
                        });
                    } catch (error) {
                        console.error('Error removing role:', error);
                        if (error.code === 50013) { // Missing Permissions
                            await interaction.editReply({
                                content: '❌ I don\'t have permission to remove roles. Please ask a server admin to check my permissions.'
                            });
                        } else {
                            await interaction.editReply({
                                content: '❌ There was an error removing the role. Please try again later.'
                            });
                        }
                    }
                } else {
                    // Add the role if they don't have it
                    try {
                        await member.roles.add(roleId);
                    } catch (error) {
                        console.error('Error adding role:', error);
                        if (error.code === 50013) { // Missing Permissions
                            return interaction.editReply({
                                content: `❌ I don't have permission to add the "${role.name}" role. Please make sure I have the "Manage Roles" permission and my role is higher than the study role in the server settings.`
                            });
                        } else {
                            console.error('Error adding role:', error);
                            return interaction.editReply({
                                content: 'There was an error adding the role. Please try again later.'
                            });
                        }
                    }
                    
                    // Check if the user is in a voice channel
                    if (member.voice.channel) {
                        // Store the channel name for the message
                        const channelName = member.voice.channel.name;
                        
                        // Disconnect the user from the voice channel
                        await member.voice.disconnect(
                            'Disconnected due to study role restrictions'
                        );
                        
                        await interaction.editReply({
                            content: `The "${role.name}" role has been added. You have been disconnected from the voice channel "${channelName}" due to study role restrictions. This role restricts access to certain channels to help you focus on studying.`
                        });
                    } else {
                        await interaction.editReply({
                            content: `The "${role.name}" role has been added. This role restricts access to certain channels to help you focus on studying.`
                        });
                    }
                }
            } else if (subcommand === 'timer') {
                // Get the minutes input from the command
                let minutes = interaction.options.getInteger('minutes');
                
                // Validate the input
                if (minutes <= 0) {
                    return interaction.editReply({
                        content: '❌ Invalid input. Please enter a positive number of minutes.'
                    });
                }
                
                // Cap at 24 hours (1440 minutes)
                if (minutes > 1440) {
                    minutes = 1440;
                    await interaction.editReply({
                        content: '⚠️ The maximum duration is 24 hours (1440 minutes). Setting duration to 24 hours.'
                    });
                }
                
                if (hasRole) {
                    // If they already have the role, just update the timer
                    removeTimer(member.id, interaction.guild.id);
                    const expiresAt = addTimer(member.id, interaction.guild.id, roleId, minutes);
                    const formattedTime = formatTime(minutes * 60 * 1000);
                    
                    await interaction.editReply({
                        content: `The timer for your "${role.name}" role has been updated. The role will be automatically removed after ${formattedTime}.`
                    });
                } else {
                    // Add the role if they don't have it
                    try {
                        await member.roles.add(roleId);
                    } catch (error) {
                        if (error.code === 50013) { // Missing Permissions
                            return interaction.editReply({
                                content: `❌ I don't have permission to add the "${role.name}" role. Please make sure I have the "Manage Roles" permission and my role is higher than the study role in the server settings.`
                            });
                        } else {
                            console.error('Error adding role:', error);
                            return interaction.editReply({
                                content: 'There was an error adding the role. Please try again later.'
                            });
                        }
                    }
                    
                    // Set up the timer
                    const expiresAt = addTimer(member.id, interaction.guild.id, roleId, minutes);
                    const formattedTime = formatTime(minutes * 60 * 1000);
                    const timerMessage = `The role will be automatically removed after ${formattedTime}.`;
                    
                    // Check if the user is in a voice channel
                    if (member.voice.channel) {
                        // Store the channel name for the message
                        const channelName = member.voice.channel.name;
                        
                        // Disconnect the user from the voice channel
                        await member.voice.disconnect(
                            'Disconnected due to study role restrictions'
                        );
                        
                        await interaction.editReply({
                            content: `The "${role.name}" role has been added. ${timerMessage} You have been disconnected from the voice channel "${channelName}" due to study role restrictions. This role restricts access to certain channels to help you focus on studying.`
                        });
                    } else {
                        await interaction.editReply({
                            content: `The "${role.name}" role has been added. ${timerMessage} This role restricts access to certain channels to help you focus on studying.`
                        });
                    }
                }
            } else if (subcommand === 'schedule') {
                // Get the inputs from the command
                const startTimeStr = interaction.options.getString('start_time');
                const endTimeStr = interaction.options.getString('end_time');
                const recurringStr = interaction.options.getString('recurring');
                
                // Parse start and end times
                const [startHours, startMinutes] = startTimeStr.split(':').map(num => parseInt(num));
                const [endHours, endMinutes] = endTimeStr.split(':').map(num => parseInt(num));
                
                // Validate time format
                if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes)) {
                    return interaction.editReply({
                        content: '❌ Invalid time format. Please use HH:MM in 24-hour format.'
                    });
                }
                
                // Validate time ranges
                if (startHours < 0 || startHours > 23 || startMinutes < 0 || startMinutes > 59 ||
                    endHours < 0 || endHours > 23 || endMinutes < 0 || endMinutes > 59) {
                    return interaction.editReply({
                        content: '❌ Invalid time values. Hours must be 0-23 and minutes must be 0-59.'
                    });
                }
                
                // Create Date objects for today with the specified times
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                
                const startDate = new Date(today);
                startDate.setHours(startHours, startMinutes, 0, 0);
                
                const endDate = new Date(today);
                endDate.setHours(endHours, endMinutes, 0, 0);
                
                // If end time is earlier than start time, assume it's for the next day
                if (endDate < startDate) {
                    endDate.setDate(endDate.getDate() + 1);
                }
                
                // Calculate duration in minutes
                const durationMs = endDate.getTime() - startDate.getTime();
                const durationMinutes = Math.round(durationMs / (60 * 1000));
                
                // Validate the duration
                if (durationMinutes <= 0) {
                    return interaction.editReply({
                        content: '❌ The end time must be after the start time.'
                    });
                }
                
                // Cap at 24 hours (1440 minutes)
                let duration = durationMinutes;
                if (duration > 1440) {
                    duration = 1440;
                    await interaction.editReply({
                        content: '⚠️ The maximum duration is 24 hours (1440 minutes). Adjusting accordingly.'
                    });
                }
                
                // If the start time for today has already passed, schedule for tomorrow
                if (startDate.getTime() <= now.getTime()) {
                    startDate.setDate(startDate.getDate() + 1);
                    endDate.setDate(endDate.getDate() + 1);
                }
                
                // Parse recurring option
                const isRecurring = recurringStr === 'y';
                
                // Add the schedule to the database
                const scheduleId = addSchedule(
                    interaction.user.id,
                    interaction.guild.id,
                    roleId,
                    startDate.getTime(),
                    duration,
                    isRecurring,
                    null // No day of week needed for daily recurring
                );
                
                if (!scheduleId) {
                    return interaction.editReply({
                        content: '❌ Failed to schedule the study session. Please try again.'
                    });
                }
                
                // Format the response message
                const formattedStartTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const formattedEndTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const recurringText = isRecurring ? ' This is a recurring session that will repeat daily.' : '';
                
                return interaction.editReply({
                    content: `✅ Study session scheduled from ${formattedStartTime} to ${formattedEndTime}.${recurringText}\n\nThe study role will be automatically added at ${formattedStartTime} and removed at ${formattedEndTime}.`
                });
            }
        } catch (error) {
            console.error('Error executing study command:', error);
            
            try {
                // Check if we've already replied or deferred
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ 
                        content: 'There was an error executing this command. Please try again later.'
                    }).catch(() => {});
                } else {
                    await interaction.reply({ 
                        content: 'There was an error executing this command. Please try again later.', 
                        flags: 1 << 6 // Using flags instead of ephemeral
                    }).catch(() => {});
                }
            } catch (replyError) {
                // We've tried our best, just log the error
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};
