FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV ELECTRON_DISABLE_SECURITY_WARNINGS=true
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 xdg-utils ca-certificates \
    util-linux udev sudo dbus-x11 libcanberra-gtk3-module \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/var-flasher
COPY package*.json ./
RUN npm ci --omit=optional --no-audit --no-fund --loglevel=error
COPY src ./src
COPY README.md ./README.md

CMD ["dbus-run-session", "--", "npm", "start", "--", "--no-sandbox", "--disable-gpu", "--ozone-platform=x11"]
