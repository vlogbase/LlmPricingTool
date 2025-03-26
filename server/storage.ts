import { 
  InsertUser, 
  User, 
  ModelPrice,
  InsertApiKey,
  ApiKey,
} from "@shared/schema";

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
  
  // API key operations
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private models: Map<string, ModelPrice>;
  private apiKeys: Map<string, ApiKey>;
  private userId: number;
  private apiKeyId: number;

  constructor() {
    this.users = new Map();
    this.models = new Map();
    this.apiKeys = new Map();
    this.userId = 1;
    this.apiKeyId = 1;
  }

  // User operations
  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { ...insertUser, id };
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
      createdAt: new Date()
    };
    
    this.apiKeys.set(apiKey.key, newApiKey);
    return newApiKey;
  }

  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    return this.apiKeys.get(key);
  }
}

export const storage = new MemStorage();
