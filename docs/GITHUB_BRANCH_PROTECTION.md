# GitHub Branch Protection Setup

## Branch Protection Rules for `main`

### How to Set Up

1. Go to GitHub repository
2. Navigate to: **Settings** → **Branches** → **Branch protection rules**
3. Click **Add rule**
4. Enter `main` as branch name pattern
5. Configure settings below

### Required Settings

### ✅ Branch name pattern
```
main
```

### ✅ Require pull request before merging
- **Require a pull request before merging**: ON
- **Require approvals**: ON
  - Number of required reviewers: 1 (if team > 1, else 0 for solo)
  - **Dismiss stale PR approvals when new commits are pushed**: ON
  - **Require review from CODEOWNERS**: Optional

### ✅ Require status checks to pass before merging
- **Require status checks to pass before merging**: ON
- **Require branches to be up to date before merging**: ON

### Status Checks to Require

Add these checks (must match GitHub Actions workflow names):

**Backend:**
- `docker-compose-sim-tests` (or your backend test workflow name)

**Frontend:**
- `build` (or your frontend build workflow name)

**Linting (if available):**
- `lint-python`
- `lint-frontend`
- `type-check`

### ✅ Do not allow bypassing the above settings
- ON

### ✅ Restrict who can push to matching branches
- **Restrict who can push to matching branches**: ON
- Select: **Maintainers** (or specific users/teams)

### Optional Settings

### ✅ Allow force pushes
- OFF (never allow force pushes to main)

### ✅ Allow deletions
- OFF (never allow deletion of main)

### ✅ Require linear history
- ON (squash merges only)

## GitHub Actions Workflows

Ensure your `.github/workflows/` has these workflows:

### Backend Tests
```yaml
name: Backend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Run tests
        run: |
          docker compose -f docker-compose.sim.yml build
          docker compose -f docker-compose.sim.yml run --rm wheelsense-platform-server python -m pytest tests/ -q
```

### Frontend Build
```yaml
name: Frontend Build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: '20'
      - name: Install
        run: cd frontend && npm ci
      - name: Build
        run: cd frontend && npm run build
```

## Verification

After setting up branch protection:

1. Create a test feature branch
2. Make a small change
3. Push to GitHub
4. Create PR to main
5. Verify:
   - ✅ PR cannot be merged without status checks passing
   - ✅ PR cannot be merged without approval (if configured)
   - ✅ Branch must be up to date with main
   - ✅ Cannot push directly to main

## Troubleshooting

### Status checks not showing up
- Ensure workflow names match exactly in branch protection settings
- Check that workflows are running successfully on your branch
- Wait a few minutes for GitHub to detect new workflows

### Cannot merge even with checks passing
- Check if branch is behind main (click "Update branch" button)
- Verify all required status checks are passing
- Check if any required reviewers have not approved

### Need to bypass protection temporarily
- Go to branch protection settings
- Temporarily disable the rule
- Make emergency fix
- Re-enable protection immediately
- Document why bypass was needed in commit message

## Rollback

To remove branch protection:
1. Go to Settings → Branches
2. Click on the rule
3. Click "Delete rule"

⚠️ **Warning**: Only remove protection if absolutely necessary and document the reason.
