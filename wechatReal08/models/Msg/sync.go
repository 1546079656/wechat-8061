package Msg

import (
	"fmt"
	"wechatReal08/Algorithm"
	"wechatReal08/Cilent/mm"
	"wechatReal08/comm"
	"wechatReal08/models"

	"github.com/golang/protobuf/proto"
)

type SyncParam struct {
	Wxid    string
	Scene   uint32
	Synckey string
}

type SyncResponse struct {
	ModUserInfos    []mm.ModUserInfo    //CmdId = 1
	ModContacts     []mm.ModContact     //CmdId = 2
	DelContacts     []mm.DelContact     //CmdId = 4
	ModUserImgs     []mm.ModUserImg     //CmdId = 35
	FunctionSwitchs []mm.FunctionSwitch //CmdId = 23
	UserInfoExts    []mm.UserInfoExt    //CmdId = 44
	AddMsgs         []mm.AddMsg         //CmdId = 5
	SnsObjectList   []mm.SnsObject      //CmdId = 46
	ContinueFlag    int32
	KeyBuf          mm.SKBuiltinBufferT
	Status          int32
	Continue        int32
	Time            int32
	UnknownCmdId    string
	Remarks         string
}

func Sync(Data SyncParam) models.ResponseResult {
	D, err := comm.GetLoginata(Data.Wxid, nil)
	if err != nil {
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("异常：%v", err.Error()),
			Data:    nil,
		}
	}

	// 用于聚合所有分页的数据
	var AllModUserInfos []mm.ModUserInfo
	var AllModContacts []mm.ModContact
	var AllDelContacts []mm.DelContact
	var AllModUserImgs []mm.ModUserImg
	var AllFunctionSwitchs []mm.FunctionSwitch
	var AllUserInfoExts []mm.UserInfoExt
	var AllAddMsgs []mm.AddMsg
	AllUnknownCmdId := ""

	var lastResponse *mm.NewSyncResponse

	// 最多循环 10 次，防止死循环（正常不会超过 3-4 次）
	const maxPages = 10

	for page := 0; page < maxPages; page++ {
		// 每次使用最新的 SyncKey
		Synckey := mm.SKBuiltinBufferT{
			ILen:   proto.Uint32(uint32(len(D.SyncKey))),
			Buffer: D.SyncKey,
		}

		req := &mm.NewSyncRequest{
			Oplog: &mm.CmdList{
				Count: proto.Uint32(0),
				List:  nil,
			},
			Selector:      proto.Uint32(262151),
			KeyBuf:        &Synckey,
			Scene:         proto.Uint32(Data.Scene),
			DeviceType:    proto.String("iPhone"),
			SyncMsgDigest: proto.Uint32(3),
		}

		reqdata, err := proto.Marshal(req)
		if err != nil {
			return models.ResponseResult{
				Code:    -8,
				Success: false,
				Message: fmt.Sprintf("系统异常：%v", err.Error()),
				Data:    nil,
			}
		}

		// 发包
		protobufdata, _, errtype, err := comm.SendRequest(comm.SendPostData{
			Ip:     D.Mmtlsip,
			Host:   D.ShortHost,
			Cgiurl: "/cgi-bin/micromsg-bin/newsync",
			Proxy:  D.Proxy,
			PackData: Algorithm.PackData{
				Reqdata:          reqdata,
				Cgi:              138,
				Uin:              D.Uin,
				Cookie:           D.Cooike,
				Sessionkey:       D.Sessionkey,
				Loginecdhkey:     D.RsaPublicKey,
				Clientsessionkey: D.Clientsessionkey,
				Serversessionkey: D.Serversessionkey,
				UseCompress:      false,
			},
		}, D.MmtlsKey)

		if err != nil {
			return models.ResponseResult{
				Code:    errtype,
				Success: false,
				Message: err.Error(),
				Data:    nil,
			}
		}

		// 解包
		NewSyncResponse := mm.NewSyncResponse{}
		err = proto.Unmarshal(protobufdata, &NewSyncResponse)
		if err != nil {
			return models.ResponseResult{
				Code:    -8,
				Success: false,
				Message: fmt.Sprintf("反序列化失败：%v", err.Error()),
				Data:    nil,
			}
		}

		lastResponse = &NewSyncResponse

		// 解析本页的消息数据并聚合
		if NewSyncResponse.CmdList != nil && len(NewSyncResponse.CmdList.List) > 0 {
			for _, v := range NewSyncResponse.CmdList.List {
				switch *v.CmdId {
				case int32(mm.SyncCmdID_CmdIdModUserInfo): // CmdId = 1
					var data mm.ModUserInfo
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllModUserInfos = append(AllModUserInfos, data)
				case int32(mm.SyncCmdID_CmdIdModContact): // CmdId = 2
					var data mm.ModContact
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllModContacts = append(AllModContacts, data)
				case int32(mm.SyncCmdID_CmdIdDelContact): // CmdId = 4
					var data mm.DelContact
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllDelContacts = append(AllDelContacts, data)
				case int32(mm.SyncCmdID_MM_SYNCCMD_MODUSERIMG): // CmdId = 35
					var data mm.ModUserImg
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllModUserImgs = append(AllModUserImgs, data)
				case int32(mm.SyncCmdID_CmdIdFunctionSwitch): // CmdId = 23
					var data mm.FunctionSwitch
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllFunctionSwitchs = append(AllFunctionSwitchs, data)
				case int32(mm.SyncCmdID_MM_SYNCCMD_USERINFOEXT): // CmdId = 44
					var data mm.UserInfoExt
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllUserInfoExts = append(AllUserInfoExts, data)
				case int32(mm.SyncCmdID_CmdIdAddMsg): // CmdId = 5
					var data mm.AddMsg
					_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
					AllAddMsgs = append(AllAddMsgs, data)
				default:
					AllUnknownCmdId += AllUnknownCmdId + ";" + fmt.Sprintf("%v", *v.CmdId)
				}
			}
		}

		// 更新 SyncKey 到缓存（每一页都更新，保证断点续传）
		D.SyncKey = NewSyncResponse.KeyBuf.Buffer
		_ = comm.CreateLoginData(D, D.Wxid, 0, nil)

		// 检查 ContinueFlag：为 0 表示所有消息已同步完毕
		if NewSyncResponse.ContinueFlag == nil || *NewSyncResponse.ContinueFlag == 0 {
			break
		}

		fmt.Printf("[Sync] wxid [%s] ContinueFlag=%d，还有更多消息，继续拉取第 %d 页...\n", Data.Wxid, *NewSyncResponse.ContinueFlag, page+2)
	}

	// 有消息数据时返回聚合结果
	if len(AllAddMsgs) > 0 || len(AllModContacts) > 0 || len(AllModUserInfos) > 0 ||
		len(AllDelContacts) > 0 || len(AllModUserImgs) > 0 || len(AllFunctionSwitchs) > 0 ||
		len(AllUserInfoExts) > 0 {
		return models.ResponseResult{
			Code:    0,
			Success: true,
			Message: "成功",
			Data: SyncResponse{
				ModUserInfos:    AllModUserInfos,
				ModContacts:     AllModContacts,
				DelContacts:     AllDelContacts,
				ModUserImgs:     AllModUserImgs,
				FunctionSwitchs: AllFunctionSwitchs,
				UserInfoExts:    AllUserInfoExts,
				AddMsgs:         AllAddMsgs,
				ContinueFlag:    0, // 全部拉完后 flag 为 0
				KeyBuf: mm.SKBuiltinBufferT{
					ILen:   lastResponse.KeyBuf.ILen,
					Buffer: lastResponse.KeyBuf.Buffer,
				},
				Status:       *lastResponse.Status,
				Continue:     *lastResponse.Continue,
				Time:         *lastResponse.Time,
				UnknownCmdId: AllUnknownCmdId,
				Remarks:      "",
			},
		}
	}

	return models.ResponseResult{
		Code:    0,
		Success: true,
		Message: "当前未有新消息",
		Data:    lastResponse,
	}
}
