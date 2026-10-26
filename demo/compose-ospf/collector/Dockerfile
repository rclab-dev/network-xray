# Node.js 24 + vtysh from Alpine's frr package (reads the demo routers through their vty sockets)
FROM node:24-alpine
RUN apk add --no-cache frr
COPY . /collector/
RUN chmod +x /collector/watch.sh
WORKDIR /collector
ENTRYPOINT ["/bin/sh","/collector/watch.sh"]
