# 默认字体

客户端正文优先使用 Arial 西文字体和 Windows 微软雅黑中文字体，字重为常规 400；基本信息、道具栏等窗口标题仅保留 500 的轻度强调。字体顺序为 `Arial, 'Microsoft YaHei', 'MiSans', 'Source Han Sans CN', sans-serif`，本地 MiSans Regular（400）、Medium（500）和 Bold（700）提供跨平台后备。MiSans 文件来自[小米官方下载](https://hyperos.mi.com/font/zh/download/)，使用官方 WOFF2，未转换、裁剪或修改字形。字体声明及许可随客户端一起打包在 `fonts/`。

启动时等待本地三个字重加载完成再初始化原生 UI，加载失败时仍可使用系统或其他后备字体。基本信息正文按参考原版使用 12px 常规字重，保留原生窗口尺寸和状态条；其他原生窗口保留 RO 的字号和尺寸。取消旧的 `font-size-adjust: 0.5186`；该设置会把原先标称 12px 的思源字体缩小至约 11.46px。旧客户端字体加载函数不再重复注册相同字重。聊天字号调节和对话气泡的高 DPI 绘制保持原有逻辑。

官方字体 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| MiSans-Regular.woff2 | d704c1a932c0bd7e8a071d276cd81c0ed0c9fecfa26ac234f4bed0559fe1cb2d |
| MiSans-Medium.woff2 | 44e28ca6c2f0ca79829f192831ef87b5eec7c464f5cfb7a83467f57bb6e58114 |
| MiSans-Bold.woff2 | 1c5a7515b61bc82baaa2e2c2fdae2032479fb9a99e09d4d021dc17314fc5939b |
