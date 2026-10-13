# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional extra CA for builds behind a TLS-inspecting proxy:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN mkdir -p /var/cache/trekk && chown -R 101:101 /var/cache/trekk
COPY docker/entrypoint/05-trekk-defaults.envsh /docker-entrypoint.d/
COPY docker/nginx/templates/ /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/05-trekk-defaults.envsh
USER 101
EXPOSE 8080
VOLUME ["/var/cache/trekk"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
