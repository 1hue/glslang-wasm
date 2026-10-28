# clang-format for make format
FROM docker.io/library/alpine:latest
RUN apk add --no-cache clang-extra-tools
WORKDIR /app
