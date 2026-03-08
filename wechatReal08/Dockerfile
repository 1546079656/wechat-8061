FROM golang:1.24

# 安装编译工具
RUN apt-get update && apt-get install -y gcc libc6-dev

WORKDIR /usr/wic-go

# 设置 Go 代理环境
RUN go env -w GO111MODULE=on
RUN go env -w GOPROXY=https://goproxy.cn,direct

# 拷贝整个项目
COPY . .

# 强制覆盖默认配置
COPY ./conf/app-docker.conf /usr/wic-go/conf/app.conf

# 编译主程序 (开启 CGO 以支持动态库加载)
RUN CGO_ENABLED=1 go build -o main main.go

# 设置动态库加载路径 (重要：否则运行时报 libv08.so 找不到)
ENV LD_LIBRARY_PATH=/usr/wic-go/lib:$LD_LIBRARY_PATH

# 设置时区
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 关键：显式声明运行命令
# 使用二进制形式避免解析歧义
ENTRYPOINT ["/usr/wic-go/main"]