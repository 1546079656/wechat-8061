package main

import (
	"fmt"
	"github.com/astaxie/beego"
	"github.com/lunny/log"
	"runtime"
	"wechatReal08/TcpPoll"
	"wechatReal08/comm"
	_ "wechatReal08/routers"
	"wechatReal08/srv/wxcore"
)

func main() {
	longLinkEnabled, _ := beego.AppConfig.Bool("longlinkenabled")

	comm.RedisInitialize()
	_, err := comm.RedisClient.Ping().Result()
	if err != nil {
		panic(fmt.Sprintf("【Redis】连接失败，ERROR：%v", err.Error()))
	}

	comm.RabbitMQSetup()

	sysType := runtime.GOOS

	if sysType == "linux" && longLinkEnabled {
		// LINUX系统
		tcpManager, err := TcpPoll.GetTcpManager()
		if err != nil {
			log.Errorf("TCP启动失败.")
		}
		go tcpManager.RunEventLoop()
	}

	// bee generate docs 生成文档

	// 初始化自动心跳包
	go wxcore.GetWXConnectMgr().InitAutoHeartBeat()
	beego.BConfig.WebConfig.DirectoryIndex = true
	beego.BConfig.WebConfig.StaticDir["/"] = "swagger"

	beego.SetLogFuncCall(false)
	//beego.InsertFilter("/*", beego.BeforeRouter, middleware.BaseAuthLog, false)
	beego.Run()
	// 生成 swagger 文档 bee generate docs
}
