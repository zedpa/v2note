/**
 * Local configuration storage layer.
 * Stores user-specific data (soul, skills, tools, settings, identity) locally.
 * Built on top of the cross-platform storage abstraction.
 */

import { getItem, setItem, removeItem } from "./storage";

// ── Storage Keys ──

const KEYS = {
  soul: "config:soul",
  user: "config:user",
  tools: "config:tools",
  skills: "config:skills",
  settings: "config:settings",
  identity: "config:identity",
} as const;

// ── Types ──

export interface LocalSoul {
  content: string;
  updatedAt: string;
}

export interface LocalUser {
  name?: string;
  description?: string;
  traits?: string[];
  updatedAt: string;
}

export interface LocalToolServer {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  description?: string;
  enabled: boolean;
}

export interface LocalTools {
  servers: LocalToolServer[];
  updatedAt: string;
}

export interface LocalSkillConfig {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface LocalSkills {
  configs: LocalSkillConfig[];
  updatedAt: string;
}

export interface LocalSettings {
  autoDeleteAudio: boolean;
  userType: "manager" | "creator" | null;
  proactiveInterval: number; // minutes
  theme: "light" | "dark" | "system";
  language: string;
  [key: string]: unknown;
}

export interface LocalIdentity {
  deviceId: string;
  registeredAt: string;
}

export interface LocalConfig {
  soul?: LocalSoul;
  user?: LocalUser;
  tools?: LocalTools;
  skills?: LocalSkills;
  settings?: LocalSettings;
  existingTags?: string[];
}

// ── Default Values ──

const DEFAULT_SETTINGS: LocalSettings = {
  autoDeleteAudio: false,
  userType: null,
  proactiveInterval: 30,
  theme: "system",
  language: "zh-CN",
};

// ── Generic typed get/set ──

async function getTyped<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setTyped<T>(key: string, value: T): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

// ── Soul ──

export async function getSoul(): Promise<LocalSoul | null> {
  return getTyped<LocalSoul>(KEYS.soul);
}

export async function setSoul(soul: LocalSoul): Promise<void> {
  await setTyped(KEYS.soul, soul);
}

// ── User Profile ──

export async function getUserProfile(): Promise<LocalUser | null> {
  return getTyped<LocalUser>(KEYS.user);
}

export async function setUserProfile(user: LocalUser): Promise<void> {
  await setTyped(KEYS.user, user);
}

// ── Tools ──

export async function getTools(): Promise<LocalTools | null> {
  return getTyped<LocalTools>(KEYS.tools);
}

export async function setTools(tools: LocalTools): Promise<void> {
  await setTyped(KEYS.tools, tools);
}

// ── Skills ──

export async function getSkills(): Promise<LocalSkills | null> {
  return getTyped<LocalSkills>(KEYS.skills);
}

export async function setSkills(skills: LocalSkills): Promise<void> {
  await setTyped(KEYS.skills, skills);
}

// ── Settings ──

export async function getSettings(): Promise<LocalSettings> {
  const stored = await getTyped<LocalSettings>(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(settings: LocalSettings): Promise<void> {
  await setTyped(KEYS.settings, settings);
}

export async function updateSettings(
  partial: Partial<LocalSettings>,
): Promise<LocalSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await setTyped(KEYS.settings, updated);
  return updated;
}

// ── Identity ──

export async function getIdentity(): Promise<LocalIdentity | null> {
  return getTyped<LocalIdentity>(KEYS.identity);
}

export async function setIdentity(identity: LocalIdentity): Promise<void> {
  await setTyped(KEYS.identity, identity);
}

// ── Bulk Operations ──

/**
 * Load the full local config for sending to the gateway.
 */
export async function loadLocalConfig(): Promise<LocalConfig> {
  const [soul, skills, settings] = await Promise.all([
    getSoul(),
    getSkills(),
    getSettings(),
  ]);

  const config: LocalConfig = {};
  if (soul) config.soul = soul;
  if (skills) config.skills = skills;
  if (settings) config.settings = settings;

  return config;
}

/**
 * Check if local config has been initialized.
 */
export async function isConfigInitialized(): Promise<boolean> {
  const soul = await getItem(KEYS.soul);
  return soul !== null;
}

/**
 * Clear all local config (for reset/logout).
 */
export async function clearAllConfig(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => removeItem(key)),
  );
}
