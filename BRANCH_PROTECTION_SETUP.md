# Branch Protection Setup Instructions

This document provides step-by-step instructions for setting up branch protection rules for the `main` branch to enforce CI checks before merging.

## Prerequisites

- Repository admin access to the GitHub repository
- All CI workflows must be working correctly (verified in Phase 3)

## Required Status Checks

The following status checks should be required before merging:

### Primary Checks (Required)
1. **`unit`** - Unit tests for core and resampler packages
2. **`golden-byteequal (ubuntu)`** - Byte-equal golden tests on Ubuntu
3. **`golden-byteequal (macos)`** - Byte-equal golden tests on macOS  
4. **`golden-byteequal (windows)`** - Byte-equal golden tests on Windows

### Optional Checks (Informational)
1. **`ffmpeg-structure`** - FFmpeg structural sanity check (runs with `continue-on-error: true`)

## Setup Steps

### Option A: Using GitHub CLI (Recommended)

If you have GitHub CLI (`gh`) installed and authenticated:

```bash
# Create branch protection configuration
cat > branch-protection.json << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "unit",
      "golden-byteequal (ubuntu)",
      "golden-byteequal (macos)",
      "golden-byteequal (windows)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null
}
EOF

# Apply branch protection
gh api repos/OWNER/REPO/branches/main/protection \
  --method PUT \
  --input branch-protection.json

# Clean up
rm branch-protection.json
```

Replace `OWNER/REPO` with your repository owner and name.

### Option B: Manual Setup via GitHub Web Interface

### 1. Navigate to Branch Protection Settings

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Branches**
4. Click **Add rule** or **Add branch protection rule**

### 2. Configure Branch Protection Rule

1. **Branch name pattern**: `main` (or your default branch name)

2. **Protect matching branches** - Enable the following options:
   - ✅ **Require a pull request before merging**
     - ✅ **Require approvals** (set to 1 or more as needed)
     - ✅ **Dismiss stale PR approvals when new commits are pushed**
   - ✅ **Require status checks to pass before merging**
     - ✅ **Require branches to be up to date before merging**
     - ✅ **Restrict pushes that create files larger than 100 MB**

3. **Status checks that are required** - Add the following checks:
   - `unit`
   - `golden-byteequal (ubuntu)`
   - `golden-byteequal (macos)`
   - `golden-byteequal (windows)`

4. **Additional settings** (recommended):
   - ✅ **Require conversation resolution before merging**
   - ✅ **Require signed commits** (if your project requires it)
   - ✅ **Require linear history** (if your project requires it)
   - ✅ **Include administrators** (applies rules to admins too)

### 3. Save the Rule

Click **Create** or **Save changes** to apply the branch protection rule.

## Verification

After setting up branch protection:

1. **Test with a PR**: Create a test pull request to verify the rules are working
2. **Check status checks**: Ensure all required checks appear in the PR status
3. **Test merge blocking**: Verify that merging is blocked when checks fail
4. **Test merge success**: Verify that merging works when all checks pass

## Troubleshooting

### Common Issues

1. **Status checks not appearing**: 
   - Ensure the CI workflow has run at least once
   - Check that the job names match exactly (case-sensitive)

2. **"Require branches to be up to date" conflicts**:
   - This setting requires the target branch to be up to date with the latest changes
   - May need to rebase/merge the latest main branch into your PR

3. **Admin bypass**:
   - If you enabled "Include administrators", even admins must pass checks
   - Disable this if you need admin override capability

### Status Check Names Reference

The exact status check names from the CI workflow are:
- `unit` (from `unit` job)
- `golden-byteequal (ubuntu)` (from `golden-byteequal` job with `ubuntu` matrix)
- `golden-byteequal (macos)` (from `golden-byteequal` job with `macos` matrix)
- `golden-byteequal (windows)` (from `golden-byteequal` job with `windows` matrix)

## Phase 3 Completion

Once branch protection is configured, Phase 3 is complete with:

- ✅ Golden runner enforces byte-equal
- ✅ Six-case corpus with SHA256s
- ✅ CI matrix green for byte-equal on all OS
- ✅ Branch protection enabled; failing PRs are blocked
- ✅ Reports show `resampler.name === 'zoh'` and version `1.0.0`

## Notes

- The `ffmpeg-structure` check is intentionally not required as it's informational only
- All golden tests use the ZOH resampler for deterministic, byte-identical outputs
- The CI runs on Node 20.x with pnpm 9.10.0 for consistency
