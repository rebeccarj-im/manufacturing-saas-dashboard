.PHONY: test build deploy smoke logs down
test:
	cd backend && pytest -q
build:
	docker compose build
deploy: build
	docker compose up -d
smoke:
	curl -fsS http://localhost:8000/api/health
logs:
	docker compose logs -f api
down:
	docker compose down
