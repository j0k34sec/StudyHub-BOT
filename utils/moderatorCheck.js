const fs = require('fs').promises;
const path = require('path');

async function loadModerators() {
    const modPath = path.join(__dirname, '..', 'moderators.json');
    try {
        const data = await fs.readFile(modPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { roles: [], users: [] };
    }
}

async function isModerator(member) {
    // Server owner is always a moderator
    if (member.id === member.guild.ownerId) return true;

    const moderators = await loadModerators();

    // Check if user is in moderator list
    if (moderators.users.includes(member.id)) return true;

    // Check if user has any moderator roles
    const memberRoles = member.roles.cache.map(role => role.id);
    return moderators.roles.some(roleId => memberRoles.includes(roleId));
}

module.exports = { isModerator }; 