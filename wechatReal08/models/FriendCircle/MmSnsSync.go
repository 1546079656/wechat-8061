package FriendCircle

import (
	"encoding/base64"
	"fmt"
	"wechatReal08/Algorithm"
	"wechatReal08/Cilent/mm"
	"wechatReal08/comm"
	"wechatReal08/models"
	"wechatReal08/models/Msg"

	"github.com/golang/protobuf/proto"
)

type MmSnsSyncParam struct {
	Wxid    string
	Synckey string
}

func MmSnsSync(Data MmSnsSyncParam) models.ResponseResult {
	D, err := comm.GetLoginata(Data.Wxid, nil)
	if err != nil || D == nil || D.Wxid == "" {
		errorMsg := fmt.Sprintf("异常：%v [%v]", "未找到登录信息", Data.Wxid)
		if err != nil {
			errorMsg = fmt.Sprintf("异常：%v", err.Error())
		}
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: errorMsg,
			Data:    nil,
		}
	}

	Synckey := mm.SKBuiltinBufferT{
		ILen:   proto.Uint32(0),
		Buffer: []byte{},
	}

	if Data.Synckey != "" {
		key, _ := base64.StdEncoding.DecodeString(Data.Synckey)
		Synckey = mm.SKBuiltinBufferT{
			ILen:   proto.Uint32(uint32(len(key))),
			Buffer: key,
		}
	} else if len(D.SnsSyncKey) > 0 {
		Synckey = mm.SKBuiltinBufferT{
			ILen:   proto.Uint32(uint32(len(D.SnsSyncKey))),
			Buffer: D.SnsSyncKey,
		}
	}

	req := &mm.SnsSyncRequest{
		BaseRequest: &mm.BaseRequest{
			SessionKey:    D.Sessionkey,
			Uin:           proto.Uint32(D.Uin),
			DeviceId:      D.Deviceid_byte,
			ClientVersion: proto.Int32(369558056), // 对齐车机
			DeviceType:    []byte(D.DeviceType),
			Scene:         proto.Uint32(0),
		},
		Selector: proto.Uint32(256),
		KeyBuf:   &Synckey,
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
	//发包
	protobufdata, _, errtype, err := comm.SendRequest(comm.SendPostData{
		Ip:     D.Mmtlsip,
		Host:   D.ShortHost,
		Cgiurl: "/cgi-bin/micromsg-bin/mmsnssync",
		Proxy:  D.Proxy,
		PackData: Algorithm.PackData{
			Reqdata:          reqdata,
			Cgi:              682, // 车机协议
			Uin:              D.Uin,
			Cookie:           D.Cooike,
			Sessionkey:       D.Sessionkey,
			EncryptType:      5,
			Loginecdhkey:     D.RsaPublicKey,
			Clientsessionkey: D.Clientsessionkey,
			UseCompress:      true,
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

	//解包
	Response := mm.SnsSyncResponse{}
	err = proto.Unmarshal(protobufdata, &Response)
	if err != nil {
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("反序列化失败：%v", err.Error()),
			Data:    nil,
		}
	}

	if Response.GetBaseResponse().GetRet() != 0 {
		return models.ResponseResult{
			Code:    int64(Response.GetBaseResponse().GetRet()),
			Success: false,
			Message: fmt.Sprintf("mmsnssync失败: ret=%d err=%s", Response.GetBaseResponse().GetRet(), Response.GetBaseResponse().GetErrMsg().GetString_()),
			Data:    Response,
		}
	}

	// 更新并存储新的 SnsSyncKey
	if Response.KeyBuf != nil && len(Response.KeyBuf.Buffer) > 0 {
		D.SnsSyncKey = Response.KeyBuf.Buffer
		_ = comm.CreateLoginData(D, D.Wxid, 0, nil)
	}

	UnknownCmdId := ""

	var ModUserInfos []mm.ModUserInfo
	var ModContacts []mm.ModContact
	var DelContacts []mm.DelContact
	var ModUserImgs []mm.ModUserImg
	var FunctionSwitchs []mm.FunctionSwitch
	var UserInfoExts []mm.UserInfoExt
	var AddMsgs []mm.AddMsg
	var SnsObjectList []mm.SnsObject

	if Response.CmdList != nil && len(Response.CmdList.List) > 0 {
		for _, v := range Response.CmdList.List {
			switch *v.CmdId {
			case int32(mm.SyncCmdID_CmdIdModUserInfo): // CmdId = 1
				var data mm.ModUserInfo
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				ModUserInfos = append(ModUserInfos, data)
			case int32(mm.SyncCmdID_CmdIdModContact): // CmdId = 2
				var data mm.ModContact
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				ModContacts = append(ModContacts, data)
			case int32(mm.SyncCmdID_CmdIdDelContact): // CmdId = 4
				var data mm.DelContact
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				DelContacts = append(DelContacts, data)
			case int32(mm.SyncCmdID_MM_SYNCCMD_MODUSERIMG): // CmdId = 35
				var data mm.ModUserImg
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				ModUserImgs = append(ModUserImgs, data)
			case int32(mm.SyncCmdID_CmdIdFunctionSwitch): // CmdId = 23
				var data mm.FunctionSwitch
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				FunctionSwitchs = append(FunctionSwitchs, data)
			case int32(mm.SyncCmdID_MM_SYNCCMD_USERINFOEXT): // CmdId = 44
				var data mm.UserInfoExt
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				UserInfoExts = append(UserInfoExts, data)
			case int32(mm.SyncCmdID_CmdIdAddMsg): // CmdId = 5
				var data mm.AddMsg
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				AddMsgs = append(AddMsgs, data)
			case 46: // 朋友圈变动
				var data mm.SnsObject
				_ = proto.Unmarshal(v.CmdBuf.Buffer, &data)
				SnsObjectList = append(SnsObjectList, data)
			default:
				UnknownCmdId += fmt.Sprintf("%v;", *v.CmdId)
			}
		}
	}

	return models.ResponseResult{
		Code:    0,
		Success: true,
		Message: "成功",
		Data: Msg.SyncResponse{
			ModUserInfos:    ModUserInfos,
			ModContacts:     ModContacts,
			DelContacts:     DelContacts,
			ModUserImgs:     ModUserImgs,
			FunctionSwitchs: FunctionSwitchs,
			UserInfoExts:    UserInfoExts,
			AddMsgs:         AddMsgs,
			SnsObjectList:   SnsObjectList,
			KeyBuf: mm.SKBuiltinBufferT{
				ILen:   Response.KeyBuf.ILen,
				Buffer: Response.KeyBuf.Buffer,
			},
			UnknownCmdId: UnknownCmdId,
			Remarks:      "出现未解析的CmdId类型数据,请联系客服人员处理。",
		},
	}
}
