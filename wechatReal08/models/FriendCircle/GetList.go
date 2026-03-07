package FriendCircle

import (
	"fmt"
	"wechatReal08/Algorithm"
	"wechatReal08/Cilent/mm"
	"wechatReal08/comm"
	"wechatReal08/models"

	"github.com/golang/protobuf/proto"
)

type GetListParam struct {
	Wxid         string
	Maxid        uint64
	Fristpagemd5 string
}

func GetList(Data GetListParam) models.ResponseResult {
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

	req := &mm.SnsTimeLineRequest{
		BaseRequest: &mm.BaseRequest{
			SessionKey:    D.Sessionkey,
			Uin:           proto.Uint32(D.Uin),
			DeviceId:      D.Deviceid_byte,
			ClientVersion: proto.Int32(369558056),
			DeviceType:    []byte(D.DeviceType),
			Scene:         proto.Uint32(0),
		},
		FirstPageMd5:    proto.String(Data.Fristpagemd5),
		MaxId:           proto.Uint64(Data.Maxid),
		MinFilterId:     proto.Uint64(0),
		LastRequestTime: proto.Uint32(0),
		ClientLatestId:  proto.Uint64(0),
		NetworkType:     proto.Int32(1),
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
		Cgiurl: "/cgi-bin/micromsg-bin/mmsnstimeline",
		Proxy:  D.Proxy,
		PackData: Algorithm.PackData{
			Reqdata:          reqdata,
			Cgi:              683,
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
	Response := mm.SnsTimeLineResponse{}
	err = proto.Unmarshal(protobufdata, &Response)
	if err != nil {
		return models.ResponseResult{
			Code:    -8,
			Success: false,
			Message: fmt.Sprintf("反序列化失败：%v", err.Error()),
			Data:    nil,
		}
	}

	// 时间线返回的 Session 可作为后续 mmsnssync 的 key 使用
	if Response.Session != nil && len(Response.Session.Buffer) > 0 {
		D.SnsSyncKey = Response.Session.Buffer
		_ = comm.CreateLoginData(D, D.Wxid, 0, nil)
	}

	return models.ResponseResult{
		Code:    0,
		Success: true,
		Message: "成功",
		Data:    Response,
	}
}

func hexPreview(b []byte, n int) string {
	if len(b) == 0 {
		return ""
	}
	if n <= 0 {
		return ""
	}
	if len(b) > n {
		return fmt.Sprintf("%x...(truncated)", b[:n])
	}
	return fmt.Sprintf("%x", b)
}
