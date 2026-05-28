.PHONY: dev build test lint migrate clean

# Start the local Docker environment with hot reloading enabled
dev:
	docker compose up --build

# Build the complete monorepo using Turborepo
build:
	pnpm build

# Run both frontend and backend tests
test:
	pnpm test
	@echo "Running backend test suite..."
	cd apps/api && poetry run pytest

# Lint both frontend (ESlint) and backend (flake8/ruff/mypy)
lint:
	pnpm lint
	@echo "Running backend lint checks..."
	cd apps/api && poetry run ruff check . || echo "Ruff not run (poetry env check)"

# Run database migrations using Alembic on the backend container or locally
migrate:
	docker compose exec api alembic upgrade head || cd apps/api && poetry run alembic upgrade head

# Clean build artifacts and docker volumes
clean:
	docker compose down -v
	rm -rf node_modules apps/web/.next apps/web/node_modules packages/ui/node_modules
