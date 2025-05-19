const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // We only handle modal submissions here that are NOT related to study functionality
        // Study functionality is now handled directly in the study.js command
        
        // If there are other modal submissions or interactions you need to handle,
        // you can add them here
    },
};
