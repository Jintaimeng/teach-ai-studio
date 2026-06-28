#!/bin/bash
# ==========================================
# teach-ai-studio - Staging 环境部署脚本
# ==========================================
# 用途：在服务器上执行 Docker 容器部署（拉取镜像 → 重启容器 → 健康检查 → 失败回滚）
#
# 环境变量要求（由 GitHub Actions 经 SSH 注入）：
# - DOCKER_PASSWORD: Docker Registry 密码
# - DOCKER_USERNAME: Docker Registry 用户名
# - REGISTRY:        Docker Registry 地址
# - IMAGE_NAME:      镜像名称
# - IMAGE_TAG:       镜像标签（可选，默认 staging-latest）
# ==========================================

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOY_DIR="/www/teach-ai-studio-staging"
COMPOSE_FILE="docker-compose.staging.yml"
CONTAINER="teach-ai-studio-staging"
HEALTH_PORT=3001

rollback() {
  local reason="$1"
  echo -e "${RED}❌ Deployment failed: $reason${NC}"
  echo -e "${YELLOW}Starting rollback...${NC}"

  if [ -z "$ROLLBACK_IMAGE" ]; then
    echo -e "${RED}❌ No rollback point available (this might be the first deployment)${NC}"
    exit 1
  fi

  echo "Stopping failed container..."
  docker compose -f "$COMPOSE_FILE" down || true

  echo "Starting rollback to previous version..."
  IMAGE_TAG=staging-rollback docker compose -f "$COMPOSE_FILE" up -d

  sleep 10

  if docker ps --filter name=$CONTAINER | grep -q $CONTAINER; then
    echo -e "${GREEN}✓ Rollback completed successfully${NC}"
    docker logs --tail 20 $CONTAINER
    exit 1
  else
    echo -e "${RED}❌ Rollback failed! Please investigate manually${NC}"
    exit 1
  fi
}

echo "=== Starting staging deployment ==="
echo "REGISTRY: ${REGISTRY:-<not set>}"
echo "IMAGE_NAME: ${IMAGE_NAME:-<not set>}"
echo "DOCKER_USERNAME: ${DOCKER_USERNAME:-<not set>}"

if [ -z "${REGISTRY:-}" ] || [ -z "${IMAGE_NAME:-}" ] || [ -z "${DOCKER_USERNAME:-}" ] || [ -z "${DOCKER_PASSWORD:-}" ]; then
  echo -e "${RED}❌ Error: Required environment variables not set${NC}"
  exit 1
fi

mkdir -p "$DEPLOY_DIR"/{logs,env,data}
cd "$DEPLOY_DIR"

if [ ! -f "env/.env.staging" ]; then
  echo -e "${RED}❌ Error: env/.env.staging not found!${NC}"
  echo -e "${YELLOW}请在服务器创建 $DEPLOY_DIR/env/.env.staging（含 CODEBUDDY_API_KEY、JWT_SECRET 等）${NC}"
  exit 1
fi

echo "Logging in to Docker Registry: $REGISTRY"
if ! echo "$DOCKER_PASSWORD" | docker login "$REGISTRY" -u "$DOCKER_USERNAME" --password-stdin 2>&1; then
  echo -e "${RED}❌ Failed to login to Docker Registry${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Logged in to $REGISTRY${NC}"

ROLLBACK_IMAGE=""
CURRENT_IMAGE=$(docker inspect $CONTAINER --format='{{.Image}}' 2>/dev/null || echo "")
if [ -n "$CURRENT_IMAGE" ]; then
  echo "Saving current image as rollback point..."
  if docker tag "$CURRENT_IMAGE" "${IMAGE_NAME}:staging-rollback"; then
    ROLLBACK_IMAGE="${IMAGE_NAME}:staging-rollback"
    echo -e "${GREEN}✓ Saved rollback point${NC}"
  else
    echo -e "${YELLOW}⚠️  Warning: Failed to save rollback point${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  No existing container found (first deployment)${NC}"
fi

