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

/**
 * Creates an authenticated Octokit instance with plugins
 * @param {string} token - Personal Access Token
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - GitHub App Private Key
 * @param {string} installationId - GitHub App Installation ID
 * @returns {Octokit} - Authenticated Octokit instance
 */
function createOctokit(token, appId, privateKey, installationId) {
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

  // Create Octokit instance based on available authentication
  if (token) {
    // Authenticate using Personal Access Token
    console.log("Authenticating with Personal Access Token");
    return new MyOctokit({
      auth: token,
      ...octokitOptions,
    });
  } else if (appId && privateKey && installationId) {
    // Authenticate using GitHub App
    console.log("Authenticating with GitHub App");
    return new MyOctokit({
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
}

export async function run() {
  try {
    // Get inputs using actions/core instead of environment variables
    const org = core.getInput("org") || "octokit";
    const outputMode = core.getInput("mode") || "org-level"; // Default to org-level if not specified
    
    console.log(`Running in ${outputMode} mode for organization: ${org}`);

    // Get authentication inputs
    const token = core.getInput("token");
    const appId = core.getInput("app-id");
    const privateKey = core.getInput("private-key");
    const installationId = core.getInput("installation-id");
    
    // Create authenticated Octokit instance
    const octokit = createOctokit(token, appId, privateKey, installationId);

    // Get all available package types
    const packageTypes = ["npm", "maven", "rubygems", "docker", "container", "nuget"];
    
    if (outputMode === "org-level") {
      // Process packages by type (org-level mode)
      const packageStats = await processOrgLevel(octokit, org, packageTypes);

      // Create the final output structure for org-level mode
      const output = {
        packages: packageStats,
      };

      // Write results to file
      await writeResultsToFile(output, "org-level");

      // If using in GitHub Actions
      core.setOutput("packageStats", JSON.stringify(output));

      return output;
    } else {
      // Process packages by repository (repo-level mode)
      const repoStats = await processRepoLevel(octokit, org, packageTypes);

      // Create the final output structure for repo-level mode
      const output = {
        repositories: repoStats,
      };

      // Write results to file
      await writeResultsToFile(output, "repo-level");

      // If using in GitHub Actions
      core.setOutput("packageStats", JSON.stringify(output));

      return output;
    }
  } catch (error) {
    console.error("Error:", error);
    // If using in GitHub Actions
    core.setFailed(error.message);
  }
}

// Process packages by type (org-level mode)
async function processOrgLevel(octokit, org, packageTypes) {
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

      // For each package, get detailed information including version count
      for (const pkg of packages) {
        try {
          // Get detailed package info
          const packageInfo = await octokit.request("GET /orgs/{org}/packages/{package_type}/{package_name}", {
            org,
            package_type: packageType,
            package_name: pkg.name,
          });

          // Add version count to total
          totalVersionsCount += packageInfo.data.version_count || 0;
        } catch (error) {
          console.error(`Error getting details for package ${pkg.name}: ${error.message}`);
        }
      }

      // Add simple statistics for this package type
      packageStats.push({
        type: packageType,
        total_package_count: packages.length,
        versions_count: totalVersionsCount,
      });
    } catch (error) {
      console.error(`Error fetching ${packageType} packages: ${error.message}`);
      // Continue with the next package type if one fails
    }
  }

  return packageStats;
}

// Process packages by repository (repo-level mode)
async function processRepoLevel(octokit, org, packageTypes) {
  // Map to store repository stats
  const repoMap = new Map();

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

      // For each package, get detailed information including repository association
      for (const pkg of packages) {
        try {
          // Get detailed package info
          const packageInfo = await octokit.request("GET /orgs/{org}/packages/{package_type}/{package_name}", {
            org,
            package_type: packageType,
            package_name: pkg.name,
          });

          const packageData = packageInfo.data;
          const versionCount = packageData.version_count || 0;
          const repository = packageData.repository;

          // Get the repository name
          const repoName = repository ? repository.full_name : "unlinked packages";

          // Initialize repository entry if it doesn't exist
          if (!repoMap.has(repoName)) {
            repoMap.set(repoName, {
              name: repoName,
              total_package_count: 0,
              total_versions_count: 0,
              packages: [],
            });
          }

          const repoData = repoMap.get(repoName);
          repoData.total_package_count += 1;
          repoData.total_versions_count += versionCount;

          // Find package type entry or create it
          let typeEntry = repoData.packages.find((p) => p.type === packageType);
          if (!typeEntry) {
            typeEntry = {
              type: packageType,
              package_count: 0,
              versions_count: 0,
            };
            repoData.packages.push(typeEntry);
          }

          // Update counts for this package type
          typeEntry.package_count += 1;
          typeEntry.versions_count += versionCount;
        } catch (error) {
          console.error(`Error getting details for package ${pkg.name}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`Error fetching ${packageType} packages: ${error.message}`);
      // Continue with the next package type if one fails
    }
  }

  // Convert map to array for output
  return Array.from(repoMap.values());
}

// Write results to output file
async function writeResultsToFile(output, mode) {
  // Get the current execution directory
  const executionDir = process.cwd();
  console.log(`Current execution directory: ${executionDir}`);

  // Create output directory if it doesn't exist
  const outputDir = path.join("./output");
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Created or verified output directory at: ${outputDir}`);
  } catch (err) {
    console.error(`Error creating output directory: ${err.message}`);
    throw err;
  }

  // Determine output filename based on mode
  const filename = mode === "repo-level" ? "package-stats-repo.json" : "package-stats-org.json";
  const outputPath = path.join(outputDir, filename);

  // Write the result to the output file
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results written to ${outputPath}`);
}
