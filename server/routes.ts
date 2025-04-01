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
          const newModel = await storage.createModel({
            ...model,
            lastUpdated: new Date().toISOString()
          });
          
          // Record the initial price setting in history
          await storage.createPriceHistory({
            modelId: newModel.id,
            previousPrice: 0,
            newPrice: newModel.actualPrice,
            changeSource: 'initial_creation'
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
    console.log('Received update prices request:', req.body);
    
    // Parse the request body if it's a string
    let parsedBody = req.body;
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
      } catch (e) {
        console.error('Error parsing request body:', e);
        return res.status(400).json({ message: "Bad request: Invalid JSON" });
      }
    }
    
    const { actualPrices } = parsedBody;
    console.log('Extracted actualPrices:', actualPrices);
    
    if (!actualPrices || typeof actualPrices !== 'object') {
      return res.status(400).json({ message: "Bad request: No actual prices provided" });
    }
    
    try {
      // Update actual prices for the models
      for (const [modelId, price] of Object.entries(actualPrices)) {
        if (typeof price === 'number' && price >= 0) {
          await storage.updateModelActualPrice(modelId, price, 'manual');
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
    console.log('Received price settings update request:', req.body);
    
    // Parse the request body if it's a string
    let parsedBody = req.body;
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
      } catch (e) {
        console.error('Error parsing request body:', e);
        return res.status(400).json({ message: "Bad request: Invalid JSON" });
      }
    }
    
    const { percentageMarkup, flatFeeMarkup } = parsedBody;
    console.log('Extracted values:', { percentageMarkup, flatFeeMarkup });
    
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
  
  // Create scheduled price change
  app.post('/api/scheduled-prices', isAuthenticated, isAuthorized, async (req, res) => {
    console.log('Received scheduled price request:', req.body);
    
    // Parse the request body if it's a string
    let parsedBody = req.body;
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
      } catch (e) {
        console.error('Error parsing request body:', e);
        return res.status(400).json({ message: "Bad request: Invalid JSON" });
      }
    }
    
    const { modelId, scheduledPrice, effectiveDate } = parsedBody;
    console.log('Extracted values:', { modelId, scheduledPrice, effectiveDate });
    
    // Validate inputs
    if (!modelId || scheduledPrice === undefined || !effectiveDate) {
      return res.status(400).json({ 
        message: "Bad request: Missing required fields",
        details: "Required fields: modelId, scheduledPrice, effectiveDate"
      });
    }
    
    const priceValue = parseFloat(scheduledPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ message: "Bad request: Invalid price value" });
    }
    
    // Validate date
    try {
      const date = new Date(effectiveDate);
      if (date <= new Date()) {
        return res.status(400).json({ 
          message: "Bad request: Effective date must be in the future"
        });
      }
    } catch (e) {
      return res.status(400).json({ 
        message: "Bad request: Invalid date format",
        details: "Date should be in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)"
      });
    }
    
    try {
      // Check if model exists
      const model = await storage.getModelById(modelId);
      if (!model) {
        return res.status(404).json({ message: `Model with ID ${modelId} not found` });
      }
      
      // Create the scheduled price change
      const newScheduledPrice = await storage.createScheduledPrice({
        modelId,
        scheduledPrice: priceValue, // InsertScheduledPrice type accepts number now
        effectiveDate
      });
      
      res.status(201).json({
        scheduledPrice: newScheduledPrice,
        message: "Scheduled price change created successfully"
      });
    } catch (error) {
      console.error("Error creating scheduled price:", error);
      res.status(500).json({ message: "Failed to create scheduled price change" });
    }
  });
  
  // Get all scheduled price changes
  app.get('/api/scheduled-prices', isAuthenticated, isAuthorized, async (req, res) => {
    try {
      const scheduledPrices = await storage.getAllScheduledPrices();
      res.json(scheduledPrices);
    } catch (error) {
      console.error("Error getting scheduled prices:", error);
      res.status(500).json({ message: "Failed to get scheduled prices" });
    }
  });
  
  // Get scheduled price changes for a specific model
  app.get('/api/scheduled-prices/model/:modelId', isAuthenticated, isAuthorized, async (req, res) => {
    const { modelId } = req.params;
    
    try {
      const scheduledPrices = await storage.getScheduledPricesByModel(modelId);
      res.json(scheduledPrices);
    } catch (error) {
      console.error(`Error getting scheduled prices for model ${modelId}:`, error);
      res.status(500).json({ message: "Failed to get scheduled prices" });
    }
  });
  
  // Apply a scheduled price change (manual trigger)
  app.post('/api/scheduled-prices/:id/apply', isAuthenticated, isAuthorized, async (req, res) => {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Bad request: Invalid ID format" });
    }
    
    try {
      // Check if the scheduled price exists
      const scheduledPrice = await storage.getScheduledPriceById(id);
      if (!scheduledPrice) {
        return res.status(404).json({ message: `Scheduled price with ID ${id} not found` });
      }
      
      // Apply the scheduled price change
      const updatedModel = await storage.applyScheduledPrice(id);
      
      res.json({
        model: updatedModel,
        message: "Scheduled price applied successfully"
      });
    } catch (error) {
      console.error(`Error applying scheduled price ${id}:`, error);
      res.status(500).json({ message: "Failed to apply scheduled price" });
    }
  });
  
  // Endpoint to check and apply due scheduled prices
  app.post('/api/scheduled-prices/apply-due', isAuthenticated, isAuthorized, async (req, res) => {
    try {
      const appliedCount = await storage.applyDueScheduledPrices();
      res.json({
        appliedCount,
        message: appliedCount > 0 
          ? `Successfully applied ${appliedCount} scheduled price changes` 
          : "No scheduled price changes were due for application"
      });
    } catch (error) {
      console.error("Error applying due scheduled prices:", error);
      res.status(500).json({ message: "Failed to apply due scheduled prices" });
    }
  });
  
  // Price history endpoints
  // Get all price history
  app.get('/api/price-history', isAuthenticated, isAuthorized, async (req, res) => {
    try {
      const priceHistory = await storage.getAllPriceHistory();
      res.json(priceHistory);
    } catch (error) {
      console.error("Error getting price history:", error);
      res.status(500).json({ message: "Failed to retrieve price history" });
    }
  });

  // Get price history for a specific model
  app.get('/api/price-history/model/:modelId', isAuthenticated, isAuthorized, async (req, res) => {
    const { modelId } = req.params;
    
    try {
      const priceHistory = await storage.getPriceHistoryByModel(modelId);
      res.json(priceHistory);
    } catch (error) {
      console.error(`Error getting price history for model ${modelId}:`, error);
      res.status(500).json({ message: "Failed to retrieve price history for model" });
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
