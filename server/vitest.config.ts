import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env before workers spawn so DATABASE_URL is available to the integration test.
// In CI where no .env exists, config() silently no-ops and localEnv is undefined.
const { parsed: localEnv } = config({ path: ".env" });

export default defineConfig({
    test: {
        env: localEnv ?? {},
    },
});
