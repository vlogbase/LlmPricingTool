import { 
  InsertUser, 
  User, 
  ModelPrice,
  InsertApiKey,
  ApiKey,
  PriceSettingsDTO,
  InsertPriceSettings,
  PriceSettings,
  users,
  models,
  apiKeys,
  priceSettings
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

export interface IStorage {
  // User operations
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Model operations
  getAllModels(): Promise<ModelPrice[]>;
  getModelById(id: string): Promise<ModelPrice | undefined>;
  createModel(model: Omit<ModelPrice, 'lastUpdated'> & { lastUpdated?: string }): Promise<ModelPrice>;
  updateModel(id: string, model: Partial<ModelPrice>): Promise<ModelPrice>;
  updateModelActualPrice(id: string, actualPrice: number): Promise<ModelPrice>;
  
  // Price settings operations
  getPriceSettings(): Promise<PriceSettingsDTO>;
  updatePriceSettings(settings: Partial<PriceSettingsDTO>): Promise<PriceSettingsDTO>;
  
  // API key operations
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  
  // For session storage
  sessionStore: session.Store;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private models: Map<string, ModelPrice>;
  private apiKeys: Map<string, ApiKey>;
  private settings: PriceSettingsDTO;
  private userId: number;
  private apiKeyId: number;
  public sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.models = new Map();
    this.apiKeys = new Map();
    this.userId = 1;
    this.apiKeyId = 1;
    
    // Default price settings
    this.settings = {
      id: 1,
      percentageMarkup: 25,
      flatFeeMarkup: 0.2,
      lastUpdated: new Date().toISOString()
    };
    
    // Create memory session store
    const MemoryStore = require('memorystore')(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }

  // User operations
  async getUserByEmail(email: string): Promise<User | undefined> {
    // Use Array.from to avoid iterator issues
    const userArray = Array.from(this.users.values());
    return userArray.find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { 
      ...insertUser, 
      id,
      displayName: insertUser.displayName || null,
      photoURL: insertUser.photoURL || null 
    };
    this.users.set(user.email, user);
    return user;
  }

  // Model operations
  async getAllModels(): Promise<ModelPrice[]> {
    return Array.from(this.models.values());
  }

  async getModelById(id: string): Promise<ModelPrice | undefined> {
    return this.models.get(id);
  }

  async createModel(model: Omit<ModelPrice, 'lastUpdated'> & { lastUpdated?: string }): Promise<ModelPrice> {
    const newModel: ModelPrice = {
      ...model,
      lastUpdated: model.lastUpdated || new Date().toISOString()
    };
    this.models.set(model.id, newModel);
    return newModel;
  }

  async updateModel(id: string, model: Partial<ModelPrice>): Promise<ModelPrice> {
    const existingModel = this.models.get(id);
    
    if (!existingModel) {
      throw new Error(`Model with id ${id} not found`);
    }
    
    const updatedModel: ModelPrice = {
      ...existingModel,
      ...model,
      lastUpdated: model.lastUpdated || new Date().toISOString()
    };
    
    this.models.set(id, updatedModel);
    return updatedModel;
  }

  async updateModelActualPrice(id: string, actualPrice: number): Promise<ModelPrice> {
    const existingModel = this.models.get(id);
    
    if (!existingModel) {
      throw new Error(`Model with id ${id} not found`);
    }
    
    const updatedModel: ModelPrice = {
      ...existingModel,
      actualPrice,
      lastUpdated: new Date().toISOString()
    };
    
    this.models.set(id, updatedModel);
    return updatedModel;
  }

  // API key operations
  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const id = this.apiKeyId++;
    const newApiKey: ApiKey = {
      ...apiKey,
      id,
      description: apiKey.description || null,
      createdAt: new Date()
    };
    
    this.apiKeys.set(apiKey.key, newApiKey);
    return newApiKey;
  }

  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    return this.apiKeys.get(key);
  }
  
  // Price settings operations
  async getPriceSettings(): Promise<PriceSettingsDTO> {
    return this.settings;
  }
  
  async updatePriceSettings(settings: Partial<PriceSettingsDTO>): Promise<PriceSettingsDTO> {
    this.settings = {
      ...this.settings,
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    return this.settings;
  }
}

