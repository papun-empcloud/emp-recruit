import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { parseResumeText } from "./resume-scoring.service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((file) => fs.rm(file, { force: true })));
});

describe("resume parsing", () => {
  it("parses an absolute plain-text resume path", async () => {
    const file = path.join(os.tmpdir(), `resume-${Date.now()}.txt`);
    created.push(file);
    await fs.writeFile(file, "Priya Shah\nTypeScript React Node.js");

    await expect(parseResumeText(file)).resolves.toContain("TypeScript React");
  });
});
