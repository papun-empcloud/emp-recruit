import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters", () => {
  const m: any = {
    findOne: vi.fn(),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    raw: vi.fn().mockResolvedValue([[]]),
    updateMany: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return { getDB: () => m, __mockDB: m };
});

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg", is_active: true }),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../config", () => ({
  config: {
    jwt: { secret: "test-secret", accessExpiry: "1h", refreshExpiry: "7d" },
    email: { host: "localhost", port: 587, user: "u", password: "p", from: "no-reply@t.com" },
    cors: { origin: "http://localhost:3000" },
    db: { host: "localhost", port: 3306, user: "u", password: "p", name: "test", poolMin: 2, poolMax: 10 },
    empcloudDb: { host: "localhost", port: 3306, user: "u", password: "p", name: "empcloud" },
    openai: { apiKey: "test-key", model: "gpt-4" },
  },
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

const ORG = 5;

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset all mock implementations
  for (const key of Object.keys(mockDB)) {
    if (typeof mockDB[key]?.mockReset === "function") mockDB[key].mockReset();
  }
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
  mockDB.raw.mockResolvedValue([[]]);
  mockDB.deleteMany.mockResolvedValue(1);
});

// ── Job Service ──────────────────────────────────────────────────────
import * as jobService from "../../services/job/job.service";

describe("Job Service", () => {
  const baseJob: any = {
    id: "j-1", organization_id: ORG, title: "Software Engineer",
    department: "Engineering", location: "Bengaluru", employment_type: "full_time",
    experience_min: 2, experience_max: 5, salary_min: 500000, salary_max: 1500000,
    description: "Build things", requirements: "JS, TS", status: "open",
    skills: JSON.stringify(["JavaScript", "TypeScript"]),
  };

  describe("createJob", () => {
    it("creates job posting", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]); // ensureUniqueSlug - no existing
      mockDB.create.mockResolvedValueOnce(baseJob);
      const result = await jobService.createJob(ORG, {
        title: "Software Engineer", department: "Engineering",
        description: "Build things",
      }, 1);
      expect(result.title).toBe("Software Engineer");
    });
  });

  describe("updateJob", () => {
    it("updates job", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.update.mockResolvedValueOnce({ ...baseJob, title: "Senior Engineer" });
      const result = await jobService.updateJob(ORG, "j-1", { title: "Senior Engineer" });
      expect(result.title).toBe("Senior Engineer");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.updateJob(ORG, "x", {})).rejects.toThrow();
    });
  });

  describe("getJob", () => {
    it("returns job details", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      const result = await jobService.getJob(ORG, "j-1");
      expect(result.id).toBe("j-1");
      expect(result.title).toBe("Software Engineer");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.getJob(ORG, "x")).rejects.toThrow();
    });
  });

  describe("listJobs", () => {
    it("returns paginated jobs", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [baseJob], total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.count.mockResolvedValueOnce(5); // application count
      const result = await jobService.listJobs(ORG, {});
      expect(result.data).toHaveLength(1);
    });

    it("applies status filter", async () => {
      mockDB.raw
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ ...baseJob, status: "closed" }]]);
      await jobService.listJobs(ORG, { status: "closed" });
      expect(mockDB.raw).toHaveBeenCalledWith(
        expect.stringContaining("LOWER(TRIM(status)) = ?"),
        [ORG, "closed"],
      );
    });
  });

  describe("changeStatus", () => {
    it("changes job status to open", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseJob, status: "draft" });
      mockDB.update.mockResolvedValueOnce({ ...baseJob, status: "open" });
      const result = await jobService.changeStatus(ORG, "j-1", "open" as any);
      expect(result.status).toBe("open");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.changeStatus(ORG, "x", "open" as any)).rejects.toThrow();
    });

    it("changes to closed", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseJob, status: "open" });
      mockDB.update.mockResolvedValueOnce({ ...baseJob, status: "closed" });
      const result = await jobService.changeStatus(ORG, "j-1", "closed" as any);
      expect(result.status).toBe("closed");
    });
  });

  describe("getJobAnalytics", () => {
    it("returns job analytics", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.count.mockResolvedValueOnce(10); // totalApps
      mockDB.raw.mockResolvedValueOnce([[{ stage: "applied", count: 10 }]]); // stageRows
      const result = await jobService.getJobAnalytics(ORG, "j-1");
      expect(result).toBeDefined();
    });
  });

  describe("deleteJob", () => {
    it("deletes job with no applications", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.count.mockResolvedValueOnce(0);
      mockDB.delete.mockResolvedValueOnce(true);
      const result = await jobService.deleteJob(ORG, "j-1");
      expect(result).toBe(true);
    });

    it("deletes job even when applications exist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.delete.mockResolvedValueOnce(true);
      const result = await jobService.deleteJob(ORG, "j-1");
      expect(result).toBe(true);
    });
  });
});

// ── Analytics Service ─────────────────────────────────────────────────
import * as analyticsService from "../../services/analytics/analytics.service";

