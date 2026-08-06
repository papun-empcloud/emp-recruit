import { beforeEach, describe, expect, it, vi } from "vitest";

const raw = vi.fn();

vi.mock("../db/adapters", () => ({
  getDB: () => ({ raw }),
}));

vi.mock("../db/empcloud", () => ({
  findUserById: vi.fn(),
}));

import { recruiterPerformance } from "../services/recruitment-ops/recruitment-ops.service";

describe("recruiterPerformance", () => {
  beforeEach(() => {
    raw.mockReset();
    raw.mockResolvedValue([[]]);
  });

  it("quotes the reserved function result alias for MySQL", async () => {
    await recruiterPerformance(1);

    expect(raw).toHaveBeenCalledWith(
      expect.stringContaining("AS `function`"),
      [1],
    );
  });
});
