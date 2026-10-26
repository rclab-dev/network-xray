# network-xray as a container: collects router state from a running containerlab / netlab lab
# (docker exec ... vtysh / sr_cli "show" commands) and serves the graph + DeepDive on port 8600.
#
#   docker build -f docker/Dockerfile -t ghcr.io/rclab-dev/network-xray:1 .
#   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(pwd)":/lab:ro -p 8600:8600 \
#     ghcr.io/rclab-dev/network-xray:1 --topo /lab/clab.yml
#
# The container is given the Docker socket, which is root-equivalent on the host: run it only on a lab machine.
FROM node:24-alpine

ARG CLAB_VERSION=0.81.0
ARG TARGETARCH=amd64

RUN apk add --no-cache bash docker-cli curl ca-certificates tini coreutils \
 && curl -fsSL "https://github.com/srl-labs/containerlab/releases/download/v${CLAB_VERSION}/containerlab_${CLAB_VERSION}_linux_${TARGETARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin containerlab \
 && containerlab version >/dev/null

COPY . /opt/network-xray
RUN install -m 0755 /opt/network-xray/docker/entrypoint.sh /usr/local/bin/network-xray

LABEL org.opencontainers.image.source="https://github.com/rclab-dev/network-xray" \
      org.opencontainers.image.description="Browser view of a containerlab / netlab lab's control plane (OSPF/BGP neighbors, routes, why a best path won)" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 8600
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/network-xray"]
CMD ["--topo", "/lab/clab.yml"]
