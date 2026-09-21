/**
 * @jest-environment node
 */
import { GET } from "@/app/api/media/route";

const mockGetServerSession = jest.fn();
const mockDownload = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        download: (...args: unknown[]) => mockDownload(...args),
      }),
    },
  },
  SUPABASE_BUCKET: "uploads",
}));

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

function makeRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/media", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockDownload.mockReset();
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
  });

  it("rejects anonymous requests with no session and no internal secret", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/media?path=some/file.png");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("rejects a request with a wrong internal secret and no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/media?path=some/file.png", {
      "x-internal-secret": "wrong-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("serves the file for a logged-in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=some/file.png");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockDownload).toHaveBeenCalledWith("some/file.png");
  });

  it("serves the file for the internal service-to-service secret with no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=some/file.png", {
      "x-internal-secret": "test-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("rejects a bucket other than the configured one, even for a logged-in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const req = makeRequest(
      "http://localhost/api/media?path=some/file.png&bucket=some-other-bucket"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
