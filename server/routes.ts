import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import axios from "axios";
import { nanoid } from "nanoid";
import { setupAuth, isAuthenticated, isAuthorized } from "./replitAuth";

// Function to calculate suggested price from OpenRouter price
const calculateSuggestedPrice = (openRouterPrice: number): number => {
  return openRouterPrice * 1.25 + 0.2;
};

// Middleware to verify API key
const verifyApiKey = async (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers.authorization?.split('Bearer ')[1];
  
  if (!apiKey) {
    return res.status(401).json({ message: "Unauthorized: No API key provided" });
  }

  try {
    const validKey = await storage.getApiKeyByKey(apiKey);
    if (!validKey) {
      return res.status(401).json({ message: "Unauthorized: Invalid API key" });
    }
    next();
  } catch (error) {
    console.error("Error verifying API key:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Function to fetch model prices from OpenRouter
const fetchOpenRouterPrices = async () => {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
  
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`
      }
    });
    
    const models = response.data.data;
    
    // Process and transform the data
    return models.map((model: any) => {
      const openRouterPrice = model.pricing?.input || 0;
      return {
        id: model.id,
        name: model.name,
        provider: model.creator || 'Unknown',
        openRouterPrice,
        suggestedPrice: calculateSuggestedPrice(openRouterPrice),
        // Default actual price to suggested price initially
        actualPrice: calculateSuggestedPrice(openRouterPrice)
      };
    });
  } catch (error) {
    console.error('Error fetching from OpenRouter:', error);
    throw new Error('Failed to fetch prices from OpenRouter');
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up Replit Auth
  await setupAuth(app);
  
  // Get model prices
  app.get('/api/model-prices', async (req, res) => {
    try {
      const modelPrices = await storage.getAllModels();
      
      if (modelPrices.length === 0) {
        // If no models exist yet, fetch from OpenRouter and store them
        const openRouterModels = await fetchOpenRouterPrices();
        
        // Store models
        for (const model of openRouterModels) {
          await storage.createModel(model);
        }
        
        // Fetch again from storage
        const newModelPrices = await storage.getAllModels();
        return res.json(newModelPrices);
      }
      
      res.json(modelPrices);
    } catch (error) {
      console.error("Error getting model prices:", error);
      res.status(500).json({ message: "Failed to get model prices" });
    }
  });
  
  // Refresh prices from OpenRouter
  app.post('/api/refresh-prices', isAuthenticated, async (req, res) => {
    try {
      const openRouterModels = await fetchOpenRouterPrices();
      
      // Update existing models or create new ones
      for (const model of openRouterModels) {
        const existingModel = await storage.getModelById(model.id);
        
        if (existingModel) {
          // Keep the actual price but update the OpenRouter price and suggested price
          await storage.updateModel(model.id, {
            ...model,
            actualPrice: existingModel.actualPrice, // Preserve actual price
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Create new model
          await storage.createModel({
            ...model,
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      res.json({ message: "Prices refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing prices:", error);
      res.status(500).json({ message: "Failed to refresh prices" });
    }
  });
  
  // Update actual prices
  app.post('/api/update-prices', isAuthenticated, isAuthorized, async (req, res) => {
    const { actualPrices } = req.body;
    
    if (!actualPrices || typeof actualPrices !== 'object') {
      return res.status(400).json({ message: "Bad request: No actual prices provided" });
    }
    
    try {
      // Update actual prices for the models
      for (const [modelId, price] of Object.entries(actualPrices)) {
        if (typeof price === 'number' && price >= 0) {
          await storage.updateModelActualPrice(modelId, price);
        }
      }
      
      res.json({ message: "Prices updated successfully" });
    } catch (error) {
      console.error("Error updating prices:", error);
      res.status(500).json({ message: "Failed to update prices" });
    }
  });
  
  // Get API endpoint info
  app.get('/api/endpoint-info', async (req, res) => {
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    
    res.json({
      endpoint: `${protocol}://${host}/api/public/llm-pricing`
    });
  });
  
  // Generate API key (only available to authorized users)
  app.post('/api/generate-api-key', isAuthenticated, isAuthorized, async (req, res) => {
    const { description } = req.body;
    const apiKey = `llm_${nanoid(32)}`;
    
    try {
      const newApiKey = await storage.createApiKey({
        key: apiKey,
        description: description || 'API Key'
      });
      
      res.json({ apiKey: newApiKey.key });
    } catch (error) {
      console.error("Error generating API key:", error);
      res.status(500).json({ message: "Failed to generate API key" });
    }
  });
  
  // Public API endpoints (protected with API key)
  app.get('/api/public/llm-pricing', verifyApiKey, async (req, res) => {
    try {
      const modelPrices = await storage.getAllModels();
      
      // Transform data to public API format
      const formattedData = {
        models: modelPrices.map(model => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          price_per_million_tokens: model.actualPrice
        })),
        last_updated: new Date().toISOString()
      };
      
      res.json(formattedData);
    } catch (error) {
      console.error("Error accessing public API:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
