FROM --platform=linux/amd64 langflowai/langflow:latest

WORKDIR /app
COPY ../../../ /app

CMD "celery -A langflow.worker.celery_app worker --loglevel=INFO --concurrency=1 -n lf-worker@%h -P eventlet"