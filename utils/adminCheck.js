const { PermissionFlagsBits } = require('discord.js');
const { isModerator } = require('./moderatorCheck');

async function isAdmin(member) {
    // Check if user has Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    // Check if user is a moderator
    return await isModerator(member);
}

async function isOwner(member) {
    return member.id === member.guild.ownerId;
}

module.exports = { isAdmin, isOwner }; 