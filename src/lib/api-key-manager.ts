// API Key Manager with fallback to mock implementation
// Uses better-sqlite3 in production, mock implementation in development

let ApiKeyManagerClass: any;

try {
  // Try to import better-sqlite3 (works in production)
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  ApiKeyManagerClass = class ApiKeyManager {
    private db: any;
    private dbPath: string;

    constructor(dbPath?: string) {
      this.dbPath = dbPath || path.join(process.cwd(), 'api_keys.db');
      this.initializeDatabase();
    }

    private initializeDatabase() {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      
      // Create tables if they don't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          key TEXT UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used DATETIME,
          usage_count INTEGER DEFAULT 0
        )
      `);

      // Create default API key if none exists
      const existingKeys = this.db.prepare('SELECT COUNT(*) as count FROM api_keys').get();
      if (existingKeys.count === 0) {
        this.createApiKey('Default API Key', 'default-key-12345');
      }
    }

    createApiKey(name: string, key?: string): any {
      const apiKey = key || this.generateApiKey();
      
      const stmt = this.db.prepare(`
        INSERT INTO api_keys (name, key, is_active, created_at, usage_count)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP, 0)
      `);
      
      const result = stmt.run(name, apiKey);
      
      return {
        id: result.lastInsertRowid,
        name,
        key: apiKey,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        usageCount: 0
      };
    }

    private generateApiKey(): string {
      return 'api_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    validateApiKey(key: string): boolean {
      const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1');
      const apiKey = stmt.get(key);
      
      if (!apiKey) {
        return false;
      }
      
      // Update usage stats
      const updateStmt = this.db.prepare(`
        UPDATE api_keys 
        SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1 
        WHERE key = ?
      `);
      updateStmt.run(key);
      
      return true;
    }

    getAllApiKeys(): any[] {
      const stmt = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC');
      return stmt.all();
    }

    updateApiKey(id: number, updates: any): any {
      const setClause = Object.keys(updates)
        .map(key => `${key} = ?`)
        .join(', ');
      
      const values = Object.values(updates);
      values.push(id);
      
      const stmt = this.db.prepare(`UPDATE api_keys SET ${setClause} WHERE id = ?`);
      const result = stmt.run(...values);
      
      if (result.changes > 0) {
        const selectStmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
        return selectStmt.get(id);
      }
      
      return null;
    }

    deleteApiKey(id: number): boolean {
      const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    }

    getApiKeyById(id: number): any {
      const stmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
      return stmt.get(id);
    }

    getUsageStats(): any[] {
      const stmt = this.db.prepare(`
        SELECT 
          name,
          SUBSTR(key, 1, 20) || '...' as key,
          usage_count as total_requests,
          last_used,
          created_at,
          is_active
        FROM api_keys 
        ORDER BY usage_count DESC
      `);
      return stmt.all();
    }

    close() {
      if (this.db) {
        this.db.close();
      }
    }
  };
} catch (error) {
  // Fallback to mock implementation if better-sqlite3 is not available
  console.log('Using mock API Key Manager (better-sqlite3 not available)');
  
  ApiKeyManagerClass = class ApiKeyManager {
    private apiKeys: Map<string, any> = new Map();
    private nextId = 1;

    constructor() {
      // Initialize with a default API key for testing
      this.createApiKey('Default API Key', 'default-key-12345');
    }

    createApiKey(name: string, key?: string): any {
      const apiKey = {
        id: this.nextId++,
        name,
        key: key || this.generateApiKey(),
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        usageCount: 0
      };
      
      this.apiKeys.set(apiKey.key, apiKey);
      return apiKey;
    }

    private generateApiKey(): string {
      return 'api_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    validateApiKey(key: string): boolean {
      const apiKey = this.apiKeys.get(key);
      if (!apiKey || !apiKey.isActive) {
        return false;
      }
      
      // Update usage stats
      apiKey.lastUsed = new Date().toISOString();
      apiKey.usageCount++;
      this.apiKeys.set(key, apiKey);
      
      return true;
    }

    getAllApiKeys(): any[] {
      return Array.from(this.apiKeys.values());
    }

    updateApiKey(id: number, updates: any): any {
      for (const [key, apiKey] of Array.from(this.apiKeys.entries())) {
        if (apiKey.id === id) {
          const updated = { ...apiKey, ...updates };
          this.apiKeys.set(key, updated);
          return updated;
        }
      }
      return null;
    }

    deleteApiKey(id: number): boolean {
      for (const [key, apiKey] of Array.from(this.apiKeys.entries())) {
        if (apiKey.id === id) {
          this.apiKeys.delete(key);
          return true;
        }
      }
      return false;
    }

    getApiKeyById(id: number): any {
      for (const apiKey of Array.from(this.apiKeys.values())) {
        if (apiKey.id === id) {
          return apiKey;
        }
      }
      return null;
    }

    getUsageStats(): any[] {
      return Array.from(this.apiKeys.values()).map(key => ({
        name: key.name,
        key: key.key.substring(0, 20) + '...',
        total_requests: key.usageCount,
        last_used: key.lastUsed,
        created_at: key.createdAt,
        is_active: key.isActive
      }));
    }
  };
}

export { ApiKeyManagerClass as ApiKeyManager };