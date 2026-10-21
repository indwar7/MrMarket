FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /api ./cmd/api

FROM alpine:3.20
RUN adduser -D app && mkdir /data && chown app /data
USER app
COPY --from=build /api /api
ENV PORT=8080 DATABASE_PATH=/data/mrmarket.db
EXPOSE 8080
ENTRYPOINT ["/api"]
