#!/bin/bash

# 设置名称
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"

echo ">>> 正在停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 正在构建全新 Docker 镜像..."
docker build -t $IMAGE_NAME .

echo ">>> 正在启动容器 (使用端口映射和 host-gateway)..."
# 1. -p 8061:8061 将宿主机端口映射到容器
# 2. --add-host 允许容器通过 host.docker.internal 访问宿主机 Redis
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
