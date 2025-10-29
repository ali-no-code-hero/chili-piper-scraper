import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface ApiKey {
  id: number;
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
}

export class ApiKeyManager {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || path.join(dataDir, 'api_keys.db');
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Create API keys table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        usage_count INTEGER DEFAULT 0
      )
    `);

    // Create usage logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_id INTEGER,
        endpoint TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        response_time INTEGER,
        success BOOLEAN,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (api_key_id) REFERENCES api_keys (id)
      )
    `);

    // Insert default admin key if none exist
    const existingKeys = this.db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
    if (existingKeys.count === 0) {
      this.createApiKey('admin', 'Default Admin Key', 'Initial admin key for system access');
    }
  }

  generateApiKey(): string {
    const prefix = process.env.API_KEY_PREFIX || 'cp_live';
    const randomPart = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
    return `${prefix}_${randomPart}`;
  }

  createApiKey(name: string, description?: string, customKey?: string): ApiKey {
    const key = customKey || this.generateApiKey();
    
    const stmt = this.db.prepare(`
      INSERT INTO api_keys (key, name, description)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(key, name, description || '');
    
    return this.getApiKeyById(result.lastInsertRowid as number)!;
  }

  getApiKeyById(id: number): ApiKey | null {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
    return stmt.get(id) as ApiKey | null;
  }

  getApiKeyByKey(key: string): ApiKey | null {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key = ?');
    return stmt.get(key) as ApiKey | null;
  }

  getAllApiKeys(): ApiKey[] {
    const stmt = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC');
    return stmt.all() as ApiKey[];
  }

  updateApiKey(id: number, updates: Partial<ApiKey>): ApiKey | null {
    const allowedFields = ['name', 'description', 'is_active'];
    const updateFields = Object.keys(updates).filter(field => allowedFields.includes(field));
    
    if (updateFields.length === 0) return null;

    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const values = updateFields.map(field => updates[field as keyof ApiKey]);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE api_keys SET ${setClause} WHERE id = ?`);
    stmt.run(...values);

    return this.getApiKeyById(id);
  }

  deleteApiKey(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  recordUsage(apiKeyId: number, endpoint: string, ipAddress?: string, userAgent?: string, responseTime?: number, success?: boolean, errorMessage?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO api_usage_logs (api_key_id, endpoint, ip_address, user_agent, response_time, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(apiKeyId, endpoint, ipAddress, userAgent, responseTime, success ? 1 : 0, errorMessage);

    // Update usage count and last used timestamp
    const updateStmt = this.db.prepare(`
      UPDATE api_keys 
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    updateStmt.run(apiKeyId);
  }

  getUsageStats(apiKeyId?: number): any[] {
    let query = `
      SELECT 
        ak.name,
        ak.key,
        COUNT(aul.id) as total_requests,
        AVG(aul.response_time) as avg_response_time,
        SUM(CASE WHEN aul.success = 1 THEN 1 ELSE 0 END) as successful_requests,
        MAX(aul.created_at) as last_request
      FROM api_keys ak
      LEFT JOIN api_usage_logs aul ON ak.id = aul.api_key_id
    `;
    
    if (apiKeyId) {
      query += ' WHERE ak.id = ?';
      const stmt = this.db.prepare(query);
      return stmt.all(apiKeyId);
    } else {
      query += ' GROUP BY ak.id ORDER BY total_requests DESC';
      const stmt = this.db.prepare(query);
      return stmt.all();
    }
  }

  validateApiKey(key: string): ApiKey | null {
    const apiKey = this.getApiKeyByKey(key);
    if (!apiKey || !apiKey.isActive) {
      return null;
    }
    return apiKey;
  }

  close(): void {
    this.db.close();
  }
}
