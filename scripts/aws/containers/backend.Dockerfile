FROM --platform=linux/amd64 langflowai/langflow:latest

WORKDIR /app
COPY ../../../ /app

CMD ["sh", "./startup-backend.sh"]
