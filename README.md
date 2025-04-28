# GitHub Package Stats

A Node.js script to collect and analyze package information from a GitHub organization.

## Features

- Collects package statistics across multiple package types (npm, Maven, RubyGems, Docker, container, NuGet)
- Two output modes:
  - Simple: Summary statistics for each package type
  - Detailed: Complete listing of packages and their versions
- Flexible authentication options:
  - GitHub Personal Access Token (PAT)
  - GitHub App authentication
- Built-in pagination and retry logic for API requests

## Setup

1. Install dependencies:

```bash
npm install @octokit/core @octokit/auth-app @actions/core @octokit/plugin-paginate-rest @octokit/plugin-retry
```

2. Set up authentication:

   **Option 1: GitHub Personal Access Token (PAT)**

   - Create a PAT with appropriate permissions for accessing organization packages

   **Option 2: GitHub App**

   - Configure a GitHub App with appropriate permissions
   - Generate a private key
   - Install the App to your organization

## Usage

Run the script with environment variables for your chosen authentication method:

**Using PAT Authentication:**

```bash
# Set environment variables
export ORG=your-organization
export MODE=simple
export TOKEN=your-personal-access-token

# Run the script
node src/index.js
```

**Using GitHub App Authentication:**

```bash
# Set environment variables
export ORG=your-organization
export MODE=simple
export APP_ID=your-github-app-id
export PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export INSTALLATION_ID=your-installation-id

# Run the script
node src/index.js
```

The script will generate one of the following files based on the mode:

- `package-stats.json`: Contains summary statistics for each package type when using "simple" mode
- `package-stats-detailed.json`: Contains detailed package and version information when using "detailed" mode

## Output Formats

### Simple Mode (package-stats.json)

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

### Detailed Mode (package-stats-detailed.json)

```json
{
  "packages": [
    {
      "type": "npm",
      "total_count": 10,
      "total_versions_count": 52,
      "packages": [
        {
          "name": "package-name",
          "versions_count": 12,
          "versions": [
            {
              "name": "1.0.0",
              "created_at": "2022-01-01T00:00:00Z",
              "html_url": "https://github.com/org/package-name/1.0.0"
            }
          ]
        }
      ]
    }
  ]
}
```

## GitHub Actions Integration

This script can be used in GitHub Actions workflows as a composite action. It sets the `package-stats` output that can be used by other steps in your workflow.

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
          mode: "simple"
          token: ${{ secrets.GITHUB_TOKEN }}

      # Use the output in subsequent steps
      - name: Use stats output
        run: echo '${{ steps.stats.outputs.package-stats }}'
```

Example workflow using GitHub App authentication:

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
          mode: "detailed"
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.PRIVATE_KEY }}
          installation-id: ${{ secrets.INSTALLATION_ID }}

      # Use the output in subsequent steps
      - name: Use stats output
        run: echo '${{ steps.stats.outputs.package-stats }}'
```
