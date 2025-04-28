# GitHub Package Stats

A Node.js script to collect and analyze package information from a GitHub organization.

## Features

- Collects package statistics across multiple package types (npm, Maven, RubyGems, Docker, container, NuGet)
- Two organization analysis modes:
  - **org-level**: Groups packages by type (npm, maven, etc.)
  - **repo-level**: Groups packages by their associated repository
- Flexible authentication options:
  - GitHub Personal Access Token (PAT)
  - GitHub App authentication
- Built-in pagination, throttling, and retry logic for API requests

## Setup

1. Install dependencies:

```bash
npm install @octokit/core @octokit/auth-app @actions/core @octokit/plugin-paginate-rest @octokit/plugin-retry @octokit/plugin-throttling
```

2. Set up authentication:

   **Option 1: GitHub Personal Access Token (PAT)**

   - Create a PAT with appropriate permissions for accessing organization packages

   **Option 2: GitHub App**

   - Configure a GitHub App with appropriate permissions
   - Generate a private key
   - Install the App to your organization

## Usage

Run the script with your chosen authentication method:

**Using PAT Authentication:**

```bash
# Set environment variables
export ORG=your-organization
export MODE=org-level  # or repo-level
export TOKEN=your-personal-access-token

# Run the script
node src/index.js
```

**Using GitHub App Authentication:**

```bash
# Set environment variables
export ORG=your-organization
export MODE=org-level  # or repo-level
export APP_ID=your-github-app-id
export PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export INSTALLATION_ID=your-installation-id

# Run the script
node src/index.js
```

The script will generate one of the following files based on the mode:

- `package-stats-org.json`: Contains statistics grouped by package type (org-level mode)
- `package-stats-repo.json`: Contains statistics grouped by repository (repo-level mode)

## Output Formats

### Org-Level Mode (package-stats-org.json)

```json
{
  "packages": [
    {
      "type": "npm",
      "total_count": 10,
      "versions_count": 52
    },
    {
      "type": "container",
      "total_count": 5,
      "versions_count": 15
    }
  ]
}
```

### Repo-Level Mode (package-stats-repo.json)

```json
{
  "repositories": [
    {
      "name": "owner/repo-name",
      "total_count": 3,
      "total_versions_count": 15,
      "packages": [
        {
          "name": "package-name-1",
          "type": "npm",
          "versions_count": 8
        },
        {
          "name": "package-name-2",
          "type": "container",
          "versions_count": 7
        }
      ]
    },
    {
      "name": "unlinked-packages",
      "total_count": 2,
      "total_versions_count": 5,
      "packages": [
        {
          "name": "unlinked-package-1",
          "type": "npm",
          "versions_count": 3
        },
        {
          "name": "unlinked-package-2",
          "type": "npm",
          "versions_count": 2
        }
      ]
    }
  ]
}
```

## GitHub Actions Integration

This script can be used in GitHub Actions workflows as a GitHub Action. It sets the `packageStats` output that can be used by other steps in your workflow.

Example workflow using Personal Access Token:

```yaml
name: Collect Package Stats

jobs:
  stats:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Get package statistics
        id: stats
        uses: ./
        with:
          org: "myorg"
          mode: "org-level"
          token: ${{ secrets.GITHUB_TOKEN }}

      # Use the output in subsequent steps
      - name: Use stats output
        run: echo '${{ steps.stats.outputs.packageStats }}'
```

Example workflow using GitHub App authentication with repo-level mode:

```yaml
name: Collect Package Stats

jobs:
  stats:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Get package statistics
        id: stats
        uses: ./
        with:
          org: "myorg"
          mode: "repo-level"
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.PRIVATE_KEY }}
          installation-id: ${{ secrets.INSTALLATION_ID }}

      # Use the output in subsequent steps
      - name: Use stats output
        run: echo '${{ steps.stats.outputs.packageStats }}'
```
