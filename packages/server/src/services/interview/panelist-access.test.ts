import { describe, expect, it } from "vitest";
import { interviewViewerScope } from "./interview.service";

describe("panelist interview visibility", () => {
  it("scopes employee panelists to their own assigned interviews", () => {
    expect(interviewViewerScope({ role: "employee", userId: 42 })).toEqual({ panelistUserId: 42 });
  });

  it("keeps organization-wide visibility for recruitment administrators", () => {
    expect(interviewViewerScope({ role: "hr_admin", userId: 42 })).toEqual({});
  });
});
