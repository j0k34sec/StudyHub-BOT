const { prepare, run, get, query } = require('../config/database');
const { addTimer } = require('./roleTimerDB');
const { Client } = require('discord.js');

// Map to store active schedule timeouts
const activeSchedules = new Map();

// Prepared statements for better performance
let addScheduleStmt;
let removeScheduleStmt;
let getUserSchedulesStmt;
let getAllSchedulesStmt;
let updateScheduleStmt;

// Initialize prepared statements
function initPreparedStatements() {
    addScheduleStmt = prepare(`
        INSERT INTO scheduled_study 
        (user_id, guild_id, role_id, start_time, duration_minutes, created_at, is_recurring, day_of_week) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    removeScheduleStmt = prepare(`
        DELETE FROM scheduled_study 
        WHERE id = ?
    `);
    
    getUserSchedulesStmt = prepare(`
        SELECT * FROM scheduled_study 
        WHERE user_id = ? AND guild_id = ?
        ORDER BY start_time ASC
    `);
    
    getAllSchedulesStmt = prepare(`
        SELECT * FROM scheduled_study
        WHERE start_time > ?
        ORDER BY start_time ASC
    `);
    
    updateScheduleStmt = prepare(`
        UPDATE scheduled_study
        SET start_time = ?, duration_minutes = ?, is_recurring = ?, day_of_week = ?
        WHERE id = ?
    `);
}

// Add a new scheduled study session
function addSchedule(userId, guildId, roleId, startTime, durationMinutes, isRecurring = 0, dayOfWeek = null) {
    try {
        const createdAt = Date.now();
        
        // Convert startTime to timestamp if it's a Date object
        const startTimestamp = startTime instanceof Date ? startTime.getTime() : startTime;
        
        // Add to database
        const result = addScheduleStmt.run(
            userId, 
            guildId, 
            roleId, 
            startTimestamp, 
            durationMinutes, 
            createdAt, 
            isRecurring ? 1 : 0, 
            dayOfWeek
        );
        
        const scheduleId = result.lastInsertRowid;
        
        // Set up the timeout
        setupScheduleTimeout({
            id: scheduleId,
            userId,
            guildId,
            roleId,
            startTime: startTimestamp,
            durationMinutes,
            isRecurring: isRecurring ? 1 : 0,
            dayOfWeek
        });
        
        return scheduleId;
    } catch (error) {
        console.error('Error adding scheduled study session to database:', error);
        return null;
    }
}

// Remove a scheduled study session
function removeSchedule(scheduleId) {
    try {
        // Remove from database
        const result = removeScheduleStmt.run(scheduleId);
        
        // Clear the timeout if it exists
        if (activeSchedules.has(scheduleId)) {
            clearTimeout(activeSchedules.get(scheduleId));
            activeSchedules.delete(scheduleId);
        }
        
        return result.changes > 0;
    } catch (error) {
        console.error('Error removing scheduled study session from database:', error);
        return false;
    }
}

// Get all scheduled study sessions for a user in a guild
function getUserSchedules(userId, guildId) {
    try {
        return getUserSchedulesStmt.all(userId, guildId);
    } catch (error) {
        console.error('Error getting user scheduled study sessions from database:', error);
        return [];
    }
}

// Update a scheduled study session
function updateSchedule(scheduleId, startTime, durationMinutes, isRecurring = 0, dayOfWeek = null) {
    try {
        // Convert startTime to timestamp if it's a Date object
        const startTimestamp = startTime instanceof Date ? startTime.getTime() : startTime;
        
        // Update in database
        const result = updateScheduleStmt.run(
            startTimestamp,
            durationMinutes,
            isRecurring ? 1 : 0,
            dayOfWeek,
            scheduleId
        );
        
        // Clear the existing timeout
        if (activeSchedules.has(scheduleId)) {
            clearTimeout(activeSchedules.get(scheduleId));
            activeSchedules.delete(scheduleId);
        }
        
        // Get the updated schedule and set up a new timeout
        const schedule = get(`SELECT * FROM scheduled_study WHERE id = ?`, [scheduleId]);
        if (schedule) {
            setupScheduleTimeout(schedule);
        }
        
        return result.changes > 0;
    } catch (error) {
        console.error('Error updating scheduled study session in database:', error);
        return false;
    }
}

// Set up a timeout for a scheduled study session
function setupScheduleTimeout(schedule) {
    const { id, userId, guildId, roleId, startTime, durationMinutes, isRecurring, dayOfWeek } = schedule;
    
    // Clear any existing timeout
    if (activeSchedules.has(id)) {
        clearTimeout(activeSchedules.get(id));
    }
    
    // Calculate time until start
    const timeUntilStart = startTime - Date.now();
    
    // Only set up a timeout if the start time is in the future
    if (timeUntilStart > 0) {
        const timeout = setTimeout(async () => {
            try {
                // This will be executed when it's time to start the study session
                const client = require('../index.js').client;
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                
                if (guild) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    
                    if (member) {
                        try {
                            // Try to add the role to the member
                            await member.roles.add(roleId);
                            
                            // Add the study role and set up the timer for its removal
                            addTimer(userId, guildId, roleId, durationMinutes);
                            
                            // Try to send a DM to the user
                            try {
                                await member.send(`Your scheduled study session has started. The study role has been automatically added and will be removed after ${durationMinutes} minutes.`);
                            } catch (dmError) {
                                console.error(`Could not send DM to user ${userId}:`, dmError);
                            }
                            
                            console.log(`Started scheduled study session for user ${userId} in guild ${guildId}`);
                        } catch (roleError) {
                            console.error(`Error adding role to user ${userId} in guild ${guildId}:`, roleError);
                            
                            // Check if it's a permissions error
                            if (roleError.code === 50013) { // Missing Permissions
                                try {
                                    await member.send(`I couldn't add the study role for your scheduled session because I don't have the necessary permissions. Please contact a server admin.`);
                                } catch (dmError) {
                                    console.error(`Could not send error DM to user ${userId}:`, dmError);
                                }
                            }
                            
                            // Still set up the next occurrence if it's recurring
                            if (isRecurring) {
                                console.log(`Setting up next occurrence despite role error for user ${userId}`);
                            }
                        }
                    }
                }
                
                // If this is a recurring schedule, set up the next occurrence
                if (isRecurring && dayOfWeek !== null) {
                    const nextOccurrence = calculateNextOccurrence(startTime, dayOfWeek);
                    updateSchedule(id, nextOccurrence, durationMinutes, isRecurring, dayOfWeek);
                } else {
                    // Remove the schedule from storage if it's not recurring
                    removeSchedule(id);
                }
            } catch (error) {
                console.error('Error executing scheduled study session:', error);
            }
        }, timeUntilStart);
        
        activeSchedules.set(id, timeout);
    } else {
        // Start time has already passed
        if (isRecurring && dayOfWeek !== null) {
            // If recurring, calculate the next occurrence
            const nextOccurrence = calculateNextOccurrence(startTime, dayOfWeek);
            updateSchedule(id, nextOccurrence, durationMinutes, isRecurring, dayOfWeek);
        } else {
            // If not recurring and already passed, remove it
            removeSchedule(id);
        }
    }
}

// Calculate the next occurrence for a recurring schedule
function calculateNextOccurrence(lastStartTime, dayOfWeek) {
    const date = new Date(lastStartTime);
    
    if (dayOfWeek === null) {
        // For daily recurring, just add 24 hours
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);
        return nextDate.getTime();
    } else {
        // For weekly recurring
        const currentDay = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // Calculate days to add to get to the next occurrence
        let daysToAdd = dayOfWeek - currentDay;
        if (daysToAdd <= 0) {
            daysToAdd += 7; // Add a week if the day has already passed this week
        }
        
        // Create a new date for the next occurrence
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + daysToAdd);
        
        return nextDate.getTime();
    }
}

// Format a timestamp into a readable date and time
function formatScheduleTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Get day name from day of week number
function getDayName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
}

// Initialize all scheduled study sessions from database
function initializeSchedules() {
    try {
        // Only get schedules that haven't started yet
        const schedules = getAllSchedulesStmt.all(Date.now());
        
        for (const schedule of schedules) {
            setupScheduleTimeout(schedule);
        }
        
        console.log(`Initialized ${schedules.length} scheduled study sessions`);
    } catch (error) {
        console.error('Error initializing scheduled study sessions from database:', error);
    }
}

// Initialize prepared statements
initPreparedStatements();

module.exports = {
    addSchedule,
    removeSchedule,
    getUserSchedules,
    updateSchedule,
    initializeSchedules,
    formatScheduleTime,
    getDayName
};
