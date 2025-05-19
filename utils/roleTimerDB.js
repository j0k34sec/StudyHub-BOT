const path = require('path');
const { db, prepare, run, get, query } = require('../config/database');

// Initialize the role timers table in the database
function initRoleTimersTable() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS role_timers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, guild_id)
            )
        `);
        console.log('Role timers table initialized successfully');
    } catch (error) {
        console.error('Failed to initialize role timers table:', error);
    }
}

// Map to store active timeouts in memory
const activeTimeouts = new Map();

// Prepared statements for better performance
let addTimerStmt;
let removeTimerStmt;
let getTimerStmt;
let getAllTimersStmt;

// Initialize prepared statements
function initPreparedStatements() {
    addTimerStmt = prepare(`
        INSERT OR REPLACE INTO role_timers 
        (user_id, guild_id, role_id, expires_at, created_at) 
        VALUES (?, ?, ?, ?, ?)
    `);
    
    removeTimerStmt = prepare(`
        DELETE FROM role_timers 
        WHERE user_id = ? AND guild_id = ?
    `);
    
    getTimerStmt = prepare(`
        SELECT * FROM role_timers 
        WHERE user_id = ? AND guild_id = ?
    `);
    
    getAllTimersStmt = prepare(`
        SELECT * FROM role_timers
    `);
}

// Add a new timer
function addTimer(userId, guildId, roleId, durationMinutes) {
    // Calculate expiration time
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    const createdAt = Date.now();
    
    try {
        // Add to database
        addTimerStmt.run(userId, guildId, roleId, expiresAt, createdAt);
        
        // Set up the timeout in memory
        setupTimeout({
            userId,
            guildId,
            roleId,
            expiresAt
        });
        
        return expiresAt;
    } catch (error) {
        console.error('Error adding role timer to database:', error);
        return null;
    }
}

// Remove a timer
function removeTimer(userId, guildId) {
    try {
        // Remove from database
        const result = removeTimerStmt.run(userId, guildId);
        
        // Clear the timeout if it exists
        const timeoutKey = `${userId}-${guildId}`;
        if (activeTimeouts.has(timeoutKey)) {
            clearTimeout(activeTimeouts.get(timeoutKey));
            activeTimeouts.delete(timeoutKey);
        }
        
        return result.changes > 0;
    } catch (error) {
        console.error('Error removing role timer from database:', error);
        return false;
    }
}

// Set up a timeout for a timer
function setupTimeout(timer) {
    const { userId, guildId, roleId, expiresAt } = timer;
    const timeoutKey = `${userId}-${guildId}`;
    
    // Clear any existing timeout
    if (activeTimeouts.has(timeoutKey)) {
        clearTimeout(activeTimeouts.get(timeoutKey));
    }
    
    // Calculate time until expiration
    const timeUntilExpiry = expiresAt - Date.now();
    
    // Only set up a timeout if the timer hasn't already expired
    if (timeUntilExpiry > 0) {
        const timeout = setTimeout(async () => {
            try {
                // This will be executed when the timer expires
                const client = require('../index.js').client;
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                
                if (guild) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    
                    if (member && member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId);
                        console.log(`Removed role ${roleId} from user ${userId} in guild ${guildId} due to timer expiration`);
                        
                        // Try to send a DM to the user
                        try {
                            await member.send(`Your study time has ended. The study role has been automatically removed.`);
                        } catch (dmError) {
                            console.error(`Could not send DM to user ${userId}:`, dmError);
                        }
                    }
                }
                
                // Remove the timer from storage
                removeTimer(userId, guildId);
            } catch (error) {
                console.error('Error executing role timer:', error);
            }
        }, timeUntilExpiry);
        
        activeTimeouts.set(timeoutKey, timeout);
    } else {
        // Timer has already expired, remove it
        removeTimer(userId, guildId);
    }
}

// Initialize all timers from database when the bot starts
function initializeTimers() {
    try {
        const timers = getAllTimersStmt.all();
        
        for (const timer of timers) {
            setupTimeout(timer);
        }
        
        console.log(`Initialized ${timers.length} role timers from database`);
    } catch (error) {
        console.error('Error initializing timers from database:', error);
    }
}

// Get the remaining time for a user's timer (in milliseconds)
function getRemainingTime(userId, guildId) {
    try {
        const timer = getTimerStmt.get(userId, guildId);
        
        if (timer) {
            const remaining = timer.expires_at - Date.now();
            return remaining > 0 ? remaining : 0;
        }
        
        return 0;
    } catch (error) {
        console.error('Error getting remaining time from database:', error);
        return 0;
    }
}

// Format milliseconds into a human-readable string
function formatTime(milliseconds) {
    if (milliseconds <= 0) return "0 minutes";
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours} hour${hours > 1 ? 's' : ''}${remainingMinutes > 0 ? ` and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : ''}`;
    } else {
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
}

// Initialize the database table and prepared statements
initRoleTimersTable();
initPreparedStatements();

module.exports = {
    addTimer,
    removeTimer,
    initializeTimers,
    getRemainingTime,
    formatTime
};
