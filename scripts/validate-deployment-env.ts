import "dotenv/config";
import { validateDeploymentEnvironment } from "../lib/environment";

try {
  validateDeploymentEnvironment();
  console.log("[env] Deployment environment is valid.");
} catch (error) {
  console.error(
    "[env] Deployment environment is invalid:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
