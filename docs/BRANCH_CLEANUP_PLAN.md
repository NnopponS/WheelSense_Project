# Branch Cleanup Plan

## Immediate Actions

### 1. Delete Local AI-Generated Branches
```bash
git branch -D cascade/thesis-code-review-wheelsense-platform-706b87
git branch -D cascade/thesis-code-review-wheelsense-platform-f17c2e
```

### 2. Review and Delete codex Branch
```bash
# First, check if this branch has any useful changes
git log codex/demo-ch1-mock-ch23-live --oneline

# If obsolete, delete:
git branch -D codex/demo-ch1-mock-ch23-live
```

### 3. Delete Obsolete Remote Branches
```bash
# Feature branch that was deleted locally but still exists on remote
git push origin --delete feature/game-bridge-integration

# Old prototype branches
git push origin --delete prototype-v1
git push origin --delete prototype-v2
git push origin --delete prototype-v3

# Archive branches
git push origin --delete archive/model-mockup
git push origin --delete archive/prototype-wheelsense
```

### 4. Clean Up Stale Local Branches
```bash
# Fetch and prune remote references
git fetch -p

# Delete local branches that are gone from remote
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d
```

## Verification After Cleanup

```bash
# Check remaining branches
git branch -a

# Should see only:
# - main
# - dependabot/* (auto-generated)
# - Any active feature branches you're working on
```

## Prevention

### Add Git Alias for Quick Cleanup
Add to `.git/config` or `~/.gitconfig`:
```ini
[alias]
    cleanup = "!git fetch -p && git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d"
```

Usage:
```bash
git cleanup
```

### Pre-Commit Hook (Optional)
Create `.git/hooks/pre-commit` to check branch naming:
```bash
#!/bin/bash
BRANCH=$(git symbolic-ref --short HEAD)
if [[ $BRANCH == main ]]; then
    echo "⚠️  Warning: Committing directly to main is discouraged"
    echo "   Create a feature branch instead"
    exit 1
fi

# Check branch naming convention
if [[ $BRANCH != feature/* && $BRANCH != bugfix/* && $BRANCH != refactor/* && $BRANCH != hotfix/* && $BRANCH != chore/* && $BRANCH != docs/* && $BRANCH != test/* && $BRANCH != dependabot/* ]]; then
    echo "⚠️  Warning: Branch name doesn't follow convention"
    echo "   Expected format: <prefix>/<description>"
    echo "   Prefixes: feature, bugfix, refactor, hotfix, chore, docs, test"
    # exit 1  # Uncomment to enforce
fi
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Schedule

### Weekly Cleanup
- Run `git cleanup` alias weekly
- Delete merged feature branches

### Monthly Cleanup
- Review all branches
- Delete branches inactive for > 30 days
- Archive important long-term branches (document reason)

## Rollback

If you accidentally delete a branch:
```bash
# Check reflog for deleted branch
git reflog

# Recover from reflog
git checkout -b recovered-branch <commit-hash>
```
