FROM --platform=linux/amd64 langflowai/langflow:latest

WORKDIR /app

CMD ["sh", "./container-cmd-cdk.sh"]
