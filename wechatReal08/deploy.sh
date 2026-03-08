#!/bin/bash

# 设置名称
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"

echo ">>> 正在停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 正在构建全新 Docker 镜像..."
docker build -t $IMAGE_NAME .

echo ">>> 正在以 host 模式启动容器 (直连宿主机网络，支持 IPv6 & Redis 127.0.0.1)..."
# 使用 --network host 直接共享宿主机网络桩，无需手动映射端口
docker run -d \
  --name $CONTAINER_NAME \
  -p 8061:8061 \
  --network host \
  --restart always \
  $IMAGE_NAME

echo ">>> 部署成功！"
echo ">>> 正在跟踪日志..."
docker logs -f $CONTAINER_NAME
