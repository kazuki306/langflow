FROM --platform=linux/amd64 langflowai/langflow:latest

WORKDIR /app
COPY ../../../ /app

CMD ["/bin/sh", "-c", "celery -A langflow.worker.celery_app --broker=${BROKER_URL?Variable not set} flower --port=5555"]