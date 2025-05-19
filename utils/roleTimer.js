const fs = require('fs');
const path = require('path');

// Path to store the role timers
const timersPath = path.join(__dirname, '..', 'data', 'roleTimers.json');

// Map to store active timeouts in memory
const activeTimeouts = new Map();

// Initialize the timers file if it doesn't exist
function ensureTimersFile() {
    try {
        if (!fs.existsSync(timersPath)) {
            const dirPath = path.dirname(timersPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(timersPath, JSON.stringify({ timers: [] }, null, 2));
        }
    } catch (error) {
        console.error('Error creating role timers file:', error);
    }
}

// Load all timers from the file
function loadTimers() {
    ensureTimersFile();
    try {
        const data = fs.readFileSync(timersPath, 'utf8');
        return JSON.parse(data).timers || [];
    } catch (error) {
        console.error('Error loading role timers:', error);
        return [];
    }
}

// Save timers to the file
function saveTimers(timers) {
    ensureTimersFile();
    try {
        fs.writeFileSync(timersPath, JSON.stringify({ timers }, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving role timers:', error);
        return false;
    }
}

// Add a new timer
function addTimer(userId, guildId, roleId, durationMinutes) {
    const timers = loadTimers();
    
    // Remove any existing timer for this user in this guild
    const filteredTimers = timers.filter(
        timer => !(timer.userId === userId && timer.guildId === guildId)
    );
    
    // Calculate expiration time
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    
    // Add the new timer
    const newTimer = {
        userId,
        guildId,
        roleId,
        expiresAt
    };
    
    filteredTimers.push(newTimer);
    saveTimers(filteredTimers);
    
    // Set up the timeout in memory
    setupTimeout(newTimer);
    
    return expiresAt;
}

// Remove a timer
function removeTimer(userId, guildId) {
    const timers = loadTimers();
    
    // Find and remove the timer
    const filteredTimers = timers.filter(
        timer => !(timer.userId === userId && timer.guildId === guildId)
    );
    
    // If we found and removed a timer
    if (filteredTimers.length < timers.length) {
        saveTimers(filteredTimers);
        
        // Clear the timeout if it exists
        const timeoutKey = `${userId}-${guildId}`;
        if (activeTimeouts.has(timeoutKey)) {
            clearTimeout(activeTimeouts.get(timeoutKey));
            activeTimeouts.delete(timeoutKey);
        }
        
        return true;
    }
    
    return false;
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

// Initialize all timers from storage when the bot starts
function initializeTimers() {
    const timers = loadTimers();
    
    for (const timer of timers) {
        setupTimeout(timer);
    }
    
    console.log(`Initialized ${timers.length} role timers`);
}

// Get the remaining time for a user's timer (in milliseconds)
function getRemainingTime(userId, guildId) {
    const timers = loadTimers();
    
    const timer = timers.find(
        t => t.userId === userId && t.guildId === guildId
    );
    
    if (timer) {
        const remaining = timer.expiresAt - Date.now();
        return remaining > 0 ? remaining : 0;
    }
    
    return 0;
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

module.exports = {
    addTimer,
    removeTimer,
    initializeTimers,
    getRemainingTime,
    formatTime
};
