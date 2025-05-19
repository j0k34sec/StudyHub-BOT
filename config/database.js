const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create/connect to SQLite database with proper configuration
const db = new Database(path.join(dataDir, 'tempvc.db'), {
    verbose: null, // Disable verbose logging
    fileMustExist: false // Create file if it doesn't exist
});

// Enable foreign keys and WAL mode for better performance and reliability
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize database tables
function initDatabase() {
    try {
        // Create voice channels table with proper constraints
    db.exec(`
        CREATE TABLE IF NOT EXISTS voice_channels (
            channel_id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            creator_id TEXT NOT NULL,
                creator_username TEXT NOT NULL,
                channel_name TEXT NOT NULL,
                virtual_owner_id TEXT,
                virtual_owner_username TEXT,
            created_at INTEGER NOT NULL,
            category_id TEXT,
            is_private INTEGER DEFAULT 0,
            user_limit INTEGER DEFAULT 0,
                bitrate INTEGER DEFAULT 64000,
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `);

        // Create guilds table for referential integrity
        db.exec(`
            CREATE TABLE IF NOT EXISTS guilds (
                guild_id TEXT PRIMARY KEY,
                join_channel_id TEXT,
                created_at INTEGER NOT NULL
        )
    `);
        
        // Create role timers table for study mode feature
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
        
        // Create scheduled study sessions table
        db.exec(`
            CREATE TABLE IF NOT EXISTS scheduled_study (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                duration_minutes INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                is_recurring INTEGER DEFAULT 0,
                day_of_week INTEGER DEFAULT NULL,
                UNIQUE(user_id, guild_id, start_time)
            )
        `);

    console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database initialization fails
    }
}

// Initialize database
initDatabase();

// Export database instance with helper methods
module.exports = {
    db,
    
    // Helper method for running transactions
    transaction: (callback) => {
        const transaction = db.transaction(callback);
        return transaction();
    },
    
    // Helper method for preparing statements
    prepare: (sql) => {
        return db.prepare(sql);
    },
    
    // Helper method for running queries
    query: (sql, params = []) => {
        try {
            return db.prepare(sql).all(params);
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    },
    
    // Helper method for running single row queries
    get: (sql, params = []) => {
        try {
            return db.prepare(sql).get(params);
        } catch (error) {
            console.error('Database get error:', error);
            throw error;
        }
    },
    
    // Helper method for running insert/update/delete operations
    run: (sql, params = []) => {
        try {
            return db.prepare(sql).run(params);
        } catch (error) {
            console.error('Database run error:', error);
            throw error;
        }
    }
};