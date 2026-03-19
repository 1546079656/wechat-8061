package wxcore

import (
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"
	"wechatReal08/Cilent/mm"
	"wechatReal08/comm"
	"wechatReal08/srv"
	"wechatReal08/srv/wxface"
)

// WXConnect 微信链接
type WXConnect struct {
	wXConnectMgr *WXConnectMgr
	// 请求调用器
	wxModels wxface.IWXModels
	// 微信账号信息
	WxAccount *srv.WXAccount
	// 心跳定时器
	HeartBeatTimer *time.Timer
	// 刷新 token 定时器(二次登录)
	RefreshTokenTimer *time.Timer
	// 断开链接
	ExitFlagChan chan bool
	//
	isConnected bool
	// 启动时间，避免重复启动
	startTime int64
	// 互斥锁
	mu sync.Mutex
}

// GetWXAccount 获取微信帐号信息
func (wxconn *WXConnect) GetWXAccount() *srv.WXAccount {
	return wxconn.WxAccount
}

// NewWXConnect 新的微信连接
func NewWXConnect(wXConnectMgr *WXConnectMgr, wxAccount *srv.WXAccount) wxface.IWXConnect {
	wxconn := &WXConnect{
		wXConnectMgr: wXConnectMgr,
		WxAccount:    wxAccount,
		ExitFlagChan: make(chan bool, 1),
		isConnected:  false,
	}
	wxconn.wxModels = NewWXModels(wxconn)
	return wxconn
}

// startLongWriter 开启长链接发送数据
func (wxconn *WXConnect) startLongWriter() {
	startTime := wxconn.startTime
	for { // 心跳包
		select {
		case <-wxconn.HeartBeatTimer.C:
			if startTime != wxconn.startTime {
				return
			}
			// 发送心跳包
			_ = wxconn.SendHeartBeat()
			continue

		case <-wxconn.RefreshTokenTimer.C:
			if startTime != wxconn.startTime {
				return
			}
			_ = wxconn.RefreshToken(0)
			continue
		case <-wxconn.ExitFlagChan:
			return
		}
	}
}

