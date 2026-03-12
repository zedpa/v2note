import { describe, it, expect } from "vitest";
import React from "react";
import { ImpactDots } from "./impact-dots";

// Simple render test without full DOM - just verify component logic
describe("ImpactDots", () => {
  it("returns null for low impact (1-3)", () => {
    const result = ImpactDots({ impact: 1, domain: "work" });
    expect(result).toBeNull();

    expect(ImpactDots({ impact: 2 })).toBeNull();
    expect(ImpactDots({ impact: 3 })).toBeNull();
  });

  it("renders number for medium impact (4-6)", () => {
    const result = ImpactDots({ impact: 5, domain: "work" });
    expect(result).not.toBeNull();
    // Should be a span element with the number
    expect(result?.props.children).toBe(5);
  });

  it("renders flame for high impact (7-8)", () => {
    const result = ImpactDots({ impact: 7, domain: "work" });
    expect(result).not.toBeNull();
    // Should be a div containing Flame icon
    expect(result?.props.className).not.toContain("animate-pulse");
  });

  it("renders pulsing flame for critical impact (9-10)", () => {
    const result = ImpactDots({ impact: 9, domain: "work" });
    expect(result).not.toBeNull();
    // Should have animate-pulse class
    expect(result?.props.className).toContain("animate-pulse");
  });

  it("renders pulsing flame with number for impact 10", () => {
    const result = ImpactDots({ impact: 10, domain: "work" });
    expect(result).not.toBeNull();
    expect(result?.props.className).toContain("animate-pulse");
  });
});
