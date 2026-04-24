# Stage 1: Build Frontend
FROM node:25.9.0 AS frontend-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm install
COPY ui/ ./
RUN npm run build

# Stage 2: Build Backend
FROM golang:1.26.2-alpine3.22 AS backend-builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/ui/dist ./ui/dist

RUN go build -o gnats main.go

# Stage 3: Final Runtime
FROM alpine:3.22.4
WORKDIR /app

# Install necessary runtime libraries
RUN apk add --no-cache ca-certificates libc6-compat

# Copy ONLY the binary (assets are now inside it)
COPY --from=backend-builder /app/gnats .

ENV PORT=8080
EXPOSE 8080

CMD ["./gnats"]
