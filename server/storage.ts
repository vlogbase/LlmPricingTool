import { 
  InsertUser, 
  User, 
  ModelPrice,
  InsertApiKey,
  ApiKey,
  PriceSettingsDTO,
  InsertPriceSettings,
  PriceSettings,
  InsertScheduledPrice,
  ScheduledPrice,
  ScheduledPriceDTO,
  InsertPriceHistory,
  PriceHistory,
  PriceHistoryDTO,
  users,
  models,
  apiKeys,
  priceSettings,
  scheduledPrices,
  priceHistory
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, lte, gt, desc } from "drizzle-orm";
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
  updateModelActualPrice(id: string, actualPrice: number, source: string): Promise<ModelPrice>;
  
  // Price settings operations
  getPriceSettings(): Promise<PriceSettingsDTO>;
  updatePriceSettings(settings: Partial<PriceSettingsDTO>): Promise<PriceSettingsDTO>;
  
  // API key operations
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  
  // Scheduled price operations
  createScheduledPrice(scheduledPrice: InsertScheduledPrice): Promise<ScheduledPrice>;
  getScheduledPricesByModel(modelId: string): Promise<ScheduledPrice[]>;
  getAllScheduledPrices(): Promise<ScheduledPriceDTO[]>;
  getScheduledPriceById(id: number): Promise<ScheduledPrice | undefined>;
  applyScheduledPrice(id: number): Promise<ModelPrice>;
  cancelScheduledPrice(id: number): Promise<void>; // Cancel a scheduled price change
  applyDueScheduledPrices(): Promise<number>; // Returns count of applied changes
  
  // Price history operations
  createPriceHistory(priceHistory: InsertPriceHistory): Promise<PriceHistory>;
  getAllPriceHistory(): Promise<PriceHistoryDTO[]>;
  getPriceHistoryByModel(modelId: string): Promise<PriceHistoryDTO[]>;
  
  // For session storage
  sessionStore: session.Store;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private models: Map<string, ModelPrice>;
  private apiKeys: Map<string, ApiKey>;
  private scheduledPrices: Map<number, ScheduledPrice>;
  private settings: PriceSettingsDTO;
  private userId: number;
  private apiKeyId: number;
  private scheduledPriceId: number;
  public sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.models = new Map();
    this.apiKeys = new Map();
    this.scheduledPrices = new Map();
    this.userId = 1;
    this.apiKeyId = 1;
    this.scheduledPriceId = 1;
    
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

  async updateModelActualPrice(id: string, actualPrice: number, source: string = 'manual'): Promise<ModelPrice> {
    const existingModel = this.models.get(id);
    
    if (!existingModel) {
      throw new Error(`Model with id ${id} not found`);
    }
    
    // Record history before updating
    await this.createPriceHistory({
      modelId: id,
      previousPrice: existingModel.actualPrice,
      newPrice: actualPrice,
      changeSource: source
    });
    
    const updatedModel: ModelPrice = {
      ...existingModel,
      actualPrice,
      lastUpdated: new Date().toISOString()
    };
    
    this.models.set(id, updatedModel);
    return updatedModel;
  }
  
  // Price history operations
  private priceHistory: Map<number, PriceHistory> = new Map();
  private priceHistoryId: number = 1;
  
  async createPriceHistory(priceHistoryData: InsertPriceHistory): Promise<PriceHistory> {
    const id = this.priceHistoryId++;
    const changedAt = priceHistoryData.changedAt ? new Date(priceHistoryData.changedAt) : new Date();
    
    const history: PriceHistory = {
      id,
      modelId: priceHistoryData.modelId,
      previousPrice: String(priceHistoryData.previousPrice),
      newPrice: String(priceHistoryData.newPrice),
      changedAt,
      changeSource: priceHistoryData.changeSource
    };
    
    this.priceHistory.set(id, history);
    return history;
  }
  
  async getAllPriceHistory(): Promise<PriceHistoryDTO[]> {
    const history = Array.from(this.priceHistory.values());
    const result: PriceHistoryDTO[] = [];
    
    for (const h of history) {
      const model = this.models.get(h.modelId);
      if (model) {
        result.push({
          id: h.id,
          modelId: h.modelId,
          modelName: model.name,
          provider: model.provider,
          previousPrice: Number(h.previousPrice),
          newPrice: Number(h.newPrice),
          changedAt: h.changedAt.toISOString(),
          changeSource: h.changeSource
        });
      }
    }
    
    // Sort by date descending (newest first)
    return result.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }
  
  async getPriceHistoryByModel(modelId: string): Promise<PriceHistoryDTO[]> {
    const allHistory = await this.getAllPriceHistory();
    return allHistory.filter(h => h.modelId === modelId);
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

  // Scheduled price operations
  async createScheduledPrice(scheduledPrice: InsertScheduledPrice): Promise<ScheduledPrice> {
    const id = this.scheduledPriceId++;
    const newScheduledPrice: ScheduledPrice = {
      id,
      modelId: scheduledPrice.modelId,
      scheduledPrice: String(scheduledPrice.scheduledPrice), // Convert to string to match interface
      effectiveDate: new Date(scheduledPrice.effectiveDate),
      createdAt: new Date(),
      applied: false
    };
    
    this.scheduledPrices.set(id, newScheduledPrice);
    return newScheduledPrice;
  }
  
  async getScheduledPricesByModel(modelId: string): Promise<ScheduledPrice[]> {
    return Array.from(this.scheduledPrices.values()).filter(
      sp => sp.modelId === modelId && !sp.applied
    );
  }
  
  async getAllScheduledPrices(): Promise<ScheduledPriceDTO[]> {
    // Get all scheduled prices that haven't been applied yet
    const scheduledPrices = Array.from(this.scheduledPrices.values()).filter(
      sp => !sp.applied
    );
    
    // Map to DTO by adding model information
    const result: ScheduledPriceDTO[] = [];
    
    for (const sp of scheduledPrices) {
      const model = this.models.get(sp.modelId);
      if (model) {
        result.push({
          id: sp.id,
          modelId: sp.modelId,
          modelName: model.name,
          provider: model.provider,
          currentPrice: model.actualPrice,
          scheduledPrice: Number(sp.scheduledPrice), // Convert to number for DTO
          effectiveDate: sp.effectiveDate.toISOString(),
          applied: sp.applied
        });
      }
    }
    
    return result;
  }
  
  async getScheduledPriceById(id: number): Promise<ScheduledPrice | undefined> {
    return this.scheduledPrices.get(id);
  }
  
  async applyScheduledPrice(id: number): Promise<ModelPrice> {
    const scheduledPrice = this.scheduledPrices.get(id);
    
    if (!scheduledPrice) {
      throw new Error(`Scheduled price with ID ${id} not found`);
    }
    
    // Update the actual price for the model
    // Convert the string price to a number
    const actualPrice = Number(scheduledPrice.scheduledPrice);
    const updatedModel = await this.updateModelActualPrice(
      scheduledPrice.modelId, 
      actualPrice,
      'scheduled'
    );
    
    // Mark the scheduled price as applied
    scheduledPrice.applied = true;
    this.scheduledPrices.set(id, scheduledPrice);
    
    return updatedModel;
  }
  
  async cancelScheduledPrice(id: number): Promise<void> {
    const scheduledPrice = this.scheduledPrices.get(id);
    
    if (!scheduledPrice) {
      throw new Error(`Scheduled price with ID ${id} not found`);
    }
    
    if (scheduledPrice.applied) {
      throw new Error(`Cannot cancel a scheduled price that has already been applied`);
    }
    
    // Remove the scheduled price
    this.scheduledPrices.delete(id);
  }
  
  async applyDueScheduledPrices(): Promise<number> {
    const now = new Date();
    let appliedCount = 0;
    
    // Get all scheduled prices that are due but not yet applied
    const duePrices = Array.from(this.scheduledPrices.values()).filter(
      sp => !sp.applied && sp.effectiveDate <= now
    );
    
    // Apply each scheduled price
    for (const sp of duePrices) {
      try {
        await this.applyScheduledPrice(sp.id);
        appliedCount++;
      } catch (error) {
        console.error(`Error applying scheduled price ${sp.id}:`, error);
      }
    }
    
    return appliedCount;
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

  async updateModelActualPrice(id: string, actualPrice: number, source: string = 'manual'): Promise<ModelPrice> {
    // Get the current model to record history
    const currentModel = await this.getModelById(id);
    if (!currentModel) {
      throw new Error(`Model with ID ${id} not found`);
    }
    
    // Record price history before updating
    await this.createPriceHistory({
      modelId: id,
      previousPrice: currentModel.actualPrice,
      newPrice: actualPrice,
      changeSource: source
    });
    
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

  // Scheduled price operations
  async createScheduledPrice(scheduledPrice: InsertScheduledPrice): Promise<ScheduledPrice> {
    // Convert to appropriate types for PostgreSQL
    const values = {
      modelId: scheduledPrice.modelId,
      scheduledPrice: String(scheduledPrice.scheduledPrice),
      effectiveDate: new Date(scheduledPrice.effectiveDate),
      applied: false
    };
    
    const results = await this.db.insert(scheduledPrices)
      .values(values)
      .returning();
      
    const createdPrice = results[0];
    return createdPrice;
  }
  
  async getScheduledPricesByModel(modelId: string): Promise<ScheduledPrice[]> {
    const results = await this.db.select()
      .from(scheduledPrices)
      .where(and(
        eq(scheduledPrices.modelId, modelId),
        eq(scheduledPrices.applied, false)
      ));
      
    return results;
  }
  
  async getAllScheduledPrices(): Promise<ScheduledPriceDTO[]> {
    // Get all scheduled prices that haven't been applied yet
    const results = await this.db.select()
      .from(scheduledPrices)
      .where(eq(scheduledPrices.applied, false));
      
    // Map to DTOs with model information
    const dtos: ScheduledPriceDTO[] = [];
    
    for (const sp of results) {
      const model = await this.getModelById(sp.modelId);
      if (model) {
        dtos.push({
          id: sp.id,
          modelId: sp.modelId,
          modelName: model.name,
          provider: model.provider,
          currentPrice: model.actualPrice,
          scheduledPrice: Number(sp.scheduledPrice),
          effectiveDate: sp.effectiveDate.toISOString(),
          applied: sp.applied
        });
      }
    }
    
    return dtos;
  }
  
  async getScheduledPriceById(id: number): Promise<ScheduledPrice | undefined> {
    const results = await this.db.select()
      .from(scheduledPrices)
      .where(eq(scheduledPrices.id, id));
      
    if (results.length === 0) return undefined;
    
    return results[0];
  }
  
  async applyScheduledPrice(id: number): Promise<ModelPrice> {
    // Get the scheduled price
    const scheduledPrice = await this.getScheduledPriceById(id);
    
    if (!scheduledPrice) {
      throw new Error(`Scheduled price with ID ${id} not found`);
    }
    
    // Update the model's actual price
    // Convert string price to number for the update
    const actualPrice = Number(scheduledPrice.scheduledPrice);
    const updatedModel = await this.updateModelActualPrice(
      scheduledPrice.modelId,
      actualPrice,
      'scheduled'
    );
    
    // Mark the scheduled price as applied
    await this.db.update(scheduledPrices)
      .set({ applied: true })
      .where(eq(scheduledPrices.id, id));
      
    return updatedModel;
  }
  
  async cancelScheduledPrice(id: number): Promise<void> {
    // Get the scheduled price
    const scheduledPrice = await this.getScheduledPriceById(id);
    
    if (!scheduledPrice) {
      throw new Error(`Scheduled price with ID ${id} not found`);
    }
    
    if (scheduledPrice.applied) {
      throw new Error(`Cannot cancel a scheduled price that has already been applied`);
    }
    
    // Delete the scheduled price
    await this.db.delete(scheduledPrices)
      .where(eq(scheduledPrices.id, id));
  }
  
  async applyDueScheduledPrices(): Promise<number> {
    const now = new Date();
    let appliedCount = 0;
    
    // Get all scheduled prices that are due but not yet applied
    const duePrices = await this.db.select()
      .from(scheduledPrices)
      .where(and(
        eq(scheduledPrices.applied, false),
        lte(scheduledPrices.effectiveDate, now)
      ));
    
    // Apply each scheduled price
    for (const sp of duePrices) {
      try {
        await this.applyScheduledPrice(sp.id);
        appliedCount++;
      } catch (error) {
        console.error(`Error applying scheduled price ${sp.id}:`, error);
      }
    }
    
    return appliedCount;
  }
  
  // Price history operations
  async createPriceHistory(priceHistoryData: InsertPriceHistory): Promise<PriceHistory> {
    // Convert to appropriate types for PostgreSQL
    const values = {
      modelId: priceHistoryData.modelId,
      previousPrice: String(priceHistoryData.previousPrice),
      newPrice: String(priceHistoryData.newPrice),
      changeSource: priceHistoryData.changeSource,
      changedAt: priceHistoryData.changedAt ? new Date(priceHistoryData.changedAt) : new Date()
    };
    
    const results = await this.db.insert(priceHistory)
      .values(values)
      .returning();
      
    return results[0];
  }
  
  async getAllPriceHistory(): Promise<PriceHistoryDTO[]> {
    // Get all price history entries
    const results = await this.db.select()
      .from(priceHistory)
      .orderBy(desc(priceHistory.changedAt)); // Newest first
    
    // Map to DTOs with model information
    const dtos: PriceHistoryDTO[] = [];
    
    for (const history of results) {
      const model = await this.getModelById(history.modelId);
      if (model) {
        dtos.push({
          id: history.id,
          modelId: history.modelId,
          modelName: model.name,
          provider: model.provider,
          previousPrice: Number(history.previousPrice),
          newPrice: Number(history.newPrice),
          changedAt: history.changedAt.toISOString(),
          changeSource: history.changeSource
        });
      }
    }
    
    return dtos;
  }
  
  async getPriceHistoryByModel(modelId: string): Promise<PriceHistoryDTO[]> {
    // Get price history entries for specific model
    const results = await this.db.select()
      .from(priceHistory)
      .where(eq(priceHistory.modelId, modelId))
      .orderBy(desc(priceHistory.changedAt)); // Newest first
    
    // Map to DTOs with model information
    const model = await this.getModelById(modelId);
    if (!model) {
      return [];
    }
    
    return results.map(history => ({
      id: history.id,
      modelId: history.modelId,
      modelName: model.name,
      provider: model.provider,
      previousPrice: Number(history.previousPrice),
      newPrice: Number(history.newPrice),
      changedAt: history.changedAt.toISOString(),
      changeSource: history.changeSource
    }));
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
