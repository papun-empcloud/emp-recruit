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

vi.mock("uuid", () => ({ v4: () => "mock-uuid" }));

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
}));

vi.mock("handlebars", () => ({
  default: { compile: vi.fn(() => (vars: any) => `<p>Hello ${vars.candidateName || "test"}</p>`) },
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn().mockResolvedValue("<p>{{candidateName}}</p>"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

import * as offerLetterService from "../../services/offer/offer-letter.service";

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
});

describe("Offer Letter Service", () => {
  describe("previewLetterTemplate", () => {
    it("renders supported variables using realistic sample data", () => {
      const result = offerLetterService.previewLetterTemplate(
        "<p>{{candidate.fullName}} — {{offer.designation}}</p>",
      );
      expect(result.content).toContain("<p>Hello");
      expect(result.unknown_variables).toEqual([]);
    });

    it("reports variables that cannot be populated", () => {
      const result = offerLetterService.previewLetterTemplate("<p>{{candidate.middleName}}</p>");
      expect(result.unknown_variables).toEqual(["candidate.middleName"]);
    });
  });

  describe("createLetterTemplate", () => {
    it("creates a template successfully", async () => {
      mockDB.create.mockResolvedValueOnce({ id: "tpl-1", name: "Standard", organization_id: ORG, is_default: false, is_active: true, content_template: "<p>Hello</p>" });
      const result = await offerLetterService.createLetterTemplate(ORG, { name: "Standard", content_template: "<p>Hello</p>" });
      expect(result.name).toBe("Standard");
    });

    it("throws when name or content missing", async () => {
      await expect(offerLetterService.createLetterTemplate(ORG, { name: "", content_template: "" })).rejects.toThrow();
    });

    it("rejects templates containing unsupported variables", async () => {
      await expect(offerLetterService.createLetterTemplate(ORG, {
        name: "Broken",
        content_template: "<p>{{candidate.middleName}}</p>",
      })).rejects.toThrow(/Unknown template variable/);
    });

    it("unsets other defaults when is_default=true", async () => {
      mockDB.updateMany.mockResolvedValueOnce(1);
      mockDB.create.mockResolvedValueOnce({ id: "tpl-2", is_default: true });
      await offerLetterService.createLetterTemplate(ORG, { name: "Default", content_template: "<p>Hi</p>", is_default: true });
      expect(mockDB.updateMany).toHaveBeenCalledWith(
        "offer_letter_templates",
        expect.objectContaining({ organization_id: ORG, is_default: true }),
        { is_default: false },
      );
    });
  });

  describe("listLetterTemplates", () => {
    it("returns active templates", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "t1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await offerLetterService.listLetterTemplates(ORG);
      expect(result).toHaveLength(1);
    });
  });

  describe("assertLetterTemplateAvailable", () => {
    it("rejects inactive or cross-organization template selections", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerLetterService.assertLetterTemplateAvailable(ORG, "tpl-missing")).rejects.toThrow();
      expect(mockDB.findOne).toHaveBeenCalledWith("offer_letter_templates", {
        id: "tpl-missing",
        organization_id: ORG,
        is_active: true,
      });
    });
  });

  describe("generateOfferLetter", () => {
    it("generates letter from template and offer data", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "off-1", organization_id: ORG, candidate_id: "c-1", job_title: "Engineer" }); // offer
      mockDB.findById.mockResolvedValueOnce({ id: "c-1", first_name: "John", last_name: "Doe", email: "j@d.com" }); // candidate
      mockDB.findOne.mockResolvedValueOnce({ id: "tpl-1", content_template: "<p>Dear {{candidateName}}</p>" }); // template
      mockDB.create.mockResolvedValueOnce({ id: "mock-uuid", content: "<p>Hello test</p>" });
      const result = await offerLetterService.generateOfferLetter(ORG, "off-1", "tpl-1", 1);
      expect(result).toBeDefined();
      expect(mockDB.create).toHaveBeenCalled();
    });

    it("throws when offer not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerLetterService.generateOfferLetter(ORG, "x", "t1", 1)).rejects.toThrow();
    });
  });

  describe("sendOfferLetter", () => {
    it("sends email and updates sent_at", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "let-1", offer_id: "off-1", content: "<p>Hi</p>" }); // letter
      mockDB.findOne.mockResolvedValueOnce({ id: "off-1", candidate_id: "c-1", job_title: "Dev" }); // offer
      mockDB.findById.mockResolvedValueOnce({ id: "c-1", email: "test@test.com", first_name: "A" }); // candidate
      mockDB.update.mockResolvedValueOnce({ id: "let-1", sent_at: new Date() });
      const result = await offerLetterService.sendOfferLetter(ORG, "off-1");
      expect(result.sent_at).toBeTruthy();
    });

    it("throws when letter not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerLetterService.sendOfferLetter(ORG, "x")).rejects.toThrow();
    });

    it("throws when offer not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "let-1", content: "c" });
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerLetterService.sendOfferLetter(ORG, "off-1")).rejects.toThrow();
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "let-1", content: "c" });
      mockDB.findOne.mockResolvedValueOnce({ id: "off-1", candidate_id: "c-1" });
      mockDB.findById.mockResolvedValueOnce(null);
      await expect(offerLetterService.sendOfferLetter(ORG, "off-1")).rejects.toThrow();
    });
  });
});
