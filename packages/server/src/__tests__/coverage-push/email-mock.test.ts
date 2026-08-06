import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters", () => {
  const m: any = {
    findOne: vi.fn(),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    raw: vi.fn().mockResolvedValue([[]]),
    updateMany: vi.fn(),
  };
  return { getDB: () => m, __mockDB: m };
});

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../config", () => ({
  config: {
    email: { host: "localhost", port: 587, user: "testuser", password: "testpass", from: "no-reply@test.com" },
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
    }),
  },
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

import * as emailService from "../../services/email/email.service";

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
});

describe("Email Service", () => {
  describe("listTemplates", () => {
    it("returns templates for org", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "e1", name: "Welcome" }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await emailService.listTemplates(ORG);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Welcome");
    });
  });

  describe("getTemplateById", () => {
    it("returns template by id", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "e1", name: "Invite" });
      const result = await emailService.getTemplateById(ORG, "e1");
      expect(result.name).toBe("Invite");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(emailService.getTemplateById(ORG, "x")).rejects.toThrow();
    });
  });

  describe("createTemplate", () => {
    it("creates email template", async () => {
      mockDB.create.mockResolvedValueOnce({ id: "e1", name: "New" });
      const result = await emailService.createTemplate(ORG, {
        name: "New", trigger: "interview", subject: "Hi", body: "<p>Hi</p>",
      });
      expect(result.name).toBe("New");
    });

    it("defaults is_active to true", async () => {
      mockDB.create.mockResolvedValueOnce({ id: "e2", is_active: true });
      await emailService.createTemplate(ORG, {
        name: "T", trigger: "t", subject: "S", body: "B",
      });
      expect(mockDB.create).toHaveBeenCalledWith("email_templates", expect.objectContaining({
        is_active: true,
      }));
    });
  });

  describe("updateTemplate", () => {
    it("updates template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "e1" });
      mockDB.update.mockResolvedValueOnce({ id: "e1", name: "Updated" });
      const result = await emailService.updateTemplate(ORG, "e1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws when template not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(emailService.updateTemplate(ORG, "x", { name: "Y" })).rejects.toThrow();
    });
  });

  describe("deleteTemplate", () => {
    it("deletes a template owned by the organization", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "e1", organization_id: ORG });
      mockDB.delete.mockResolvedValueOnce(true);

      await expect(emailService.deleteTemplate(ORG, "e1")).resolves.toBeUndefined();
      expect(mockDB.delete).toHaveBeenCalledWith("email_templates", "e1");
    });

    it("does not delete a template outside the organization", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);

      await expect(emailService.deleteTemplate(ORG, "other-org-template")).rejects.toThrow();
      expect(mockDB.delete).not.toHaveBeenCalled();
    });
  });

  describe("renderTemplate", () => {
    it("renders Handlebars template", () => {
      const result = emailService.renderTemplate("Hello {{name}}!", { name: "World" });
      expect(result).toBe("Hello World!");
    });

    it("handles missing variables", () => {
      const result = emailService.renderTemplate("Hello {{name}}", {});
      expect(result).toBe("Hello ");
    });
  });

  describe("sendEmail", () => {
    it("sends email via transporter", async () => {
      const result = await emailService.sendEmail("to@test.com", "Subject", "<p>Body</p>");
      expect(result.messageId).toBe("mock-msg-id");
    });
  });

  describe("sendTemplatedEmail", () => {
    it("renders and sends template", async () => {
      mockDB.findOne.mockResolvedValueOnce({
        id: "e1", subject: "Hi {{name}}", body: "<p>Hello {{name}}</p>",
        is_active: true, trigger: "invite",
      });
      const result = await emailService.sendTemplatedEmail(ORG, "invite", "to@test.com", { name: "Test" });
      expect(result).toBeTruthy();
      expect(result!.messageId).toBe("mock-msg-id");
    });

    it("returns null when no active template found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      const result = await emailService.sendTemplatedEmail(ORG, "unknown", "to@test.com", {});
      expect(result).toBeNull();
    });
  });
});
