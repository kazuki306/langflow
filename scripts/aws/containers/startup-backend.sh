### mysql db
# export LANGFLOW_DATABASE_URL="mysql+pymysql://${username}:${password}@${host}:3306/${dbname}"
### postgres
export LANGFLOW_DATABASE_URL="postgresql://${username}:${password}@${host}:5432/${dbname}"

### command

if [ "$ENVIRONMENT" = "development" ]; then
    echo "Starting backend in development mode"
    exec python -m uvicorn --factory langflow.main:create_app --host 0.0.0.0 --port 7860 --log-level ${LOG_LEVEL:-info} --workers 2 --reload
else
    echo "Starting backend in production mode"
    exec langflow run --host 0.0.0.0 --port 7860 --log-level ${LOG_LEVEL:-info} --workers -1 --backend-only
fi

