const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '..', 'guildSettings.json');

function loadAllSettings() {
    if (!fs.existsSync(settingsPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
        console.error('[ERROR] Failed to load guildSettings.json:', e);
        return {};
    }
}

function saveAllSettings(allSettings) {
    fs.writeFileSync(settingsPath, JSON.stringify(allSettings, null, 4));
}

function getSettings(guildId) {
    const all = loadAllSettings();
    return all[guildId] || null;
}

function setSettings(guildId, settings) {
    const all = loadAllSettings();
    all[guildId] = settings;
    saveAllSettings(all);
}

module.exports = {
    getSettings,
    setSettings,
    loadAllSettings,
    saveAllSettings
}; 