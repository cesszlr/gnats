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
RUN go build -o gnats main.go

# Stage 3: Final Runtime
FROM alpine:3.22.4
WORKDIR /app

# Install necessary runtime libraries
RUN apk add --no-cache ca-certificates libc6-compat

# Copy binary from backend builder
COPY --from=backend-builder /app/gnats .

# Copy built frontend from frontend builder
COPY --from=frontend-builder /app/ui/dist ./ui/dist

# Set environment variables if needed
ENV PORT=8080

EXPOSE 8080

# Run the binary
CMD ["./gnats"]
