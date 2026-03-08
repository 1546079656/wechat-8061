#!/bin/bash

# 设置名称
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"

echo ">>> 正在停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 正在构建全新 Docker 镜像..."
docker build -t $IMAGE_NAME .

echo ">>> 正在启动容器 (显式映射 8061 端口)..."
# 1. -p 8061:8061 显式映射端口，这样你在面板里就能看到了
# 2. --add-host 确保容器内能通过 host.docker.internal 连上宿主机 Redis
docker run -d \
  --name $CONTAINER_NAME \
  -p 8061:8061 \
  --add-host=host.docker.internal:host-gateway \
  --restart always \
  $IMAGE_NAME

echo ">>> 部署成功！"
echo ">>> 端口映射: 8061 -> 8061"
echo ">>> 正在跟踪日志..."
docker logs -f $CONTAINER_NAME
