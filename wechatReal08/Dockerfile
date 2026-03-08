FROM golang:1.24

# 安装 gcc 和 C 库，加载 .so 必须
RUN apt-get update && apt-get install -y gcc libc6-dev

WORKDIR /usr/wic-go

# 设置 Go 环境
RUN go env -w GO111MODULE=on
RUN go env -w GOPROXY=https://goproxy.cn,direct

# 拷贝代码
ADD . /usr/wic-go

# 强制使用 Docker 环境配置
COPY ./conf/app-docker.conf /usr/wic-go/conf/app.conf

# 编译 (必须开启 CGO 以支持 lib/libv08.so)
RUN CGO_ENABLED=1 go build -o main main.go

# 设置动态库搜索路径
ENV LD_LIBRARY_PATH=/usr/wic-go/lib:$LD_LIBRARY_PATH

# 时区
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

EXPOSE 8061

ENTRYPOINT ["./main"]