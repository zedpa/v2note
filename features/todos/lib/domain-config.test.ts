import { describe, it, expect } from "vitest";
import { getDomainStyle, DOMAIN_CONFIG } from "./domain-config";

describe("domain-config", () => {
  it("has all expected domains", () => {
    expect(DOMAIN_CONFIG).toHaveProperty("work");
    expect(DOMAIN_CONFIG).toHaveProperty("life");
    expect(DOMAIN_CONFIG).toHaveProperty("social");
    expect(DOMAIN_CONFIG).toHaveProperty("learning");
    expect(DOMAIN_CONFIG).toHaveProperty("health");
  });

  it("getDomainStyle returns correct structure", () => {
    const style = getDomainStyle("work");
    expect(style).toHaveProperty("config");
    expect(style).toHaveProperty("fgStyle");
    expect(style).toHaveProperty("bgStyle");
    expect(style).toHaveProperty("borderStyle");
    expect(style.config.label).toBe("工作");
  });

  it("defaults to work for unknown domain", () => {
    const style = getDomainStyle("nonexistent");
    expect(style.config.label).toBe("工作");
  });

  it("defaults to work for undefined", () => {
    const style = getDomainStyle(undefined);
    expect(style.config.label).toBe("工作");
  });
});
