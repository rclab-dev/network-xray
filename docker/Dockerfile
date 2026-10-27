# network-xray as a container: collects router state from a running containerlab / netlab lab
# (docker exec ... vtysh / sr_cli "show" commands) and serves the graph + DeepDive on port 8600.
#
#   docker build -f docker/Dockerfile -t ghcr.io/rclab-dev/network-xray:1 .
#   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(pwd)":/lab:ro -p 127.0.0.1:8600:8600 \
#     ghcr.io/rclab-dev/network-xray:1 --topo /lab/clab.yml
#
# The container is given the Docker socket, which is root-equivalent on the host: run it only on a lab machine.
# node:24-alpine, pinned (multi-arch index digest); bump the digest together with the tag
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

ARG CLAB_VERSION=0.81.0
ARG TARGETARCH=amd64
# sha256 of the containerlab release tarballs (from the release checksums.txt); change them with CLAB_VERSION
ARG CLAB_SHA256_AMD64=2236192087c4b2ced030d40d1a1515505b21befcadba96d73280003e9266b0de
ARG CLAB_SHA256_ARM64=ffcf518da40ff3145c9dd926063c0ba90e9bc969f2d7a7c3da39d523be36299d

RUN apk add --no-cache bash docker-cli curl ca-certificates tini coreutils \
 && case "${TARGETARCH}" in amd64) sum="${CLAB_SHA256_AMD64}" ;; arm64) sum="${CLAB_SHA256_ARM64}" ;; *) echo "unsupported TARGETARCH ${TARGETARCH}" >&2; exit 1 ;; esac \
 && curl -fsSL -o /tmp/containerlab.tar.gz "https://github.com/srl-labs/containerlab/releases/download/v${CLAB_VERSION}/containerlab_${CLAB_VERSION}_linux_${TARGETARCH}.tar.gz" \
 && echo "${sum}  /tmp/containerlab.tar.gz" | sha256sum -c - \
 && tar -xz -C /usr/local/bin -f /tmp/containerlab.tar.gz containerlab \
 && rm -f /tmp/containerlab.tar.gz \
 && containerlab version >/dev/null

COPY . /opt/network-xray
RUN install -m 0755 /opt/network-xray/docker/entrypoint.sh /usr/local/bin/network-xray

LABEL org.opencontainers.image.source="https://github.com/rclab-dev/network-xray" \
      org.opencontainers.image.description="Browser view of a containerlab / netlab lab's control plane (OSPF/BGP neighbors, routes, why a best path won)" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 8600
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/network-xray"]
CMD ["--topo", "/lab/clab.yml"]
