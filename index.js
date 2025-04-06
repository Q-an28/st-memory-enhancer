// Memory Enhancer Plugin for Silly Tavern
// By Vinfon

import { Database } from 'sql.js';
import { NER } from './modules/ner.js';
import { PrivacyManager } from './modules/privacy.js';
import { VectorStorage } from './modules/vector.js';

// Main plugin class
class MemoryEnhancer {
    constructor() {
        this.db = null;
        this.cache = {};
        this.nerProcessor = null;
        this.vectorStorage = null;
        this.privacyManager = null;
        this.settings = {
            enabled: true,
            autoExtract: true,
            contextWindow: 10,
            privacyEnabled: false,
            encryptionKey: '',
            relationshipTracking: true,
            hierarchicalMemory: true,
            memoryDepth: 3,
            sentimentAnalysis: true
        };
        this.userProfile = {
            basicInfo: {},
            preferences: {},
            background: {}
        };
        this.extractedEntities = [];
        this.relationships = {};
    }

    // Initialize the plugin
    async init() {
        console.log('Memory Enhancer initializing...');
        try {
            // Initialize database
            const SQL = await initSqlJs();
            this.db = new SQL.Database();
            this.createTables();
            
            // Initialize modules
            this.nerProcessor = new NER();
            this.vectorStorage = new VectorStorage();
            this.privacyManager = new PrivacyManager(this.settings.encryptionKey);
            
            // Load settings
            await this.loadSettings();
            
            // Load user profile
            await this.loadUserProfile();
            
            // Register message handlers
            this.registerEventListeners();
            
            console.log('Memory Enhancer initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Memory Enhancer:', error);
            return false;
        }
    }
    
