FROM frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce
RUN apk add --no-cache nodejs
COPY . /collector/
RUN chmod +x /collector/watch.sh
WORKDIR /collector
ENTRYPOINT ["/bin/sh","/collector/watch.sh"]
