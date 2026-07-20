// =============================================================================
// EMP RECRUIT — Middleware, Error, Rate Limit, Portal Auth, Errors Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config", () => ({
  config: { jwt: { secret: "recruit-test-secret" } },
}));
vi.mock("@emp-recruit/shared", () => ({ default: {} }));

import { authenticate, authorize } from "../api/middleware/auth.middleware";
import { portalAuthenticate } from "../api/middleware/portal-auth.middleware";
import { errorHandler } from "../api/middleware/error.middleware";
import { rateLimit } from "../api/middleware/rate-limit.middleware";
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError } from "../utils/errors";
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

function mockReq(overrides: any = {}): any {
  return { headers: {}, params: {}, query: {}, body: {}, ip: "127.0.0.1", ...overrides };
}
function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// Auth Middleware
// =============================================================================
describe("Recruit Auth Middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authenticate()", () => {
    it("rejects missing auth", () => {
      const next = vi.fn();
      authenticate(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("internal service bypass (GET only)", () => {
      const orig = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "s123";
      const req = mockReq({
        method: "GET",
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "s123" },
        query: { organization_id: "3" },
      });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.empcloudOrgId).toBe(3);
      expect(req.user.recruitProfileId).toBeNull();
      process.env.INTERNAL_SERVICE_SECRET = orig;
    });

    it("internal service bypass is rejected for non-GET (audit H7)", () => {
      const orig = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "s123";
      const req = mockReq({
        method: "POST",
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "s123" },
        query: { organization_id: "3" },
      });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      // Not a GET → bypass skipped → falls through to the missing-auth 401.
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      expect(req.user).toBeUndefined();
      process.env.INTERNAL_SERVICE_SECRET = orig;
    });

    it("authenticates valid JWT", () => {
      const token = jwt.sign({ empcloudUserId: 1, empcloudOrgId: 2, role: "hr_admin" }, "recruit-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.empcloudUserId).toBe(1);
    });

    it("rejects expired token", () => {
      const token = jwt.sign({ sub: "1" }, "recruit-test-secret", { expiresIn: "-1s" });
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
    });

    it("rejects invalid token", () => {
      const req = mockReq({ headers: { authorization: "Bearer bad" } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });
  });

  describe("authorize()", () => {
    it("rejects unauthenticated", () => {
      const next = vi.fn();
      authorize("hr_admin")(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("rejects wrong role", () => {
      const next = vi.fn();
      authorize("org_admin")(mockReq({ user: { role: "employee" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it("allows matching role", () => {
      const next = vi.fn();
      authorize("hr_admin")(mockReq({ user: { role: "hr_admin" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});

// =============================================================================
// Portal Auth Middleware
// =============================================================================
describe("Recruit Portal Auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing portal token", () => {
    const next = vi.fn();
    portalAuthenticate(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authenticates valid portal token from header", () => {
    const token = jwt.sign(
      { type: "portal", candidateId: "cand-1", email: "c@t.com", orgId: 5 },
      "recruit-test-secret",
      { issuer: "emp-recruit-portal" }
    );
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    portalAuthenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.candidate).toEqual({ id: "cand-1", email: "c@t.com", orgId: 5 });
  });

  it("authenticates via query token", () => {
    const token = jwt.sign(
      { type: "portal", candidateId: "cand-2", email: "d@t.com", orgId: 6 },
      "recruit-test-secret",
      { issuer: "emp-recruit-portal" }
    );
    const req = mockReq({ query: { token } });
    const next = vi.fn();
    portalAuthenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.candidate.id).toBe("cand-2");
  });

  it("rejects non-portal token (missing type=portal)", () => {
    const token = jwt.sign(
      { type: "regular", candidateId: "x" },
      "recruit-test-secret",
      { issuer: "emp-recruit-portal" }
    );
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    portalAuthenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
  });

  it("rejects expired portal token", () => {
    const token = jwt.sign(
      { type: "portal", candidateId: "x", email: "x@t.com", orgId: 1 },
      "recruit-test-secret",
      { issuer: "emp-recruit-portal", expiresIn: "-1s" }
    );
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    portalAuthenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
  });

  it("rejects wrong issuer", () => {
    const token = jwt.sign(
      { type: "portal", candidateId: "x" },
      "recruit-test-secret",
      { issuer: "wrong-issuer" }
    );
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    portalAuthenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
  });
});

// =============================================================================
// Error Handler
// =============================================================================
describe("Recruit Error Handler", () => {
  it("handles AppError", () => {
    const res = mockRes();
    errorHandler(new AppError(422, "V", "bad"), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("handles unknown error", () => {
    const res = mockRes();
    errorHandler(new Error("boom"), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// Rate Limit
// =============================================================================
describe("Recruit Rate Limit", () => {
  it("skips when disabled", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = "true";
    const next = vi.fn();
    rateLimit({ windowMs: 1000, max: 1 })(mockReq({ ip: "rec-skip" }), mockRes(), next);
    expect(next).toHaveBeenCalled();
    process.env.RATE_LIMIT_DISABLED = orig;
  });

  it("blocks over limit", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    const ip = `rec-block-${Date.now()}`;
    limiter(mockReq({ ip }), mockRes(), vi.fn());
    const res = mockRes();
    limiter(mockReq({ ip }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    process.env.RATE_LIMIT_DISABLED = orig;
  });
});

// =============================================================================
// Error Classes & Response Helpers
// =============================================================================
describe("Recruit Error Classes", () => {
  it("AppError", () => { expect(new AppError(400, "X", "m").statusCode).toBe(400); });
  it("NotFoundError", () => { expect(new NotFoundError("Job").message).toContain("Job"); });
  it("ValidationError", () => { expect(new ValidationError("bad").statusCode).toBe(400); });
  it("UnauthorizedError", () => { expect(new UnauthorizedError().statusCode).toBe(401); });
  it("ForbiddenError", () => { expect(new ForbiddenError().statusCode).toBe(403); });
  it("ConflictError", () => { expect(new ConflictError("dup").statusCode).toBe(409); });
});

describe("Recruit Response Helpers", () => {
  it("sendSuccess", () => {
    const res = mockRes();
    sendSuccess(res, { ok: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("sendError", () => {
    const res = mockRes();
    sendError(res, 400, "BAD", "msg");
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("sendPaginated", () => {
    const res = mockRes();
    sendPaginated(res, [1, 2], 20, 1, 10);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