    // Create necessary database tables
    createTables() {
        // User profile table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Extracted entities table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_value TEXT NOT NULL,
                context TEXT,
                message_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                confidence REAL DEFAULT 1.0
            );
        `);
        
        // Relationships table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY,
                entity1_id INTEGER,
                entity2_id INTEGER,
                relationship_type TEXT,
                strength REAL DEFAULT 0.5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entity1_id) REFERENCES entities(id),
                FOREIGN KEY (entity2_id) REFERENCES entities(id)
            );
        `);
        
        // Vector emotions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vector_emotions (
                id INTEGER PRIMARY KEY,
                entity_id INTEGER,
                vector BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entity_id) REFERENCES entities(id)
            );
        `);
    }
    
    // Load settings from SillyTavern
    async loadSettings() {
        const savedSettings = await extension_settings.memory_enhancer;
        if (savedSettings) {
            this.settings = { ...this.settings, ...savedSettings };
        }
    }
    
    // Save settings to SillyTavern
    async saveSettings() {
        extension_settings.memory_enhancer = this.settings;
    }
    
    // Load user profile from database
    async loadUserProfile() {
        const result = this.db.exec(`
            SELECT category, key, value FROM user_profile
            ORDER BY category, key
        `);
        
        if (result && result.length > 0) {
            const rows = result[0].values;
            for (const [category, key, value] of rows) {
                if (!this.userProfile[category]) {
                    this.userProfile[category] = {};
                }
                this.userProfile[category][key] = this.settings.privacyEnabled ? 
                    this.privacyManager.decrypt(value) : value;
            }
        }
    }
    
    // Save user profile to database
    async saveUserProfile() {
        // Begin transaction
        this.db.exec('BEGIN TRANSACTION');
        
        try {
            // Clear existing profile data
            this.db.exec('DELETE FROM user_profile');
            
            // Insert new profile data
            for (const category in this.userProfile) {
                for (const key in this.userProfile[category]) {
                    const value = this.settings.privacyEnabled ? 
                        this.privacyManager.encrypt(this.userProfile[category][key]) : 
                        this.userProfile[category][key];
                    
                    this.db.exec(`
                        INSERT INTO user_profile (category, key, value)
                        VALUES ('${category}', '${key}', '${value}')
                    `);
                }
            }
            
            // Commit transaction
            this.db.exec('COMMIT');
            return true;
        } catch (error) {
            // Rollback on error
            this.db.exec('ROLLBACK');
            console.error('Error saving user profile:', error);
            return false;
        }
    }
    
    // Extract entities from a message
    async extractEntities(message) {
        if (!this.settings.autoExtract) return [];
        
        const entities = await this.nerProcessor.extractEntities(message);
        
        // Store entities in database
        for (const entity of entities) {
            const stmt = this.db.prepare(`
                INSERT INTO entities (entity_type, entity_value, context, message_id)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run([entity.type, entity.value, message.text, message.id]);
            stmt.free();
            
            this.extractedEntities.push(entity);
        }
        
        return entities;
    }
    
    // Update relationship between entities
    updateRelationship(entity1, entity2, type, strength) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO relationships (entity1_id, entity2_id, relationship_type, strength, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run([entity1.id, entity2.id, type, strength]);
        stmt.free();
        
        // Update in-memory cache
        const key = `${entity1.id}:${entity2.id}`;
        this.relationships[key] = { type, strength };
    }
    
    // Get relevant memories for the current context
    getRelevantMemories(context) {
        // Implement hierarchical retrieval logic here
        // 1. Check cache first
        // 2. Query vector storage for emotional/semantic matches
        // 3. Fall back to SQL queries for factual data
        
        const relevantMemories = [];
        
        // Example implementation
        const entities = this.nerProcessor.quickExtract(context);
        
        for (const entity of entities) {
            // Look up in cache
            if (this.cache[entity.value]) {
                relevantMemories.push({
                    source: 'cache',
                    entity: entity.value,
                    data: this.cache[entity.value]
                });
                continue;
            }
            
            // Look up in vector storage
            const vectorMatches = this.vectorStorage.findSimilar(entity.value, 0.7);
            for (const match of vectorMatches) {
                relevantMemories.push({
                    source: 'vector',
                    entity: entity.value,
                    data: match
                });
            }
            
            // Look up in SQL database
            const stmt = this.db.prepare(`
                SELECT e.*, r.relationship_type, r.strength 
                FROM entities e
                LEFT JOIN relationships r ON e.id = r.entity1_id OR e.id = r.entity2_id
                WHERE e.entity_value LIKE ?
                ORDER BY e.created_at DESC
                LIMIT 5
            `);
            const results = stmt.get([`%${entity.value}%`]);
            stmt.free();
            
            if (results) {
                relevantMemories.push({
                    source: 'database',
                    entity: entity.value,
                    data: results
                });
            }
        }
        
        return relevantMemories;
    }
    
    // Register event listeners
    registerEventListeners() {
        // Listen for new messages
        eventSource.addEventListener('message', async (event) => {
            if (!this.settings.enabled) return;
            
            const message = event.detail;
            
            // Extract entities
            if (this.settings.autoExtract) {
                const entities = await this.extractEntities(message);
                
                // Update cache
                for (const entity of entities) {
                    this.cache[entity.value] = {
                        type: entity.type,
                        lastSeen: new Date(),
                        context: message.text
                    };
                }
            }
        });
        
        // Listen for context update requests
        eventSource.addEventListener('requestChatContext', (event) => {
            if (!this.settings.enabled) return;
            
            const context = event.detail;
            const memories = this.getRelevantMemories(context);
            
            if (memories.length > 0) {
                // Format memories as context entries
                const memoryContext = memories.map(memory => {
                    return {
                        role: 'system',
                        content: `Memory: ${memory.entity} - ${JSON.stringify(memory.data)}`
                    };
                });
                
                // Add to context
                event.detail.context.push(...memoryContext);
            }
        });
    }
    
    // Clean up resources when plugin is unloaded
    async unload() {
        // Save any unsaved data
        await this.saveSettings();
        await this.saveUserProfile();
        
        // Close database connection
        if (this.db) {
            this.db.close();
        }
        
        // Clean up event listeners
        eventSource.removeEventListener('message');
        eventSource.removeEventListener('requestChatContext');
        
        console.log('Memory Enhancer unloaded');
        return true;
    }
}

// Plugin interface for Silly Tavern
const memoryEnhancer = new MemoryEnhancer();

// Register plugin with Silly Tavern
window.memoryEnhancerPlugin = {
    name: 'Memory Enhancer',
    
    async init() {
        return await memoryEnhancer.init();
    },
    
    async unload() {
        return await memoryEnhancer.unload();
    },
    
    async onSettingsChange(newSettings) {
        memoryEnhancer.settings = { ...memoryEnhancer.settings, ...newSettings };
        await memoryEnhancer.saveSettings();
    }
};
