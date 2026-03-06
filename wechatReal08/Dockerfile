FROM golang:1.24

WORKDIR /usr/wic-go
RUN go env -w GO111MODULE=on
RUN go env -w GOPROXY=https://goproxy.cn,direct
ADD . /usr/wic-go
RUN go mod download
RUN go build main.go

RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

EXPOSE 8061
# 启动时执行go
ENTRYPOINT ["./main"]