// PostgreSQL storage implementation
export class PostgresStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private queryClient: postgres.Sql;
  public sessionStore: session.Store;
  
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    // Create postgres client
    this.queryClient = postgres(process.env.DATABASE_URL);
    this.db = drizzle(this.queryClient);
    
    // Create session store
    const PostgresSessionStore = connectPgSimple(session);
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: false
      },
      createTableIfMissing: true
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const results = await this.db.select().from(users).where(eq(users.email, email));
    return results[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const results = await this.db.insert(users).values({
      ...insertUser,
      displayName: insertUser.displayName || null,
      photoURL: insertUser.photoURL || null
    }).returning();
    return results[0];
  }

  async getAllModels(): Promise<ModelPrice[]> {
    const results = await this.db.select().from(models);
    return results.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      openRouterPrice: Number(model.openRouterPrice),
      suggestedPrice: Number(model.suggestedPrice),
      actualPrice: Number(model.actualPrice),
      lastUpdated: model.lastUpdated.toISOString()
    }));
  }

  async getModelById(id: string): Promise<ModelPrice | undefined> {
    const results = await this.db.select().from(models).where(eq(models.id, id));
    if (results.length === 0) return undefined;
    
    const model = results[0];
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      openRouterPrice: Number(model.openRouterPrice),
      suggestedPrice: Number(model.suggestedPrice),
      actualPrice: Number(model.actualPrice),
      lastUpdated: model.lastUpdated.toISOString()
    };
  }

  async createModel(model: Omit<ModelPrice, 'lastUpdated'> & { lastUpdated?: string }): Promise<ModelPrice> {
    const lastUpdated = model.lastUpdated ? new Date(model.lastUpdated) : new Date();
    
    // Convert numeric values to strings for drizzle
    const results = await this.db.insert(models).values({
      id: model.id,
      name: model.name,
      provider: model.provider,
      openRouterPrice: String(model.openRouterPrice),
      suggestedPrice: String(model.suggestedPrice),
      actualPrice: String(model.actualPrice),
      lastUpdated
    }).returning();
    
    const createdModel = results[0];
    return {
      id: createdModel.id,
      name: createdModel.name,
      provider: createdModel.provider,
      openRouterPrice: Number(createdModel.openRouterPrice),
      suggestedPrice: Number(createdModel.suggestedPrice),
      actualPrice: Number(createdModel.actualPrice),
      lastUpdated: createdModel.lastUpdated.toISOString()
    };
  }

  async updateModel(id: string, model: Partial<ModelPrice>): Promise<ModelPrice> {
    // Remove lastUpdated from the model if it's a string
    const { lastUpdated, openRouterPrice, suggestedPrice, actualPrice, ...otherFields } = model;
    
    // Update values with proper type conversions
    const updateValues: Record<string, any> = { ...otherFields };
    
    // Convert numeric values to strings
    if (openRouterPrice !== undefined) updateValues.openRouterPrice = String(openRouterPrice);
    if (suggestedPrice !== undefined) updateValues.suggestedPrice = String(suggestedPrice);
    if (actualPrice !== undefined) updateValues.actualPrice = String(actualPrice);
    
    // Handle lastUpdated
    if (lastUpdated) {
      updateValues.lastUpdated = new Date(lastUpdated);
    }
    
    const results = await this.db.update(models)
      .set(updateValues)
      .where(eq(models.id, id))
      .returning();
    
    if (results.length === 0) {
      throw new Error(`Model with ID ${id} not found`);
    }
    
    const updatedModel = results[0];
    return {
      id: updatedModel.id,
      name: updatedModel.name,
      provider: updatedModel.provider,
      openRouterPrice: Number(updatedModel.openRouterPrice),
      suggestedPrice: Number(updatedModel.suggestedPrice),
      actualPrice: Number(updatedModel.actualPrice),
      lastUpdated: updatedModel.lastUpdated.toISOString()
    };
  }

  async updateModelActualPrice(id: string, actualPrice: number): Promise<ModelPrice> {
    const results = await this.db.update(models)
      .set({
        actualPrice: String(actualPrice),
        lastUpdated: new Date()
      })
      .where(eq(models.id, id))
      .returning();
    
    if (results.length === 0) {
      throw new Error(`Model with ID ${id} not found`);
    }
    
    const updatedModel = results[0];
    return {
      id: updatedModel.id,
      name: updatedModel.name,
      provider: updatedModel.provider,
      openRouterPrice: Number(updatedModel.openRouterPrice),
      suggestedPrice: Number(updatedModel.suggestedPrice),
      actualPrice: Number(updatedModel.actualPrice),
      lastUpdated: updatedModel.lastUpdated.toISOString()
    };
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const results = await this.db.insert(apiKeys).values({
      ...apiKey,
      description: apiKey.description || null
    }).returning();
    return results[0];
  }

  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    const results = await this.db.select().from(apiKeys).where(eq(apiKeys.key, key));
    return results[0];
  }
  
  // Price settings operations
  async getPriceSettings(): Promise<PriceSettingsDTO> {
    const results = await this.db.select().from(priceSettings);
    
    if (results.length === 0) {
      // Create default settings if none exist
      // Convert numbers to strings for PostgreSQL
      const defaultSettings = {
        percentageMarkup: '25',
        flatFeeMarkup: '0.2'
      };
      
      const created = await this.db.insert(priceSettings)
        .values([defaultSettings])
        .returning();
        
      return {
        id: created[0].id,
        percentageMarkup: Number(created[0].percentageMarkup),
        flatFeeMarkup: Number(created[0].flatFeeMarkup),
        lastUpdated: created[0].lastUpdated.toISOString()
      };
    }
    
    const settings = results[0];
    return {
      id: settings.id,
      percentageMarkup: Number(settings.percentageMarkup),
      flatFeeMarkup: Number(settings.flatFeeMarkup),
      lastUpdated: settings.lastUpdated.toISOString()
    };
  }
  
  async updatePriceSettings(settings: Partial<PriceSettingsDTO>): Promise<PriceSettingsDTO> {
    // Get existing settings to ensure we're updating an existing record
    const existingSettings = await this.getPriceSettings();
    
    // Update values with proper type conversion
    const updateValues: Record<string, any> = {};
    if (settings.percentageMarkup !== undefined) updateValues.percentageMarkup = String(settings.percentageMarkup);
    if (settings.flatFeeMarkup !== undefined) updateValues.flatFeeMarkup = String(settings.flatFeeMarkup);
    updateValues.lastUpdated = new Date();
    
    const results = await this.db.update(priceSettings)
      .set(updateValues)
      .where(eq(priceSettings.id, existingSettings.id))
      .returning();
    
    const updated = results[0];
    return {
      id: updated.id,
      percentageMarkup: Number(updated.percentageMarkup),
      flatFeeMarkup: Number(updated.flatFeeMarkup),
      lastUpdated: updated.lastUpdated.toISOString()
    };
  }
}

// Choose which storage implementation to use based on environment
let storage: IStorage;

try {
  // If DATABASE_URL is available, use PostgreSQL storage
  if (process.env.DATABASE_URL) {
    storage = new PostgresStorage();
    console.log('Using PostgreSQL storage');
  } else {
    // Otherwise, fallback to in-memory storage
    storage = new MemStorage();
    console.log('DATABASE_URL not found, using in-memory storage');
  }
} catch (error) {
  console.error('Error initializing database storage:', error);
  // Fallback to in-memory storage in case of errors
  storage = new MemStorage();
  console.log('Fallback to in-memory storage due to database error');
}

export { storage };
