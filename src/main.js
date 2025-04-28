import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import * as core from "@actions/core";
import { createAppAuth } from "@octokit/auth-app";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Create a custom Octokit class with pagination, retry and throttling plugins
const MyOctokit = Octokit.plugin(paginateRest, retry, throttling);

export async function run() {
  try {
    // Get inputs using actions/core instead of environment variables
    const org = core.getInput("org") || "octokit";
    const outputMode = core.getInput("mode") || "simple"; // Default to simple if not specified

    console.log(`Running in ${outputMode} mode for organization: ${org}`);

    // Check authentication method
    const token = core.getInput("token");
    const appId = core.getInput("app-id");
    const privateKey = core.getInput("private-key");
    const installationId = core.getInput("installation-id");

    // Common options for Octokit including throttling configuration
    const octokitOptions = {
      throttle: {
        onRateLimit: (retryAfter, options, octokit) => {
          octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

          // Retry twice after hitting a rate limit
          if (options.request.retryCount <= 2) {
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
          // Secondary rate limit (abuse detection) is triggered
          octokit.log.warn(`Secondary rate limit detected for request ${options.method} ${options.url}`);

          // Always retry after hitting a secondary rate limit
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        },
      },
      retry: {
        retries: 3,
        retryAfter: 180,
      },
    };

    let octokit;

    // Create Octokit instance based on available authentication
    if (token) {
      // Authenticate using Personal Access Token
      console.log("Authenticating with Personal Access Token");
      octokit = new MyOctokit({
        auth: token,
        ...octokitOptions,
      });
    } else if (appId && privateKey && installationId) {
      // Authenticate using GitHub App
      console.log("Authenticating with GitHub App");
      octokit = new MyOctokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey,
          installationId,
        },
        ...octokitOptions,
      });
    } else {
      throw new Error(
        "Authentication is required. Please provide either a Personal Access Token (token) or GitHub App credentials (app-id, private-key, and installation-id)."
      );
    }

    // Get all available package types
    const packageTypes = ["npm", "maven", "rubygems", "docker", "container", "nuget"];
    const packageStats = [];

    // Process each package type
    for (const packageType of packageTypes) {
      console.log(`Fetching ${packageType} packages for organization: ${org}`);

      try {
        // Get all packages for this package type
        const packages = await octokit.paginate("GET /orgs/{org}/packages", {
          org,
          package_type: packageType,
          per_page: 100,
        });

        console.log(`Found ${packages.length} ${packageType} packages in ${org}`);

        if (packages.length === 0) continue; // Skip if no packages found for this type

        let totalVersionsCount = 0;
        const packageDetails = [];

        // For detailed mode, get versions for each package
        if (outputMode === "detailed") {
          for (const pkg of packages) {
            console.log(`Fetching versions for package: ${pkg.name}`);

            // Get all versions for this package
            const versions = await octokit.paginate("GET /orgs/{org}/packages/{package_type}/{package_name}/versions", {
              org,
              package_type: packageType,
              package_name: pkg.name,
              per_page: 100,
            });

            totalVersionsCount += versions.length;

            // Add package details with its versions
            packageDetails.push({
              name: pkg.name,
              versions_count: versions.length,
              versions: versions.map((version) => ({
                name: version.name,
                created_at: version.created_at,
                html_url: version.html_url,
              })),
            });

            console.log(`Found ${versions.length} versions for ${pkg.name}`);
          }

          // Add statistics for this package type to packageStats
          packageStats.push({
            type: packageType,
            total_count: packages.length,
            total_versions_count: totalVersionsCount,
            packages: packageDetails,
          });
        } else {
          // For simple mode, only count total versions
          for (const pkg of packages) {
            // Get versions count for this package
            const versions = await octokit.paginate("GET /orgs/{org}/packages/{package_type}/{package_name}/versions", {
              org,
              package_type: packageType,
              package_name: pkg.name,
              per_page: 100,
            });

            totalVersionsCount += versions.length;
          }

          // Add simple statistics for this package type
          packageStats.push({
            type: packageType,
            total_count: packages.length,
            versions_count: totalVersionsCount,
          });
        }
      } catch (error) {
        console.error(`Error fetching ${packageType} packages: ${error.message}`);
        // Continue with the next package type if one fails
      }
    }

    // Create the final output structure
    const output = {
      packages: packageStats,
    };

    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), "output");
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created or verified output directory at: ${outputDir}`);
    } catch (err) {
      console.error(`Error creating output directory: ${err.message}`);
      throw err;
    }

    // Determine output filename based on mode
    const filename = outputMode === "detailed" ? "package-stats-detailed.json" : "package-stats.json";
    const outputPath = path.join(outputDir, filename);

    // Write the result to the output file
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`Results written to ${outputPath}`);

    // If using in GitHub Actions
    core.setOutput("packageStats", JSON.stringify(output));

    return output;
  } catch (error) {
    console.error("Error:", error);

    // If using in GitHub Actions
    core.setFailed(error.message);
  }
}
