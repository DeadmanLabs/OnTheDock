.PHONY: help install build test dev start stop clean docker-build docker-up docker-down

# Default target
help:
	@echo "OnTheDock - Docker Management Library and Demo Application"
	@echo ""
	@echo "Available commands:"
	@echo "  make install       - Install all dependencies"
	@echo "  make build        - Build all packages"
	@echo "  make test         - Run all tests"
	@echo "  make dev          - Start development servers"
	@echo "  make start        - Start production servers"
	@echo "  make stop         - Stop all servers"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-build - Build Docker images"
	@echo "  make docker-up    - Start with docker-compose"
	@echo "  make docker-down  - Stop docker-compose"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"

# Install dependencies
install:
	npm install
	npm run build -w @org/docker-control

# Build all packages
build:
	npm run build -w @org/docker-control
	npm run build -w backend
	npm run build -w frontend

# Run tests
test:
	npm test -w @org/docker-control

test-integration:
	npm run test:integration -w @org/docker-control

test-all: test test-integration

# Development mode
dev:
	npm run dev

dev-backend:
	npm run dev -w backend

dev-frontend:
	npm run dev -w frontend

# Production mode
start:
	npm run start -w backend &
	npm run preview -w frontend &

stop:
	pkill -f "node.*backend" || true
	pkill -f "vite preview" || true

# Docker commands
docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-dev:
	docker-compose -f docker-compose.dev.yml up

docker-dev-build:
	docker-compose -f docker-compose.dev.yml build

# Linting and formatting
lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

# Type checking
type-check:
	npm run type-check

# Clean build artifacts
clean:
	rm -rf packages/docker-control/dist
	rm -rf test/backend/dist
	rm -rf test/frontend/dist
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf test/*/node_modules
	rm -rf coverage
	rm -rf .turbo
	rm -rf .parcel-cache

# Full reset
reset: clean
	npm install

# CI/CD helpers
ci-test:
	npm ci
	npm run build -w @org/docker-control
	npm test
	npm run test:integration -w @org/docker-control

ci-build:
	npm ci
	npm run build

# Security audit
audit:
	npm audit
	npm audit fix --dry-run

audit-fix:
	npm audit fix

# Documentation
docs:
	npx typedoc --out docs packages/docker-control/src

# Release
release-patch:
	npm version patch -w @org/docker-control
	git push --tags

release-minor:
	npm version minor -w @org/docker-control
	git push --tags

release-major:
	npm version major -w @org/docker-control
	git push --tags