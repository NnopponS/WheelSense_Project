# Contributing to WheelSense

Thank you for your interest in contributing to WheelSense! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+

### Quick Start

1. Clone the repository
2. Backend setup:
   ```bash
   cd server
   copy .env.example .env
   docker compose up -d db mosquitto
   alembic upgrade head
   uvicorn app.main:app --reload
   ```
3. Frontend setup:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Branch Naming

Use the following prefixes for branches:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/modifications

Examples:
```
feature/unified-task-management
fix/mqtt-connection-timeout
docs/api-endpoint-updates
```

## Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Build/config changes

Example:
```
feat(tasks): add unified task management API

- Add Task and TaskReport models
- Implement CRUD endpoints
- Add shift-based task board

Closes #123
```

## Pull Request Process

1. Create a branch from `main` with appropriate prefix
2. Make your changes with clear commit messages
3. Ensure all tests pass locally
4. Update documentation if needed
5. Submit PR with:
   - Clear title following commit format
   - Description of changes
   - Screenshots for UI changes
   - Link to related issues

### PR Checklist

- [ ] Tests pass (`pytest` for backend, `npm test` for frontend)
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] PR is scoped (one feature/fix per PR)

## Code Style

### Python (Backend)

- Follow PEP 8
- Use type hints where possible
- Docstrings for public functions/classes
- Maximum line length: 100 characters
- Use `black` and `ruff` for formatting

### TypeScript/JavaScript (Frontend)

- Use TypeScript for new code
- Follow existing component patterns
- Use `clsx` + `tailwind-merge` for class names
- Prefer named exports
- Use React hooks conventions

## Testing

### Backend

```bash
cd server
pytest tests/ -v
```

### Frontend

```bash
cd frontend
npm run test
cd ../e2e
npm run test:e2e
```

### Pre-commit

Run checks before committing:

```bash
# Backend
cd server
ruff check .
black --check .
pytest tests/

# Frontend
cd frontend
npm run lint
npm run type-check
```

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues/PRs before creating new ones
- Join discussions in issue comments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
