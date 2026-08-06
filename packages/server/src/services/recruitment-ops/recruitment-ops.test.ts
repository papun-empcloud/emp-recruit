import { describe, expect, it } from "vitest";
import { candidateMatchSignals, extractResumeIdentity, ruleMatches } from "./recruitment-ops.service";

describe("recruitment operations", () => {
  it("finds normalized duplicate candidate signals without fuzzy false positives", () => {
    expect(candidateMatchSignals(
      { email: "PRIYA@example.com ", phone: "+91 98765-43210", linkedin_url: "https://linkedin.com/in/priya/" },
      { email: "priya@example.com", phone: "9876543210", linkedin_url: "linkedin.com/in/priya" },
    )).toEqual(["email", "phone", "linkedin"]);
  });

  it("matches a stage automation only for its configured stage", () => {
    const rule = { trigger: "application_stage_changed", trigger_value: "rejected" };
    expect(ruleMatches(rule, { trigger: "application_stage_changed", value: "rejected" })).toBe(true);
    expect(ruleMatches(rule, { trigger: "application_stage_changed", value: "interview" })).toBe(false);
  });

  it("extracts a usable identity from resume text", () => {
    expect(extractResumeIdentity("Priya Shah\npriya.shah@example.com\n+91 98765 43210\nReact TypeScript")).toEqual({
      first_name: "Priya", last_name: "Shah", email: "priya.shah@example.com", phone: "+91 98765 43210",
    });
  });
});
