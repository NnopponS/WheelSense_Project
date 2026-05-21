# WheelSense Git Workflow

## Branch Strategy

### Branch Types

| Type | Prefix | Example | When to Use |
|------|--------|---------|-------------|
| feature | `feature/` | `feature/patient-sos-hero` | New features |
| bugfix | `bugfix/` | `bugfix/alert-toast-crash` | Bug fixes |
| refactor | `refactor/` | `refactor/tanstack-query` | Code restructuring without behavior change |
| hotfix | `hotfix/` | `hotfix/security-patch` | Urgent production fixes |
| chore | `chore/` | `chore/update-dependencies` | Maintenance tasks |
| docs | `docs/` | `docs/git-workflow` | Documentation changes only |
| test | `test/` | `test/e2e-coverage` | Test additions/changes only |

### Naming Convention

```
<prefix>/<short-kebab-description>
```

**Examples:**
- ✅ `feature/patient-sos-hero`
- ✅ `bugfix/alert-toast-crash`
- ✅ `refactor/tanstack-query-migration`
- ❌ `cascade/thesis-code-review-wheelsense-platform-706b87` (too long, AI-generated)
- ❌ `demo-ch1-mock-ch23-live` (missing prefix)
- ❌ `feature-game-bridge-integration` (should use slash)

## Workflow

### 1. Create Branch
```bash
git checkout main
git pull origin main
git checkout -b feature/patient-sos-hero
```

### 2. Work on Branch
- Make changes
- Commit with clear messages
- Push to remote
```bash
git push -u origin feature/patient-sos-hero
```

### 3. Create Pull Request
- Go to GitHub
- Create PR from feature branch to main
- Fill PR template (if exists)
- Request review (if team > 1)

### 4. Merge
- After review/approval
- Merge via GitHub UI (squash merge preferred)
- Delete feature branch after merge

### 5. Update Local
```bash
git checkout main
git pull origin main
git branch -d feature/patient-sos-hero  # delete local
git remote prune origin                # remove stale remote refs
```

## Branch Protection Rules (GitHub)

### For `main` Branch:
- ✅ Require pull request before merging
- ✅ Require approval from 1 reviewer (if team > 1)
- ✅ Require status checks to pass before merging
  - Backend tests (Docker Compose)
  - Frontend build (`npm run build`)
  - Linting (ruff, mypy)
- ✅ Do not allow bypassing the above settings
- ✅ Require branches to be up to date before merging
- ✅ Restrict who can push to `main` (maintainers only)

## Branch Cleanup Policy

### Delete These Branches Immediately After Merge:
- All feature branches
- All bugfix branches
- All refactor branches
- All hotfix branches (after deploy)

### Keep These Branches:
- `main` — protected
- Long-term branches (if any, document reason)
- `dependabot/*` — auto-generated, let Dependabot manage

### Stale Branches
- Delete local branches not in remote after 30 days:
```bash
git fetch -p
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d
```

## Current State (2026-05-06)

### Local Branches
| Branch | Status | Action |
|--------|--------|--------|
| main | ✅ Keep | Protected |
| cascade/thesis-code-review-* | ❌ Delete | AI-generated, obsolete |
| codex/demo-ch1-mock-ch23-live | ⚠️ Review | Check if needed |

### Remote Branches
| Branch | Status | Action |
|--------|--------|--------|
| feature/game-bridge-integration | ⚠️ Review | Local deleted, remote still exists |
| prototype-v1/v2/v3 | ❌ Delete | Obsolete |
| archive/model-mockup | ❌ Delete | Obsolete |
| archive/prototype-wheelsense | ❌ Delete | Obsolete |
| dependabot/* | ✅ Keep | Auto-generated |

## Cleanup Commands

### Delete Local Branches
```bash
# Delete specific branch
git branch -D cascade/thesis-code-review-wheelsense-platform-706b87
git branch -D cascade/thesis-code-review-wheelsense-platform-f17c2e

# Delete codex branch (after review)
git branch -D codex/demo-ch1-mock-ch23-live
```

### Delete Remote Branches
```bash
# Delete feature/game-bridge-integration from remote
git push origin --delete feature/game-bridge-integration

# Delete prototype branches
git push origin --delete prototype-v1
git push origin --delete prototype-v2
git push origin --delete prototype-v3

# Delete archive branches
git push origin --delete archive/model-mockup
git push origin --delete archive/prototype-wheelsense
```

### Delete All Stale Local Branches
```bash
git fetch -p
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d
```

## Commit Message Convention

Use conventional commits:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** feat, fix, docs, style, refactor, test, chore

**Examples:**
```
feat(patient): add SOS hero button on patient dashboard

- Add PatientSosHero component
- Integrate with createAlert mutation
- Add i18n keys for TH/EN

Closes #123
```

```
fix(observer): alert toast not showing patient name

- Fix AlertToastCard to load patient data
- Add GET /patients/{id} and GET /rooms/{id} calls
- Handle missing room_id gracefully

Fixes #456
```

## Best Practices

1. **Always start from latest main** before creating branch
2. **Keep branches small** — one feature/fix per branch
3. **Write descriptive commit messages** — conventional commits
4. **Run tests before pushing** — Docker-first for backend, npm run build for frontend
5. **Delete merged branches** — keep workspace clean
6. **Never commit directly to main** — use PR process
7. **Use squash merge** — keeps history clean
8. **Update local main** after merge — sync with remote

## AI Agent Branch Handling

When AI agents create branches:
- **Reject AI-generated names** like `cascade/thesis-code-review-wheelsense-platform-706b87`
- **Ask agent to rename** to follow convention: `docs/thesis-code-review`
- **Delete immediately** if branch is obsolete or temporary

## Troubleshooting

### Branch already exists remotely but not locally
```bash
git fetch origin
git checkout feature/some-branch
```

### Branch is behind main
```bash
git checkout main
git pull origin main
git checkout feature/some-branch
git rebase main
# OR
git merge main
```

### Force delete branch
```bash
# Local
git branch -D branch-name

# Remote
git push origin --delete branch-name
```
