import { runInterview } from "./orchestrator.js";

runInterview()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Interview bot failed:", err);
    process.exit(1);
  });
