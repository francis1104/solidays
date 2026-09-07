# Desk 模型、光照与交互精修（2026-09-07）

## 发现与处理

- 原主体是低面数 kit 模型，运行时又统一覆盖 roughness/metalness/color，
  木材、塑料与金属没有各自的表面特征。现在用 Blender 脚本原创主体与家具，
  保留导出的 PBR 材质、胡桃木与网罩纹理、倒角、加权法线、实体键帽、旋钮和灯罩。
- 原场景没有任何物件投影，仅用几张椭圆渐变贴图假装接地。现在使用冷窗方向光、
  暖色聚光台灯及填充光，物品和便签实际投影。窗光阴影在宽屏为 2048²，小屏为
  1024²；台灯为 1024²。静态 shadow map 缓存，主题/布局改变时刷新；运镜和视频
  不持续重绘阴影。保留 HDR 反射、雾和 reduced-motion 分支，没有新增后处理依赖。
- 原屏幕贴片与模型机身比例不同。新显示器与画面共用 16:9 开口，
  3.54 × 1.99125 world units；视频仍由唯一的 HTMLVideoElement / VideoTexture 驱动。
- 原相框仅有半透明色块，聚焦后另弹 HTML 图片。现在照片真正显示于实体相框中，
  聚焦时只显示标题和切换控制。保持 FNDS 共享 catalog 与当前索引。
  本地 WebGL 不能读取不提供 CORS 的生产原图，因此纹理改走同源私有媒体路由和
  640px card 变体；不会修改生产 CORS 配置，也不同时解码所有原图。
- 新收音机的调谐窗、播放/静音旋钮与上/下一首按键和原生 HTML 控件一一对齐；
  继续复用既有音乐命令。没有复制音乐状态机、聊天后端或 Gallery 数据。
- 两张便签保留原有 portal 和聊天逻辑；纸堆减薄，鼠标与笔避开桌面及手机竖屏
  的纸面区域。移动端便签上下排列，宽屏左右排列。
- 原控制条在手机竖屏可能挤出 Exit，短横屏 CSS 甚至隐藏全部退出入口。
  聚焦后控制条只保留当前物品与 Exit，短横屏在右下角保留独立 Exit。
- 主题切换时同步 toneMappingExposure，修复原先只有 Canvas 创建时设置曝光的问题。

## 资产与维护

生成入口：`scripts/desk/build-visual-variants.mjs` → `build-visual-variants.py` →
`hero_assets.py`。使用本机 Blender 5.2.1，纹理由固定种子的 NumPy 程序生成并嵌入
GLB；新主体没有依赖下载的外部纹理。只有窗外城市沿用本地 CC0 Kenney 素材。

| 主题   |                   Desktop |                  Mobile | 材质 primitives（Desktop / Mobile） |
| ------ | ------------------------: | ----------------------: | ----------------------------------: |
| Studio | 1,670,096 B / 50,572 tris | 734,884 B / 13,624 tris |                             55 / 48 |
| Neon   | 1,453,620 B / 51,835 tris | 477,936 B / 13,756 tris |                             45 / 39 |

按物品合并几何，保留材质槽。移动端减少倒角/圆周段数、叶片，省略字模、部分
线缆与远景；仍采用 1K HDR、DPR 1 和按需渲染。桌面 DPR 上限 1.75，使用 2K HDR。
表中的 bytes 仅含主题 GLB，不含既有便签、HDR、照片、JS 或按需加载的视频/音乐。

交互布局合同继续在 `components/desk/desk-canvas.tsx` 的 `DESK_LAYOUT`：
Studio 桌面 Y=1.81，Neon Y=1.64；相框中心 X=3.15，Z=-4.29。
调整模型必须同步核对近景、透明点击区域、纸面 portal 与原生收音机面板。

## 验证记录

在本地 `worker:dev`（localhost:8787）和真实 Chrome 完成：

- Studio / Neon 完整场景、材质、灯罩、桌面物品摆放与同一 Canvas 内主题切换。
- 相框实体点击、推进、FNDS 换图和退出；新图加载后替换纹理。
- 收音机静音播放、时间推进、换曲及退出；视频开始后音乐 paused=true。
- 视频播放、暂停、随机下一段；退出后 src=null、readyState=0、paused=true。
- 留言历史、草稿编辑、关闭/重开后草稿保留；测试草稿已清空，没有提交留言。
- 390×844 竖屏：相框、收音机、上下便签及可见的 Exit；DOM/Canvas 宽度均 390，
  scrollWidth=390。844×390 横屏：照片控制不挡相框，独立退出按钮可达。
- 浏览器 console 未发现新增应用 error/warning；本地终端检查应用请求。
  构建中的 TypeScript project references 提示为仓库既有配置提示；Wrangler 的
  Scheduled Workers 提示说明本地不自动触发 Cron，不是本次页面错误。
- 12 项 Desk 资源测试、6 项音乐测试、lint；生产 Worker 构建、生产配置门禁与
  Wrangler deploy --dry-run 按仓库提交流程执行。

本会话没有 Chrome DevTools MCP，使用 Computer Use 的 Chrome 浏览器接口、
截图、DOM 与 console 检查；不冒充 MCP 执行记录。手机验证为 Chromium 视口仿真，
未验证 iPhone Safari 的 GPU 内存上限和真机输入法。未部署生产，未上传/删除 R2 对象，
未修改 Worker 绑定或聊天后端。
