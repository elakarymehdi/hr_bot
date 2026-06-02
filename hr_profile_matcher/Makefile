.PHONY: run push setup scrape

run:
	cd frontend && npm run dev

# Start the backend server
serve:
	.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Run a scrape from the CLI
scrape:
	.venv/bin/python cli.py --scraper $(SCRAPER) --query "$(QUERY)" --max-results $(MAX)

push:
	@echo -n "Enter commit message: "; \
	read msg; \
	cd .. && \
	git add hr_profile_matcher/ && \
	git commit -m "$$msg" && \
	git push

setup:
	python3 -m venv .venv && \
	.venv/bin/pip install -r requirements.txt && \
	.venv/bin/pip install -e scraper_lib/ && \
	.venv/bin/playwright install chromium && \
	cd frontend && npm install
