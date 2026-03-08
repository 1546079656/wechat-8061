#!/bin/bash

# 设置镜像和容器名称
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"

echo ">>> 停止并删除旧容器 (如果存在)..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 开始构建 Docker 镜像..."
# 使用 --no-cache 确保编译最新代码
docker build -t $IMAGE_NAME .

echo ">>> 启动新容器 (使用 host 网络模式)..."
# --network host 模式直接使用宿主机网络，方便连接宿主机 Redis (127.0.0.1)
docker run -d \
  --name $CONTAINER_NAME \
  --network host \
  --restart always \
  $IMAGE_NAME

echo ">>> 部署完成！"
echo ">>> 正在查看实时日志 (按 Ctrl+C 退出日志查看)..."
docker logs -f $CONTAINER_NAME
