import { describe, it, expect } from "vitest";
import { getProjectColor, PROJECT_COLORS } from "./project-colors";

describe("project-colors", () => {
  it("should_return_first_color_for_index_0", () => {
    const color = getProjectColor(0);
    expect(color).toEqual(PROJECT_COLORS[0]);
  });

  it("should_cycle_colors_when_index_exceeds_palette_size", () => {
    const color = getProjectColor(PROJECT_COLORS.length);
    expect(color).toEqual(PROJECT_COLORS[0]);
  });

  it("should_return_different_colors_for_adjacent_indices", () => {
    for (let i = 0; i < PROJECT_COLORS.length - 1; i++) {
      expect(getProjectColor(i)).not.toEqual(getProjectColor(i + 1));
    }
  });

  it("should_have_8_colors_in_palette", () => {
    expect(PROJECT_COLORS).toHaveLength(8);
  });

  it("should_each_color_have_bg_text_border_properties", () => {
    for (const color of PROJECT_COLORS) {
      expect(color).toHaveProperty("bg");
      expect(color).toHaveProperty("text");
      expect(color).toHaveProperty("border");
    }
  });
});