describe("Analytics Service", () => {
  describe("getDashboard", () => {
    it("returns dashboard overview stats", async () => {
      mockDB.count.mockResolvedValueOnce(5); // open jobs
      mockDB.count.mockResolvedValueOnce(50); // total candidates
      mockDB.count.mockResolvedValueOnce(30); // all applications
      mockDB.count.mockResolvedValueOnce(3); // rejected
      mockDB.count.mockResolvedValueOnce(2); // withdrawn
      mockDB.count.mockResolvedValueOnce(4); // hired
      const result = await analyticsService.getDashboard(ORG);
      expect(result.openJobs).toBe(5);
      expect(result.totalCandidates).toBe(50);
      expect(result.activeApplications).toBe(21);
    });
  });

  describe("getPipelineFunnel", () => {
    it("returns funnel data by stage", async () => {
      // getPipelineFunnel calls db.count for each stage
      for (let i = 0; i < 10; i++) {
        mockDB.count.mockResolvedValueOnce(10 - i);
      }
      const result = await analyticsService.getPipelineFunnel(ORG);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getTimeToHire", () => {
    it("returns time-to-hire metrics", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { avg_days: 15, min_days: 5, max_days: 30 },
      ]]);
      const result = await analyticsService.getTimeToHire(ORG);
      expect(result).toBeDefined();
    });

    it("handles no data", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]);
      const result = await analyticsService.getTimeToHire(ORG);
      expect(result).toBeDefined();
    });
  });

  describe("getSourceEffectiveness", () => {
    it("returns source breakdown", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { source: "direct", count: 10 },
        { source: "referral", count: 5 },
      ]]);
      const result = await analyticsService.getSourceEffectiveness(ORG);
      expect(result).toBeDefined();
    });
  });
});

// ── Comparison Service ───────────────────────────────────────────────
import * as comparisonService from "../../services/comparison/comparison.service";

describe("Comparison Service", () => {
  describe("compareCandidates", () => {
    it("compares multiple candidates for a job", async () => {
      // compareCandidates(orgId, applicationIds) uses raw queries
      // For each applicationId: raw(application+candidate+job), raw(score), raw(interviews+feedback)
      // app-1
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-1", candidate_id: "c-1", job_id: "j-1", stage: "interview", first_name: "A", last_name: "B", email: "a@t.com", experience_years: 3, candidate_skills: JSON.stringify(["JS"]), job_title: "SWE" }]]);
      mockDB.raw.mockResolvedValueOnce([[{ overall_score: 80, skills_score: 70, experience_score: 90, recommendation: "yes", matched_skills: JSON.stringify(["JS"]), missing_skills: JSON.stringify([]) }]]);
      mockDB.raw.mockResolvedValueOnce([[{ id: "i-1", title: "Round 1", type: "phone", status: "completed", overall_score: 8, technical_score: 7, communication_score: 8, cultural_fit_score: 9, recommendation: "yes", strengths: "Good", weaknesses: "None" }]]);
      // app-2
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-2", candidate_id: "c-2", job_id: "j-1", stage: "screened", first_name: "C", last_name: "D", email: "c@t.com", experience_years: 5, candidate_skills: JSON.stringify(["TS"]), job_title: "SWE" }]]);
      mockDB.raw.mockResolvedValueOnce([[]]); // no score
      mockDB.raw.mockResolvedValueOnce([[]]); // no interviews

      const result = await comparisonService.compareCandidates(ORG, ["app-1", "app-2"]);
      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
    });
  });
});

// ── Job Description Service ──────────────────────────────────────────
import * as jdService from "../../services/job-description/job-description.service";

describe("Job Description Service", () => {
  describe("generateJobDescription", () => {
    it("generates a job description using template", async () => {
      const result = await jdService.generateJobDescription({
        title: "Software Engineer",
        seniority: "mid",
        skills: ["JavaScript", "TypeScript", "React"],
        department: "Engineering",
        location: "Bengaluru",
        employment_type: "full_time",
      });
      expect(result).toBeDefined();
      expect(result.overview).toBeTruthy();
      expect(result.responsibilities.length).toBeGreaterThan(0);
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.full_description).toBeTruthy();
    });

    it("generates for intern seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Intern",
        seniority: "intern",
        skills: ["Python"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for senior seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Senior Dev",
        seniority: "senior",
        skills: ["Go", "Kubernetes"],
        company_description: "A fintech startup",
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for lead seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Lead Engineer",
        seniority: "lead",
        skills: ["Architecture", "AWS"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for director seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Director of Engineering",
        seniority: "director",
        skills: ["Leadership"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for c_level seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "CTO",
        seniority: "c_level",
        skills: ["Strategy"],
        salary_range: "$200k-$400k",
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for junior seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Junior Dev",
        seniority: "junior",
        skills: ["HTML", "CSS"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for vp seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "VP Engineering",
        seniority: "vp",
        skills: ["Strategy", "Management"],
      });
      expect(result.full_description).toBeTruthy();
    });
  });
});
