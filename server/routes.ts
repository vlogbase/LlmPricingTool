import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import axios from "axios";
import { nanoid } from "nanoid";
import { setupAuth, isAuthenticated, isAuthorized } from "./replitAuth";

// Function to calculate suggested price from OpenRouter price
const calculateSuggestedPrice = async (openRouterPrice: number): Promise<number> => {
  // Get the markup values from settings
  const settings = await storage.getPriceSettings();
  const percentageMarkup = settings.percentageMarkup / 100; // Convert percentage to decimal
  const flatFeeMarkup = settings.flatFeeMarkup;
  
  return openRouterPrice * (1 + percentageMarkup) + flatFeeMarkup;
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
    
    // Log full response for debugging
    console.log('OpenRouter full response:', JSON.stringify(response.data, null, 2));
    
    // Process and transform the data
    const processedModels = [];
    for (const model of models) {
      // Get input and completion pricing (using string values that might need conversion)
      const inputPrice = parseFloat(model.pricing?.input || "0");
      const completionPrice = parseFloat(model.pricing?.completion || "0");
      
      // Use the max of input and completion prices and convert to per-million tokens
      // Many models use the same price for both, but some charge differently
      const openRouterPrice = Math.max(inputPrice, completionPrice) * 1000000;
      
      console.log(`Model ${model.id} pricing:`, { 
        input: model.pricing?.input,
        completion: model.pricing?.completion,
        parsed: { inputPrice, completionPrice },
        converted: openRouterPrice
      });
      
      const suggestedPrice = await calculateSuggestedPrice(openRouterPrice);
      
      processedModels.push({
        id: model.id,
        name: model.name,
        provider: model.creator || 'Unknown',
        openRouterPrice,
        suggestedPrice,
        // Default actual price to suggested price initially
        actualPrice: suggestedPrice
      });
    }
    
    return processedModels;
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
  app.post('/api/refresh-prices', async (req, res) => {
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
  
  // Get price settings
  app.get('/api/price-settings', isAuthenticated, isAuthorized, async (req, res) => {
    try {
      const settings = await storage.getPriceSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error getting price settings:", error);
      res.status(500).json({ message: "Failed to get price settings" });
    }
  });
  
  // Update price settings
  app.post('/api/price-settings', isAuthenticated, isAuthorized, async (req, res) => {
    const { percentageMarkup, flatFeeMarkup } = req.body;
    
    // Validate inputs
    if (percentageMarkup === undefined && flatFeeMarkup === undefined) {
      return res.status(400).json({ message: "Bad request: No settings provided" });
    }
    
    const updates: Partial<{ percentageMarkup: number, flatFeeMarkup: number }> = {};
    
    if (percentageMarkup !== undefined) {
      const percentValue = parseFloat(percentageMarkup);
      if (isNaN(percentValue) || percentValue < 0) {
        return res.status(400).json({ message: "Bad request: Invalid percentage markup" });
      }
      updates.percentageMarkup = percentValue;
    }
    
    if (flatFeeMarkup !== undefined) {
      const feeValue = parseFloat(flatFeeMarkup);
      if (isNaN(feeValue) || feeValue < 0) {
        return res.status(400).json({ message: "Bad request: Invalid flat fee markup" });
      }
      updates.flatFeeMarkup = feeValue;
    }
    
    try {
      const updatedSettings = await storage.updatePriceSettings(updates);
      
      // After updating the markup values, we need to recalculate the suggested prices
      // for all models and update them in the database
      const models = await storage.getAllModels();
      
      for (const model of models) {
        const suggestedPrice = await calculateSuggestedPrice(model.openRouterPrice);
        await storage.updateModel(model.id, { suggestedPrice });
      }
      
      res.json({
        settings: updatedSettings,
        message: "Price settings updated successfully"
      });
    } catch (error) {
      console.error("Error updating price settings:", error);
      res.status(500).json({ message: "Failed to update price settings" });
    }
  });
  
  // Public API endpoints (protected with API key)
  app.get('/api/public/llm-pricing', verifyApiKey, async (req, res) => {
    try {
      const modelPrices = await storage.getAllModels();
      
      // Transform data to match OpenRouter format
      // OpenRouter provides prices per token (not per million tokens), so convert back
      const formattedData = {
        data: modelPrices.map(model => ({
          id: model.id,
          name: model.name,
          pricing: {
            // Note: OpenRouter uses per-token pricing (not per million tokens)
            // So divide our stored price (per million) by 1,000,000
            input: (model.actualPrice / 1000000).toFixed(9),
            completion: (model.actualPrice / 1000000).toFixed(9)
          },
          context_length: 8192, // Default context length
          creator: model.provider
        }))
      };
      
      res.json(formattedData);
    } catch (error) {
      console.error("Error accessing public API:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
