const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'data', 'studyConfig.json');

// Default configuration
const defaultConfig = {
    // Store roles by guild ID
    guilds: {}
};

// Ensure the config file exists and migrate if needed
function ensureConfigFile() {
    try {
        if (!fs.existsSync(configPath)) {
            const dirPath = path.dirname(configPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        } else {
            // Check if we need to migrate from old format to new format
            const rawData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(rawData);
            
            // If the old format has a direct roleId property (not inside guilds)
            if (config.roleId && !config.guilds) {
                console.log('Migrating studyConfig.json from old format to new format');
                const newConfig = {
                    guilds: {}
                };
                
                // We don't know which guild this was for, so we'll just store it temporarily
                newConfig._legacyRoleId = config.roleId;
                
                // Save the new format
                fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
            }
        }
    } catch (error) {
        console.error('Error creating/migrating study config file:', error);
    }
}

// Get all config
function getAllConfig() {
    ensureConfigFile();
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error('Error reading study config:', error);
        return defaultConfig;
    }
}

// Save all config
function saveAllConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving study config:', error);
        return false;
    }
}

// Get the current role ID for a specific guild
function getStudyRoleId(guildId) {
    if (!guildId) {
        console.error('Error: Guild ID is required');
        return null;
    }
    
    const config = getAllConfig();
    
    // First check if this guild has a configured role
    if (config.guilds && config.guilds[guildId] && config.guilds[guildId].roleId) {
        return config.guilds[guildId].roleId;
    }
    
    // If not, check if we have a legacy role ID that we can use
    if (config._legacyRoleId) {
        // Migrate the legacy role ID to this guild
        console.log(`Migrating legacy role ID to guild ${guildId}`);
        setStudyRoleId(guildId, config._legacyRoleId);
        
        // Remove the legacy role ID now that we've migrated it
        const updatedConfig = getAllConfig();
        delete updatedConfig._legacyRoleId;
        saveAllConfig(updatedConfig);
        
        return config._legacyRoleId;
    }
    
    // No role configured for this guild
    return null;
}

// Set a new role ID for a specific guild
function setStudyRoleId(guildId, roleId) {
    if (!guildId) {
        console.error('Error: Guild ID is required');
        return false;
    }
    
    const config = getAllConfig();
    
    // Make sure guilds object exists
    if (!config.guilds) {
        config.guilds = {};
    }
    
    // Initialize guild config if it doesn't exist
    if (!config.guilds[guildId]) {
        config.guilds[guildId] = {};
    }
    
    config.guilds[guildId].roleId = roleId;
    return saveAllConfig(config);
}

module.exports = {
    getStudyRoleId,
    setStudyRoleId
};
