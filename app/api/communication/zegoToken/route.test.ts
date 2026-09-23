/**
 * @jest-environment node
 */
import { GET } from "@/app/api/communication/zegoToken/route";

describe("GET /api/communication/zegoToken", () => {
  it("returns 410 Gone with a deprecation message", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.message).toMatch(/removed/i);
  });
});
