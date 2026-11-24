FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer python3 python3-uno nodejs \
    fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY conv.py server.js ./
EXPOSE 7860
CMD ["node", "server.js"]