echo "Pulling latest Docker image..."
if ! docker pull "${IMAGE_NAME}:staging-latest"; then
  echo -e "${RED}❌ Failed to pull Docker image${NC}"
  exit 1
fi

# 只读参考库 yanbot.db：./data 为 bind mount 会遮盖镜像内副本，
# 首次部署时从镜像中提取一份到宿主机 data/（已存在则跳过）。
if [ ! -f "data/yanbot.db" ]; then
  echo "Seeding data/yanbot.db from image..."
  TMP_CID=$(docker create "${IMAGE_NAME}:staging-latest")
  if docker cp "${TMP_CID}:/app/data/yanbot.db" "data/yanbot.db" 2>/dev/null; then
    echo -e "${GREEN}✓ Seeded yanbot.db${NC}"
  else
    echo -e "${YELLOW}⚠️  镜像内未找到 yanbot.db，请手动上传到 $DEPLOY_DIR/data/yanbot.db${NC}"
  fi
  docker rm "${TMP_CID}" >/dev/null 2>&1 || true
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo -e "${RED}❌ Error: $COMPOSE_FILE not found!${NC}"
  exit 1
fi

echo "Stopping old container..."
docker compose -f "$COMPOSE_FILE" down || true

echo "Starting new container..."
if ! docker compose -f "$COMPOSE_FILE" up -d; then
  rollback "docker compose up failed"
fi

echo "Waiting for service to be ready..."
HEALTHY=false
MAX_HEALTH_WAIT_SECONDS=${MAX_HEALTH_WAIT_SECONDS:-180}
HEALTH_POLL_INTERVAL_SECONDS=5
MAX_HEALTH_POLLS=$((MAX_HEALTH_WAIT_SECONDS / HEALTH_POLL_INTERVAL_SECONDS))
if [ "$MAX_HEALTH_POLLS" -lt 1 ]; then
  MAX_HEALTH_POLLS=1
fi

for i in $(seq 1 "$MAX_HEALTH_POLLS"); do
  if ! docker ps --filter name=$CONTAINER | grep -q $CONTAINER; then
    rollback "Container not running after startup"
  fi

  HEALTH_STATUS=$(docker inspect $CONTAINER --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo "unknown")

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ Container is healthy${NC}"
    HEALTHY=true
    break
  fi

  if [ "$HEALTH_STATUS" = "unhealthy" ]; then
    docker logs --tail 50 $CONTAINER
    rollback "Container health check failed (unhealthy)"
  fi

  echo "Waiting health... ($i/$MAX_HEALTH_POLLS, status=$HEALTH_STATUS)"
  sleep "$HEALTH_POLL_INTERVAL_SECONDS"
done

if [ "$HEALTHY" = false ]; then
  docker logs --tail 50 $CONTAINER
  rollback "Container health check timeout (still not healthy after ${MAX_HEALTH_WAIT_SECONDS}s, status=${HEALTH_STATUS:-unknown})"
fi

echo "Testing API health endpoint..."
MAX_RETRIES=5
API_HEALTHY=false
for i in $(seq 1 $MAX_RETRIES); do
  if curl -f -s http://localhost:${HEALTH_PORT}/api/health > /dev/null; then
    echo -e "${GREEN}✓ API is responding${NC}"
    API_HEALTHY=true
    break
  fi
  echo "Retry $i/$MAX_RETRIES..."
  sleep 3
done

if [ "$API_HEALTHY" = false ]; then
  echo -e "${RED}❌ API health check failed after $MAX_RETRIES attempts${NC}"
  docker logs --tail 50 $CONTAINER
  rollback "API health check failed"
fi

echo "Cleaning up old images..."
docker images "${IMAGE_NAME}" --format "{{.Tag}}" | grep "^staging-" | grep -v "rollback" | tail -n +4 | xargs -r -I {} docker rmi "${IMAGE_NAME}:{}" || true

echo -e "${GREEN}=== Staging deployment completed successfully ===${NC}"
docker logs --tail 20 $CONTAINER
