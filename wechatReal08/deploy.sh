#!/bin/bash

# 设置名称
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"

echo ">>> 正在停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 正在构建全新 Docker 镜像 (使用国内镜像源)..."
# 注意：如果构建依然慢，建议检查服务器网络或配置 Docker 镜像加速器
docker build -t $IMAGE_NAME .

echo ">>> 正在以 host 模式启动容器..."
docker run -d \
  --name $CONTAINER_NAME \
  --network host \
  --restart always \
  $IMAGE_NAME

echo ">>> 部署成功！正在跟踪最新日志..."
docker logs -f $CONTAINER_NAME
