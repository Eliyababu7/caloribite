import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "caloribite-domain-tests-"),
);

const sourceFiles = [
  "src/services/foodSearch/__tests__/scanner.test.ts",
  "src/services/foodSearch/__tests__/barcodeLookup.test.ts",
  "supabase/functions/food-search/__tests__/openFoodFactsValidation.test.ts",
  "supabase/functions/food-search/__tests__/normalizeOpenFoodFacts.test.ts",
  "supabase/functions/food-search/__tests__/openFoodFactsClient.test.ts",
  "supabase/functions/food-search/__tests__/openFoodFactsHandler.test.ts",

  "src/types/foodSearch.ts",
  "src/services/foodSearch/__tests__/foodSearchIntegration.test.ts",
  "src/services/foodSearch/normalizeFoodResult.ts",
  "src/services/foodSearch/calculateServingNutrition.ts",
  "src/services/foodSearch/__tests__/normalizeFoodResult.test.ts",
  "src/services/foodSearch/__tests__/calculateServingNutrition.test.ts",
  "supabase/functions/food-search/types.ts",
  "supabase/functions/food-search/validation.ts",
  "supabase/functions/food-search/cors.ts",
  "supabase/functions/food-search/normalizeUsdaFood.ts",
  "supabase/functions/food-search/usdaClient.ts",
  "supabase/functions/food-search/index.ts",
  "supabase/functions/food-search/__tests__/validation.test.ts",
  "supabase/functions/food-search/__tests__/normalizeUsdaFood.test.ts",
  "supabase/functions/food-search/__tests__/usdaClient.test.ts",
  "supabase/functions/food-search/__tests__/handler.test.ts",
];

const testFiles = [
  "src/services/foodSearch/__tests__/scanner.test.js",
  "src/services/foodSearch/__tests__/barcodeLookup.test.js",
  "supabase/functions/food-search/__tests__/openFoodFactsValidation.test.js",
  "supabase/functions/food-search/__tests__/normalizeOpenFoodFacts.test.js",
  "supabase/functions/food-search/__tests__/openFoodFactsClient.test.js",
  "supabase/functions/food-search/__tests__/openFoodFactsHandler.test.js",

  "src/services/foodSearch/__tests__/foodSearchIntegration.test.js",
  "src/services/foodSearch/__tests__/normalizeFoodResult.test.js",
  "src/services/foodSearch/__tests__/calculateServingNutrition.test.js",
  "supabase/functions/food-search/__tests__/validation.test.js",
  "supabase/functions/food-search/__tests__/normalizeUsdaFood.test.js",
  "supabase/functions/food-search/__tests__/usdaClient.test.js",
  "supabase/functions/food-search/__tests__/handler.test.js",
];

async function runDomainTests() {
  try {
    const compilerPath = join(
      projectRoot,
      "node_modules",
      "typescript",
      "bin",
      "tsc",
    );
    const compilation = spawnSync(
      process.execPath,
      [
        compilerPath,
        "--ignoreConfig",
        "--target",
        "ES2022",
        "--module",
        "Node16",
        "--moduleResolution",
        "Node16",
        "--allowImportingTsExtensions",
        "--rewriteRelativeImportExtensions",
        "--esModuleInterop",
        "--strict",
        "--skipLibCheck",
        "--types",
        "node",
        "--rootDir",
        projectRoot,
        "--outDir",
        temporaryDirectory,
        ...sourceFiles.map((file) => join(projectRoot, file)),
      ],
      { cwd: projectRoot, stdio: "inherit" },
    );

    if (compilation.error) {
      throw compilation.error;
    }
    if (compilation.status !== 0) {
      process.exitCode = compilation.status ?? 1;
      return;
    }

    const testRun = spawnSync(
      process.execPath,
      ["--test", ...testFiles.map((file) => join(temporaryDirectory, file))],
      { cwd: temporaryDirectory, stdio: "inherit" },
    );

    if (testRun.error) {
      throw testRun.error;
    }

    process.exitCode = testRun.status ?? 1;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

runDomainTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
