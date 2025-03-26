import { pgTable, text, serial, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users Table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  photoURL: text("photo_url"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  displayName: true,
  photoURL: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Models Table
export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  openRouterPrice: numeric("openrouter_price", { precision: 10, scale: 4 }).notNull(),
  suggestedPrice: numeric("suggested_price", { precision: 10, scale: 4 }).notNull(),
  actualPrice: numeric("actual_price", { precision: 10, scale: 4 }).notNull(),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertModelSchema = createInsertSchema(models);
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof models.$inferSelect;

// For frontend type safety
export interface ModelPrice {
  id: string;
  name: string;
  provider: string;
  openRouterPrice: number;
  suggestedPrice: number;
  actualPrice: number;
  lastUpdated: string;
}

// API Keys Table
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  key: true,
  description: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
