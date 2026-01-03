# Makefile for running tests

.PHONY: test smoke integration e2e reliability all clean

# Run all tests
all:
	pytest tests/ -v --tb=short

# Run smoke tests only
smoke:
	pytest tests/smoke/ -v -m smoke --tb=short

# Run integration tests only
integration:
	pytest tests/integration/ -v -m integration --tb=short

# Run E2E tests only
e2e:
	pytest tests/e2e/ -v -m e2e --tb=short

# Run reliability tests only
reliability:
	pytest tests/reliability/ -v -m reliability --tb=short

# Run with coverage
coverage:
	pytest tests/ -v --cov=src --cov-report=html --cov-report=term-missing

# Clean test artifacts
clean:
	rm -rf test_artifacts/
	rm -rf .pytest_cache/
	rm -rf htmlcov/
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete

