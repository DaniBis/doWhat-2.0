import { isMutationMethod, normalizeMethod, shouldBroadcastMutation } from "../liveUpdates";

describe("liveUpdates", () => {
  it("detects non-read methods as mutations", () => {
    expect(isMutationMethod("POST")).toBe(true);
    expect(isMutationMethod("PATCH")).toBe(true);
    expect(isMutationMethod("DELETE")).toBe(true);
    expect(isMutationMethod("GET")).toBe(false);
    expect(isMutationMethod("HEAD")).toBe(false);
    expect(isMutationMethod(undefined)).toBe(false);
  });

  it("normalizes methods to upper-case with GET fallback", () => {
    expect(normalizeMethod("post")).toBe("POST");
    expect(normalizeMethod("Get")).toBe("GET");
    expect(normalizeMethod(undefined)).toBe("GET");
  });

  it("broadcasts for same-origin API mutations", () => {
    const sameOriginApiUrl = `${window.location.origin}/api/sessions/1`;
    const crossOriginApiUrl = "http://localhost:3002/api/sessions/1";
    expect(shouldBroadcastMutation("/api/sessions/1/attendance/host", { method: "POST" })).toBe(true);
    expect(shouldBroadcastMutation(sameOriginApiUrl, { method: "PATCH" })).toBe(true);
    expect(shouldBroadcastMutation(crossOriginApiUrl, { method: "PATCH" })).toBe(false);
    expect(shouldBroadcastMutation("/api/sessions/1/attendance", { method: "GET" })).toBe(false);
    expect(shouldBroadcastMutation("/map", { method: "POST" })).toBe(false);
  });
});
