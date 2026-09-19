FROM frrouting/frr:latest
RUN apk add --no-cache nodejs
COPY . /collector/
RUN chmod +x /collector/watch.sh
WORKDIR /collector
ENTRYPOINT ["/bin/sh","/collector/watch.sh"]
