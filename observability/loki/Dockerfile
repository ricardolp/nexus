FROM grafana/loki:3.4.2
USER root
COPY loki.yml /etc/loki/config.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
