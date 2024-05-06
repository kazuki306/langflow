FROM --platform=linux/amd64 prom/prometheus:v2.37.9

CMD ["--config.file=/etc/prometheus/prometheus.yml"]