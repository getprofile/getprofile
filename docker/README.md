# GetProfile Docker Setup

This directory contains Docker configuration for running GetProfile in containers.

## Quick Start

From the repository root:

```bash
# Copy environment template
cp .env.docker.example .env

# Edit .env and add your LLM_API_KEY
nano .env

# Start all services (source .env to handle long API keys correctly)
source .env && export LLM_API_KEY && docker compose -f docker/docker-compose.yml up -d
# View logs
docker compose -f docker/docker-compose.yml logs -f server
```

## Services

### Server (`server`)

- **Port:** 3100
- **Image:** Custom (built from `Dockerfile.server`)
- **Purpose:** Main GetProfile LLM proxy server
- **Startup:** Runs database migrations automatically via `entrypoint-server.sh`

### Database (`db`)

- **Port:** 5432
- **Image:** `pgvector/pgvector:pg16`
- **Purpose:** PostgreSQL database with pgvector extension
- **Credentials:** `getprofile:password` (change for production)

## Environment Variables

All environment variables are configured in the `.env` file at the repository root. See `.env.docker.example` for a complete list with defaults.

### Required

- `LLM_API_KEY` - Your LLM API key for extraction and summarization

### Optional

- `GETPROFILE_API_KEY` - Require authentication on server (leave unset for local dev)
- `UPSTREAM_API_KEY` - API key for upstream LLM (defaults to LLM_API_KEY)
- `UPSTREAM_BASE_URL` - Base URL for upstream LLM (defaults to OpenAI)
- `GETPROFILE_MAX_MESSAGES` - Max messages per profile (default: 1000)
- `GETPROFILE_SUMMARY_INTERVAL` - Summary refresh interval in minutes (default: 60)
- `GETPROFILE_RATE_LIMIT` - Requests per minute per client (default: 60, 0 to disable)

## Database Migrations

Migrations run automatically when the server container starts via the `entrypoint-server.sh` script.

The script:

1. Waits for database to be ready
2. Runs Drizzle migrations from `packages/db/src/migrations/`
3. Starts the server

## Customizing Config

The `config/` directory is copied into containers and contains:

- `config/traits/default.traits.json` - Trait extraction schema
- `config/prompts/*.md` - LLM extraction prompts

To customize:

1. Edit files in `config/`
2. Rebuild containers: `docker compose -f docker/docker-compose.yml up -d --build`

## Commands

```bash
# Start services
docker compose -f docker/docker-compose.yml up -d

# Stop services
docker compose -f docker/docker-compose.yml down

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Rebuild after changes
docker compose -f docker/docker-compose.yml up -d --build

# Reset database (WARNING: deletes all data)
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d

# Access database
docker compose -f docker/docker-compose.yml exec db psql -U getprofile
```

## Healthchecks

- **Server:** `curl http://localhost:3100/health`
- **Database:** `docker compose -f docker/docker-compose.yml exec db pg_isready -U getprofile`

## Production Deployment

For production:

1. **Change database credentials** in `docker-compose.yml`
2. **Set `GETPROFILE_API_KEY`** in `.env` to require authentication
3. **Use proper secrets management** instead of `.env` file
4. **Add TLS termination** via reverse proxy (nginx, Caddy, Traefik)
5. **Configure backup strategy** for PostgreSQL volume
6. **Monitor logs** and set up alerts

## Troubleshooting

### Environment variables not loading correctly (Long API keys)

If you have long environment variables (like OpenAI API keys) that appear truncated in containers, Docker Compose may not be parsing the .env file correctly.

**Solution:** Source the .env file and export variables before running docker compose:

```bash
# Stop containers
docker compose -f docker/docker-compose.yml down

# Source .env and start containers
source .env && export LLM_API_KEY && docker compose -f docker/docker-compose.yml up -d
```

**To verify the API key is loaded correctly:**

```bash
docker compose -f docker/docker-compose.yml exec server sh -c 'echo "API Key length: ${#LLM_API_KEY}"'
```

### Migrations failing

```bash
# Check server logs
docker compose -f docker/docker-compose.yml logs server

# Manually run migrations
docker compose -f docker/docker-compose.yml exec server sh -c "cd /app/packages/db && node /app/node_modules/.bin/drizzle-kit migrate"
```

### Database connection issues

```bash
# Check database is healthy
docker compose -f docker/docker-compose.yml ps db

# Check database logs
docker compose -f docker/docker-compose.yml logs db
```

### Container won't start

```bash
# Remove containers and volumes, start fresh
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```
