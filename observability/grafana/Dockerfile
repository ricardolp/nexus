FROM grafana/grafana:11.6.2
USER root
COPY provisioning /etc/grafana/provisioning
COPY dashboards /etc/grafana/dashboards
ENV GF_PATHS_PROVISIONING=/etc/grafana/provisioning
ENV GF_AUTH_ANONYMOUS_ENABLED=false
ENV GF_USERS_ALLOW_SIGN_UP=false
ENV GF_ANALYTICS_REPORTING_ENABLED=false
ENV GF_ANALYTICS_CHECK_FOR_UPDATES=false
ENV GF_SECURITY_DISABLE_GRAVATAR=true
