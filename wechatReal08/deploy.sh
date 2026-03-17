#!/bin/bash

# 1. 设置变量
IMAGE_NAME="wechat-api-v08"
CONTAINER_NAME="wechat-api"
APP_CONF_PATH="$(pwd)/conf/app-docker.conf" # 自动识别当前目录下的 docker 特供配置文件

echo ">>> 正在停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

echo ">>> 正在构建全新 Docker 镜像..."
docker build -t $IMAGE_NAME .

echo ">>> 正在启动容器..."
# 保持 --network host 以支持极速访问宿机 Redis (127.0.0.1)
# 增加 --add-host 解决部分服务器无法直连微信 MMTLS 域名的问题
# 增加 -v 挂载配置文件，实现配置与镜像分离
docker run -d \
  --name $CONTAINER_NAME \
  --network host \
  --restart always \
  -v "$APP_CONF_PATH:/usr/wic-go/conf/app.conf" \
  $IMAGE_NAME

echo ">>> 部署成功！"
echo ">>> 5秒后将开始查看实时日志 (按 Ctrl+C 退出日志跟踪)..."
sleep 5
docker logs -f $CONTAINER_NAME
