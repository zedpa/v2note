/**
 * Local configuration storage layer.
 * 所有用户数据按 userId 隔离存储。
 * Built on top of the cross-platform storage abstraction.
 */

import { getItem, setItem, removeItem } from "./storage";

// ── User Scope ──

let _currentUserId: string | null = null;

/** 登录后调用，所有 config 读写自动按 userId 隔离 */
export function setCurrentUserId(userId: string | null): void {
  _currentUserId = userId;
}

export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/** 生成按用户隔离的 storage key */
function scopedKey(base: string): string {
  return _currentUserId ? `${base}:${_currentUserId}` : base;
}

// ── 旧全局 key（仅用于迁移） ──
const LEGACY_KEYS = {
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
  /** @deprecated Directory structure determines type now */
  type?: "review" | "process";
  prompt?: string;
  /** @deprecated No longer distinguishing builtin vs user */
  builtin?: boolean;
  /** Which directory this skill belongs to: "skills" or "insights" */
  source?: "skills" | "insights";
}

export interface LocalSkills {
  configs: LocalSkillConfig[];
  selectedInsightSkill?: string;
  /** @deprecated Use selectedInsightSkill */
  selectedReviewSkill?: string;
  updatedAt: string;
}

export interface LocalSettings {
  asrMode: "realtime" | "upload";
  autoDeleteAudio: boolean;
  userType: "manager" | "creator" | null;
  proactiveInterval: number; // minutes
  theme: "light" | "dark" | "system";
  language: string;
  /** 执行动作前弹窗确认（默认 true）。关闭后静默执行 + toast 通知 */
  confirm_before_execute: boolean;
  /** 早报自动弹出时间（小时，0-23），默认 6 */
  morningBriefingHour: number;
  /** 晚报自动弹出时间（小时，0-23），默认 22 */
  eveningSummaryHour: number;
  /** 是否开启日报本地通知推送（默认 true） */
  dailyNotifications: boolean;
  /** 是否开启通知栏快捷录入（Android 常驻通知，默认 true） */
  quickCaptureNotification: boolean;
  /** 是否开启悬浮录入气泡（Android SYSTEM_ALERT_WINDOW，默认 false） */
  floatingBubble: boolean;
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
  asrMode: "realtime",
  autoDeleteAudio: false,
  userType: null,
  proactiveInterval: 30,
  theme: "system",
  language: "zh-CN",
  confirm_before_execute: true,
  morningBriefingHour: 6,
  eveningSummaryHour: 22,
  dailyNotifications: true,
  quickCaptureNotification: true,
  floatingBubble: false,
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

/**
 * 读取 scoped key，若为空且有 userId，尝试从旧全局 key 迁移。
 * 迁移是一次性的：读到旧数据后写入新 key。
 */
async function getScopedWithMigration<T>(base: string): Promise<T | null> {
  const key = scopedKey(base);
  const stored = await getTyped<T>(key);
  if (stored) return stored;

  // 向后兼容：从旧全局 key 迁移
  if (_currentUserId) {
    const legacy = await getTyped<T>(base);
    if (legacy) {
      await setTyped(key, legacy);
      return legacy;
    }
  }
  return null;
}

// ── Soul ──

export async function getSoul(): Promise<LocalSoul | null> {
  return getScopedWithMigration<LocalSoul>(LEGACY_KEYS.soul);
}

export async function setSoul(soul: LocalSoul): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.soul), soul);
}

// ── User Profile ──

export async function getUserProfile(): Promise<LocalUser | null> {
  return getScopedWithMigration<LocalUser>(LEGACY_KEYS.user);
}

export async function setUserProfile(user: LocalUser): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.user), user);
}

// ── Tools ──

export async function getTools(): Promise<LocalTools | null> {
  return getScopedWithMigration<LocalTools>(LEGACY_KEYS.tools);
}

export async function setTools(tools: LocalTools): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.tools), tools);
}

// ── Skills ──

export async function getSkills(): Promise<LocalSkills | null> {
  return getScopedWithMigration<LocalSkills>(LEGACY_KEYS.skills);
}

export async function setSkills(skills: LocalSkills): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.skills), skills);
}

// ── Settings ──

export async function getSettings(): Promise<LocalSettings> {
  const stored = await getScopedWithMigration<LocalSettings>(LEGACY_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(settings: LocalSettings): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.settings), settings);
}

export async function updateSettings(
  partial: Partial<LocalSettings>,
): Promise<LocalSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await setTyped(scopedKey(LEGACY_KEYS.settings), updated);
  return updated;
}

// ── Identity ──

export async function getIdentity(): Promise<LocalIdentity | null> {
  return getScopedWithMigration<LocalIdentity>(LEGACY_KEYS.identity);
}

export async function setIdentity(identity: LocalIdentity): Promise<void> {
  await setTyped(scopedKey(LEGACY_KEYS.identity), identity);
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
  const soul = await getSoul();
  return soul !== null;
}

/**
 * Clear current user's local config (for logout).
 */
export async function clearAllConfig(): Promise<void> {
  const bases = Object.values(LEGACY_KEYS);
  await Promise.all(
    bases.map((base) => removeItem(scopedKey(base))),
  );
}
