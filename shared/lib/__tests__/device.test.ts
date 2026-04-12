import { describe, it, expect } from "vitest";
import { getDeviceId, clearDeviceCache } from "../device";

describe("device — deprecated no-op", () => {
  it("should_return_empty_string_since_device_id_is_deprecated", async () => {
    const id = await getDeviceId();
    expect(id).toBe("");
  });

  it("should_not_throw_when_clearDeviceCache_called", () => {
    expect(() => clearDeviceCache()).not.toThrow();
  });
});