// 发送心跳
//
//	func (wxconn *WXConnect) SendHeartBeat() error {
//		userInfo := wxconn.WxAccount.GetUserInfo()
//		var BaseRes *mm.HeartBeatResponse = &mm.HeartBeatResponse{}
//		// 判断 linux 和 win
//		switch runtime.GOOS {
//		case "linux":
//			_, BaseRes = wxconn.wxModels.LoginHeartBeatLong(wxconn.WxAccount.GetUserInfo().Wxid)
//		default:
//			_, BaseRes = wxconn.wxModels.LoginHeartBeat(wxconn.WxAccount.GetUserInfo().Wxid)
//		}
//
//		NextTime := BaseRes.GetNextTime()
//		if NextTime < 100 {
//			NextTime = 175
//		}
//		wxconn.SendHeartBeatWaitingSeconds(NextTime)
//		timeStr := time.Now().Add(time.Duration(NextTime) * time.Second).Format("2006-01-02 15:04:05")
//
//		if BaseRes == nil || BaseRes.GetBaseResponse().GetRet() != 0 {
//			timeStr := time.Now().Format("2006-01-02 15:04:05")
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] 发送心跳失败，不暂停自动心跳 保持下一次 %s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			fmt.Println(fmt.Sprintf("[%s],[%s] 发送心跳失败，不暂停自动心跳 %s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			//wxconn.Stop()
//			//return errors.New("发送心跳失败")
//		} else {
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] 发送心跳成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			fmt.Println(fmt.Sprintf("[%s],[%s] 发送心跳成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//		}
//
//		return nil
//	}
func (wxconn *WXConnect) SendHeartBeat() error {
	userInfo := wxconn.WxAccount.GetUserInfo()
	var BaseRes *mm.HeartBeatResponse

	// 5 次重试，递增退避间隔：立即 → 60s → 150s → 270s → 270s
	retryIntervals := []time.Duration{
		0,                    // 第1次：立即
		60 * time.Second,     // 第2次：60秒后
		150 * time.Second,    // 第3次：150秒后
		270 * time.Second,    // 第4次：270秒后
		270 * time.Second,    // 第5次：270秒后
	}

	var lastRetCode int32 = -1

	for i, interval := range retryIntervals {
		if i > 0 {
			fmt.Printf("--- [保活修复] ⏳ 第 %d 次重试心跳，%v 后执行... (WXID: %s) ---\n", i+1, interval, userInfo.Wxid)
			time.Sleep(interval)
		}

		switch runtime.GOOS {
		case "linux":
			_, BaseRes = wxconn.wxModels.LoginHeartBeatLong(userInfo.Wxid)
		default:
			_, BaseRes = wxconn.wxModels.LoginHeartBeat(userInfo.Wxid)
		}

		if BaseRes != nil && BaseRes.GetBaseResponse().GetRet() == 0 {
			// 心跳成功
			NextTime := BaseRes.GetNextTime()
			if NextTime < 100 {
				NextTime = 175
			}
			timeStr := time.Now().Add(time.Duration(NextTime) * time.Second).Format("2006-01-02 15:04:05")
			msg := fmt.Sprintf("[%s],[%s] 发送心跳成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr)

			comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
			fmt.Println(msg)
			wxconn.SendHeartBeatWaitingSeconds(NextTime)
			return nil
		} else {
			// 心跳失败
			if BaseRes != nil {
				lastRetCode = BaseRes.GetBaseResponse().GetRet()
			}
			fmt.Printf("--- [保活报警] ⚠️ 第 %d 次发送心跳失败 (RetCode: %d) ---\n", i+1, lastRetCode)

			// 只在最后一次重试仍然失败时才尝试重登
			if i == len(retryIntervals)-1 {
				fmt.Printf("--- [保活修复] 🔄 5次心跳全部失败，尝试执行一次二次登录修复 session ---\n")
				wxconn.wxModels.LoginSecautoauth(userInfo.Wxid)
			}
		}
	}

	// 5 次全部失败，根据 RetCode 决定行为
	timeNowStr := time.Now().Format("2006-01-02 15:04:05")

	// RetCode 为特定值（如被踢下线）时，停止重试
	if lastRetCode == -100 || lastRetCode == -101 || lastRetCode == -200 {
		msg := fmt.Sprintf("[%s],[%s] 账号可能已被踢下线 (RetCode: %d)，停止心跳 %s", userInfo.Wxid, userInfo.GetNickName(), lastRetCode, timeNowStr)
		comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
		fmt.Println(msg)
		wxconn.Stop()
		return errors.New("账号被踢下线，已停止心跳")
	}

	// 其他情况（运营商网络问题等），60 秒后继续重试，永不放弃
	msg := fmt.Sprintf("[%s],[%s] 心跳连续5次失败 (RetCode: %d)，60秒后继续重试... %s", userInfo.Wxid, userInfo.GetNickName(), lastRetCode, timeNowStr)
	comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
	fmt.Println(msg)
	wxconn.SendHeartBeatWaitingSeconds(60)
	return errors.New("心跳暂时失败，正在后台持续重连")
}

// 发送二次登录
//
//	func (wxconn *WXConnect) RefreshToken(num int) error {
//		timeNowStr := time.Now().Format("2006-01-02 15:04:05")
//		temUserInfo := wxconn.WxAccount.GetUserInfo()
//		userInfo, err := comm.GetLoginata(temUserInfo.Wxid, nil)
//		if err != nil || userInfo == nil || userInfo.Wxid == "" {
//			fmt.Println("RefreshToken 获取用户信息失败", temUserInfo.Wxid)
//			comm.AutoHeartBeatListAdd(temUserInfo.Wxid, fmt.Sprintf("[%s],[%s] RefreshToken 获取用户信息失败，已暂停自动心跳 %s", temUserInfo.Wxid, temUserInfo.GetNickName(), timeNowStr))
//			return errors.New("获取用户信息失败")
//		}
//		// 获取上一次刷新 token 时间
//		lastRefreshTokenTime := userInfo.RefreshTokenDate
//		// 判断是否需要刷新 token
//		if lastRefreshTokenTime+1800 > time.Now().Unix() {
//			Minutes := (lastRefreshTokenTime + 3600 - time.Now().Unix()) / 60
//			if Minutes <= 1 {
//				Minutes = 1
//			}
//			wxconn.SendRefreshTokenWaitingMinutes(uint32(int(Minutes)))
//			timeStr := time.Now().Add(time.Minute * time.Duration(Minutes)).Format("2006-01-02 15:04:05")
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] RefreshToken 自动二次登录已开启，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			fmt.Println(fmt.Sprintf("[%s],[%s] RefreshToken 自动二次登录已开启，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			return nil
//		}
//
//		_, res := wxconn.wxModels.LoginSecautoauth(userInfo.Wxid)
//		if res == nil {
//			fmt.Println("发送二次登录失败: ", userInfo.Wxid)
//			if num < 3 {
//				time.Sleep(time.Second * 10)
//				go wxconn.RefreshToken(num + 1)
//				return nil
//			}
//			//wxconn.Stop()
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] res.Data == nil 发送二次登录失败，不暂停自动心跳 %s", userInfo.Wxid, userInfo.GetNickName(), timeNowStr))
//			//return errors.New("res.Data == nil 发送二次登录失败")
//		}
//		wxconn.SendRefreshTokenWaitingMinutes(60)
//		timeStr := time.Now().Add(time.Minute * 60).Format("2006-01-02 15:04:05")
//
//		if res.GetBaseResponse().GetRet() != 0 {
//			fmt.Println("发送二次登录失败 GetRet() != 0: ", userInfo.Wxid)
//			if num < 3 {
//				time.Sleep(time.Second * 10)
//				go wxconn.RefreshToken(num + 1)
//				return nil
//			}
//			//wxconn.Stop()
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] res.GetBaseResponse().GetRet() != 0 发送二次登录失败，不暂停自动心跳 %s", userInfo.Wxid, userInfo.GetNickName(), timeNowStr))
//			//return errors.New("res.GetBaseResponse().GetRet() != 0 发送二次登录失败")
//		} else {
//			// 打印日志
//			comm.AutoHeartBeatListAdd(userInfo.Wxid, fmt.Sprintf("[%s],[%s] 二次登录成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//			fmt.Println(fmt.Sprintf("[%s],[%s] 二次登录成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
//		}
//		return nil
//	}
//

// RefreshToken 发送二次登录请求，失败时重试指定次数，仍失败则等待一段时间后再尝试
func (wxconn *WXConnect) RefreshToken(maxRetries int) error {
	const retryInterval = 10 * time.Second // 每次重试间隔
	const nextRetryTime = 1 * time.Minute  // 多次失败后下次尝试时间（例如：1分钟后）

	timeNowStr := time.Now().Format("2006-01-02 15:04:05")
	temUserInfo := wxconn.WxAccount.GetUserInfo()
	fmt.Printf("--- [保活机制] 🔄 执行 Token 刷新 (保证 Session 永不过期) | WXID: %s | 时间: %s ---\n", temUserInfo.Wxid, timeNowStr)

	// 获取用户信息
	userInfo, err := comm.GetLoginata(temUserInfo.Wxid, nil)
	if err != nil || userInfo == nil || userInfo.Wxid == "" {
		msg := fmt.Sprintf("[%s],[%s] RefreshToken 获取用户信息失败 %s", temUserInfo.Wxid, temUserInfo.GetNickName(), timeNowStr)
		fmt.Println(msg)
		comm.AutoHeartBeatListAdd(temUserInfo.Wxid, msg)
		// 设置一小时后再尝试
		wxconn.SendRefreshTokenWaitingMinutes(uint32(nextRetryTime.Minutes()))
		return errors.New("获取用户信息失败")
	}

	// 判断是否需要刷新 token
	lastRefreshTokenTime := userInfo.RefreshTokenDate
	if lastRefreshTokenTime+1800 > time.Now().Unix() {
		Minutes := (lastRefreshTokenTime + 3600 - time.Now().Unix()) / 60
		if Minutes <= 1 {
			Minutes = 1
		}
		wxconn.SendRefreshTokenWaitingMinutes(uint32(Minutes))
		timeStr := time.Now().Add(time.Minute * time.Duration(Minutes)).Format("2006-01-02 15:04:05")
		msg := fmt.Sprintf("[%s],[%s] RefreshToken 自动二次登录已开启，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr)
		comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
		fmt.Println(msg)
		return nil
	}

	// 执行重试逻辑
	for attempt := 1; attempt <= 2; attempt++ {
		_, res := wxconn.wxModels.LoginSecautoauth(userInfo.Wxid)

		if res == nil {
			msg := fmt.Sprintf("[%s],[%s] 第 %d 次发送二次登录失败", userInfo.Wxid, userInfo.GetNickName(), attempt)
			fmt.Println(msg)
			comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
		} else if res.GetBaseResponse().GetRet() != 0 {
			msg := fmt.Sprintf("[%s],[%s] 第 %d 次发送二次登录失败：retCode=%d", userInfo.Wxid, userInfo.GetNickName(), attempt, res.GetBaseResponse().GetRet())
			fmt.Println(msg)
			comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
		} else {
			// 成功
			userInfo.RefreshTokenDate = time.Now().Unix()
			_ = comm.CreateLoginData(userInfo, userInfo.Wxid, 0, nil)

			wxconn.SendRefreshTokenWaitingMinutes(12 * 60) // Sid有效期24小时，12小时刷新一次足够安全
			timeStr := time.Now().Add(time.Hour * 12).Format("2006-01-02 15:04:05")
			msg := fmt.Sprintf("[%s],[%s] 二次登录成功，下次刷新时间：%s", userInfo.Wxid, userInfo.GetNickName(), timeStr)
			comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)
			fmt.Println(msg)
			return nil
		}

		// 如果不是最后一次尝试，则等待一段时间再重试
		if attempt < 2 {
			time.Sleep(retryInterval)
		}
	}

	// 所有重试都失败了 → 不关闭连接，设置一个较长时间后再次尝试
	msg := fmt.Sprintf("[%s],[%s] 二次登录多次失败，不关闭连接，将在 %d 分钟后重新尝试", userInfo.Wxid, userInfo.GetNickName(), uint32(nextRetryTime.Minutes()))
	fmt.Println(msg)
	comm.AutoHeartBeatListAdd(userInfo.Wxid, msg)

	wxconn.SendRefreshTokenWaitingMinutes(uint32(nextRetryTime.Minutes()))
	return errors.New("二次登录多次失败，未关闭连接")
}

// Start 开启微信链接任务
func (wxconn *WXConnect) Start() error {
	wxconn.mu.Lock()
	defer wxconn.mu.Unlock()
	// 如果是链接状态
	if wxconn.isConnected {
		return nil
	}
	wxconn.isConnected = true

	userInfo := wxconn.WxAccount.GetUserInfo()
	// 判断微信信息是否为空
	if userInfo == nil {
		return errors.New("wxconn.Start() err: userInfo == nil")
	}
	// 重置启动时间
	wxconn.startTime = time.Now().Unix()
	wxconn.HeartBeatTimer = time.NewTimer(time.Second * 175)
	// Sid有效期24小时，12小时刷新一次Token
	wxconn.RefreshTokenTimer = time.NewTimer(time.Hour * 12)
	wxconn.SendHeartBeatWaitingSeconds(175)
	wxconn.SendRefreshTokenWaitingMinutes(12 * 60)
	go wxconn.startLongWriter()
	return nil
}

// Stop 关闭链接
func (wxconn *WXConnect) Stop() {
	wxconn.mu.Lock()
	defer wxconn.mu.Unlock()
	// 重置启动时间
	wxconn.startTime = time.Now().Unix()
	// 断开链接
	wxconn.isConnected = false
	wxconn.ExitFlagChan <- true
	userInfo := wxconn.WxAccount.GetUserInfo()
	wxconn.wXConnectMgr.Remove(wxconn)
	// 立即过期
	wxconn.HeartBeatTimer.Reset(0)
	wxconn.RefreshTokenTimer.Reset(0)
	timeStr := time.Now().Format("2006-01-02 15:04:05")
	fmt.Println(fmt.Sprintf("[%s],[%s] 退出！ %s", userInfo.Wxid, userInfo.GetNickName(), timeStr))
}

// SendHeartBeatWaitingSeconds 添加到微信心跳包队列
func (wxconn *WXConnect) SendHeartBeatWaitingSeconds(seconds uint32) {
	wxconn.HeartBeatTimer.Reset(time.Second * time.Duration(seconds))
}

// SendRefreshTokenWaitingMinutes 添加到微信刷新 token 队列(按分钟计算）
func (wxconn *WXConnect) SendRefreshTokenWaitingMinutes(minutes uint32) {
	wxconn.RefreshTokenTimer.Reset(time.Minute * time.Duration(minutes))
}
