// @APIVersion
// @Title Wechat 08- 算法  ---  五端扫码版（ipad、安卓pad、win、mac、car、62 iphone、a16 安卓）
// @Description 可开启自动心跳 - 自动二次登录 - 长连接心跳  （新上线账号尽量 ipad、安卓 pad 加好友发圈。IOS 参数比较全）
package routers

import (
	"wechatReal08/controllers"

	"github.com/astaxie/beego"
	"github.com/astaxie/beego/plugins/cors"
)

func init() {
	beego.InsertFilter("*", beego.BeforeRouter, cors.Allow(&cors.Options{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Authorization", "Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length", "Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Content-Type"},
		AllowCredentials: true,
	}))

	ns := beego.NewNamespace("/api",
		beego.NSNamespace("/Login",
			beego.NSInclude(
				&controllers.LoginController{},
			),
		),
		beego.NSNamespace("/Msg",
			beego.NSInclude(
				&controllers.MsgController{},
			),
		),
		beego.NSNamespace("/Friend",
			beego.NSInclude(
				&controllers.FriendController{},
			),
		),
		beego.NSNamespace("/Finder",
			beego.NSInclude(
				&controllers.FinderController{},
			),
		),
		beego.NSNamespace("/FriendCircle",
			beego.NSInclude(
				&controllers.FriendCircleController{},
			),
		),
		beego.NSNamespace("/Favor",
			beego.NSInclude(
				&controllers.FavorController{},
			),
		),
		beego.NSNamespace("/Group",
			beego.NSInclude(
				&controllers.GroupController{},
			),
		),
		beego.NSNamespace("/Label",
			beego.NSInclude(
				&controllers.LabelController{},
			),
		),
		beego.NSNamespace("/User",
			beego.NSInclude(
				&controllers.UserController{},
			),
		),
		beego.NSNamespace("/Wxapp",
			beego.NSInclude(
				&controllers.WxappController{},
			),
		),
		beego.NSNamespace("/QWContact",
			beego.NSInclude(
				&controllers.QWContactController{},
			),
		),
		beego.NSNamespace("/OfficialAccounts",
			beego.NSInclude(
				&controllers.OfficialAccountsController{},
			),
		),
		beego.NSNamespace("/SayHello",
			beego.NSInclude(
				&controllers.SayHelloController{},
			),
		),
		beego.NSNamespace("/Tools",
			beego.NSInclude(
				&controllers.ToolsController{},
			),
		),
		beego.NSNamespace("/TenPay",
			beego.NSInclude(
				&controllers.TenPayController{},
			),
		),
	)
	beego.AddNamespace(ns)
}
