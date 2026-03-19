package wxcore

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
	"wechatReal08/Algorithm"
	"wechatReal08/Cilent/mm"
	"wechatReal08/TcpPoll"
	"wechatReal08/comm"
	"wechatReal08/models"
	"wechatReal08/models/Login"
	"wechatReal08/models/Msg"
	"wechatReal08/srv/wxface"

	"github.com/astaxie/beego"

	"google.golang.org/protobuf/proto"
)

// WXModels 微信链接接口
type WXModels struct {
	wxconn *WXConnect
	syncMu sync.Mutex // 防止多个 CMD 24 并发调用 Sync 导致 SyncKey 竞争
}

// NewWXReqInvoker 新建一个请求调用器
func NewWXModels(wxconn *WXConnect) wxface.IWXModels {
	return &WXModels{
		wxconn: wxconn,
	}
}

// 消息同步接口
func (m *WXModels) MsgSync(Data Msg.SyncParam) models.ResponseResult {
	return Msg.Sync(Data)
}

// 短链接心跳接口
func (m *WXModels) LoginHeartBeat(Wxid string) (models.ResponseResult, *mm.HeartBeatResponse) {
	return Login.HeartBeat(Wxid)
}

// 长连接心跳接口
func (m *WXModels) LoginHeartBeatLong(Wxid string) (models.ResponseResult, *mm.HeartBeatResponse) {
	tcpManager, err := TcpPoll.GetTcpManager()
	if err != nil {
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("出错了: %v", err.Error()),
			Data:    nil,
		}, nil
	}
	userInfo := m.wxconn.GetWXAccount().GetUserInfo()
	// 从缓存获取
	D, err := comm.GetLoginata(userInfo.Wxid, nil)
	if err != nil || D == nil || D.Wxid == "" {
		errorMsg := fmt.Sprintf("LoginHeartBeatLong 出错了: %v [%v]", "未找到登录信息", userInfo.Wxid)
		if err != nil {
			errorMsg = fmt.Sprintf("LoginHeartBeatLong 出错了: %v", err.Error())
		}
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: errorMsg,
			Data:    nil,
		}, nil
	}
	client, err := tcpManager.GetClient(userInfo, m.MsgListen)
	if err != nil {
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("出错了: %v", err.Error()),
			Data:    nil,
		}, nil
	}
	req := &mm.HeartBeatRequest{
		BaseRequest: &mm.BaseRequest{
			SessionKey:    D.Sessionkey,
			Uin:           proto.Uint32(D.Uin),
			DeviceId:      D.Deviceid_byte,
			ClientVersion: proto.Int32(int32(D.ClientVersion)),
			DeviceType:    []byte(D.DeviceType),
			Scene:         proto.Uint32(2),
		},
		TimeStamp: proto.Uint32(uint32(time.Now().Unix())),
	}

	reqdata, err := proto.Marshal(req)
	sendData := Algorithm.Pack(reqdata, 518, D.Uin, D.Sessionkey, D.Cooike, D.Clientsessionkey, D.RsaPublicKey, 5, false)
	// mmtls发包
	cmdId := 238
	fmt.Printf("--- [保活机制] 💓 发送 238 业务心跳 (告诉微信服务器我在线) | WXID: %s | 时间: %s ---\n", userInfo.Wxid, time.Now().Format("2006-01-02 15:04:05"))
	protobufdata, err := client.MmtlsSend(sendData, cmdId, "238心跳")
	if err != nil {
		// [修复心跳误杀] 若心跳超时，不要在这里 Remove 客户端！
		// 因为长连接可能还没断，只是这次包慢了。
		// 下次心跳时 GetClient 会自动检查连接状态。
		fmt.Printf("--- [保活监控] ⚠️ 心跳结果获取异常: %v (通常是网络延迟，连接保持中) ---\n", err)
		return models.ResponseResult{Code: -8, Message: err.Error()}, nil
	}
	//解包
	HeartBeatResponse := mm.HeartBeatResponse{}
	err = proto.Unmarshal(*protobufdata, &HeartBeatResponse)
	if err != nil {
		tcpManager.Remove(client)
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("反序列化失败：%v", err.Error()),
			Data:    nil,
		}, nil
	}

	return models.ResponseResult{
		Code:    0,
		Success: true,
		Message: "成功",
		Data:    HeartBeatResponse,
	}, &HeartBeatResponse
}

// 二次登录接口
func (m *WXModels) LoginSecautoauth(Wxid string) (models.ResponseResult, *mm.UnifyAuthResponse) {
	return Login.Secautoauth(Wxid)
}

// 消息监听
func (m *WXModels) MsgListen(cmdId int) error {
	// 如果收到 CMD 24 (Notify)，则同步普通消息
	if cmdId == 24 {
		go m.doSyncAndForward()
		return nil
	}

	// 忽略心跳相关的推送包，不需要任何操作
	if cmdId == 1000000238 || cmdId == 238 || cmdId == 1000000006 {
		return nil
	}

	return nil
}

// doSyncAndForward 执行消息同步并转发，带互斥锁和重试机制，确保不丢消息
func (m *WXModels) doSyncAndForward() {
	wxid := m.wxconn.GetWXAccount().GetUserInfo().Wxid

	// [防护1] 互斥锁：防止多个 CMD 24 同时触发 Sync，导致 SyncKey 竞争丢消息
	m.syncMu.Lock()
	defer m.syncMu.Unlock()

	// [防护2] 重试机制：Sync 失败时重试，确保网络抖动不丢消息
	const maxRetries = 3
	var WXDATA models.ResponseResult

	for attempt := 1; attempt <= maxRetries; attempt++ {
		WXDATA = Msg.Sync(Msg.SyncParam{Wxid: wxid, Synckey: "", Scene: 0})

		if WXDATA.Code == 0 {
			break // 成功
		}

		fmt.Printf("[Sync] wxid [%s] 第 %d 次同步失败: %s，2秒后重试...\n", wxid, attempt, WXDATA.Message)
		if attempt < maxRetries {
			time.Sleep(2 * time.Second)
		}
	}

	// [防护3] 只在同步成功时才转发，避免转发错误数据
	if WXDATA.Code != 0 {
		fmt.Printf("[Sync] wxid [%s] 同步最终失败: %s，消息将在下次 CMD 24 时重新拉取\n", wxid, WXDATA.Message)
		return
	}

	// 序列化消息体
	jsonValue, err := json.Marshal(WXDATA)
	if err != nil {
		fmt.Printf("[Sync] wxid [%s] 序列化失败: %v\n", wxid, err)
		return
	}

	// 1. 发送 HTTP 业务回调 (转发给你的服务器)
	syncUrl := strings.Replace(beego.AppConfig.String("syncmessagebusinessuri"), "{0}", wxid, -1)
	reqBody := strings.NewReader(string(jsonValue))
	go comm.HttpPosthb(syncUrl, reqBody, nil, "", "", "", "")

	// 2. 如果开启了 RabbitMQ，则推送到队列
	rabbitmqEnabled, err := beego.AppConfig.Bool("rabbitmq")
	if err == nil && rabbitmqEnabled {
		comm.PublishRabbitMq(beego.AppConfig.String("rabbitmqexchange"), jsonValue)
	}
}
