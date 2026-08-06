import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  findOne: vi.fn(), findMany: vi.fn(), raw: vi.fn(), update: vi.fn(),
  create: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../db/adapters", () => ({ getDB: () => db }));
vi.mock("../db/empcloud", () => ({ findUserById: vi.fn() }));
vi.mock("../services/email/email.service", () => ({ sendEmail: vi.fn(), renderTemplate: (value: string) => value }));
vi.mock("../services/assessment/assessment.service", () => ({ inviteCandidate: vi.fn() }));
vi.mock("../services/interview/interview.service", () => ({ scheduleInterview: vi.fn(), sendInterviewInvitation: vi.fn() }));

import { findDuplicates, prepareFormValues, processDueCampaigns, replaceFormFields } from "../services/recruitment-ops/recruitment-ops.service";

describe("Recruitment Operations resilience", () => {
  beforeEach(() => {
    for (const mock of Object.values(db)) mock.mockReset();
  });

  it("recovers interrupted recipients and retries partial campaigns", async () => {
    db.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([[]]);

    await processDueCampaigns(7);

    expect(db.raw.mock.calls[0][0]).toContain("email_campaign_recipients");
    expect(db.raw.mock.calls[0][0]).toContain("r.status='sending'");
    expect(db.raw.mock.calls[2][0]).toContain("status='partial'");
  });

  it("queries duplicate signals in SQL instead of truncating the organization to 1,000 candidates", async () => {
    db.findOne.mockResolvedValue({ id: "candidate-1", email: "TEST@Example.com", phone: null, linkedin_url: null });
    db.raw.mockResolvedValue([[]]);

    await findDuplicates(7, "candidate-1");

    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining("LOWER(TRIM"), expect.arrayContaining([7, "candidate-1", "test@example.com"]));
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed choice fields before replacing a form", async () => {
    db.findOne.mockResolvedValue({ id: "job-1" });

    await expect(replaceFormFields(7, "job-1", [{ label: "Region", field_key: "region", field_type: "single_choice", options: [] }]))
      .rejects.toThrow("requires at least one non-empty option");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("validates submitted custom values against their configured field type", async () => {
    db.findMany.mockResolvedValue({ data: [{ id: "field-1", field_key: "years", label: "Years", field_type: "number", required: true, is_active: true }], total: 1 });

    await expect(prepareFormValues(7, "job-1", { years: "many" })).rejects.toThrow("Required application fields are missing");
  });

  it("rejects when any selected multi-choice option matches the knockout value", async () => {
    db.findMany.mockResolvedValue({ data: [{ id: "field-2", field_key: "constraints", label: "Constraints", field_type: "multi_choice", options: ["None", "No weekends"], is_knockout: true, knockout_value: "No weekends", is_active: true }], total: 1 });

    const prepared = await prepareFormValues(7, "job-1", { constraints: ["None", "No weekends"] });

    expect(prepared.knockoutFailed).toBe(true);
    expect(prepared.rows[0].knockout_failed).toBe(true);
  });
});
