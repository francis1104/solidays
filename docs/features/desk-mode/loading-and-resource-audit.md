# Desk 加载与资源审查（2026-08-31）

## 用户报告

- 页面已进入 Overview，桌子/环境仍要等一会儿才出现。
- iPhone 曾提示页面发生问题并重新加载。
- Overview 显示器为灰色；键盘像覆盖灰白膜。

## 已确认原因

1. `Canvas.onCreated` 仅说明渲染器创建完成，却被当作全部场景 ready。
   环境、桌子分别在 Suspense 下继续加载，造成半成品先出现。
2. `VideoTexture` 随 `videoReady` 变化创建，仅 material 被 dispose，纹理及其
   `requestVideoFrameCallback` 未释放。原安装版本 Three.js 的 dispose 会取消该回调。
3. 原模型/HDR 约 33.0 MB（十进制）；移动端也用了 DPR 1.5、4K HDR。
   压缩传输体积不等于解码/GPU 内存，4K half-float RGBA 环境本体约 64 MiB，
   还不包括 PMREM、帧缓冲、视频解码等。
4. MINGTU FBX 的 Corona 程序化 diffuse 颜色连接被 Blender importer 忽略。
   GLB 中黑键/红键 base color 退化为默认白色，没有对应待下载的 PNG。
5. 暂停视频按钮实际仍调用 play；收音机 effect 依赖间接包含播放状态的 callback，
   导致播放状态变化时重新 load，并可能留下等待 canplay 的 listener。

不能仅凭 iPhone 重载提示断言具体 crash 原因。上述泄漏路径和负载风险已修正，
但未取得该手机的 Safari/WebContent crash log，真机稳定性仍须复测。

## 实现

- 同时加载桌子、电脑、环境与当前随机 poster。百分比按资源阶段加权，非伪造计时器；
  到 95% 后等待 shader 编译和已提交场景的一次渲染，再揭开遮罩。
- 资源独立归当前 Desk 实例所有，退出统一释放 geometry/material/texture，
  中途退出后的迟到结果也会释放。Three FileLoader 会跨加载器合并相同 URL 的
  in-flight 请求，因此不 abort 可能被下一次挂载共用的请求；传输可能短暂继续，
  但结果不会回写已退出的页面，也不会进入永久缓存。
- Overview 使用 Gallery 现有的 768px poster；不创建 82 张纹理缓存，不预载 MP4。
- 视频按点击加载；退出电脑清空 src 并 load() 释放解码器，保留 clip ID。
  每次视频纹理切换都 dispose；下一张不再留下 canplay listener。页面隐藏暂停视频。
- 手机/coarse pointer 固定 DPR 1、关闭 MSAA，采用 1K HDR；桌面采用 2K HDR。
- 原始文件不动，通过 Blender 导出网页资产；键盘恢复源 FBX 直接 CoronaColor 的
  diffuse 常量，不在 React 中根据材质名猜颜色，不宣称支持任意 Corona shader。
- 收音机播放状态不再触发音源 reload，移除待触发 listener 时与注册成对。

## 资产实测

| 资产     |            修改前 |                                       修改后 |
| -------- | ----------------: | -------------------------------------------: |
| 桌子 GLB |      12,300,340 B |                                  1,045,324 B |
| 电脑 GLB |       3,793,860 B |       桌面 3,794,192 B；手机 LOD 2,176,900 B |
| 环境 HDR | 16,953,534 B / 4K | 手机 1,182,382 B / 1K；桌面 4,288,238 B / 2K |

桌子网格仍为 754 三角形，未改变形状；输入/输出 sampler 相同。Blender 导出时的
“多个 image node 共用 sampler”提示来自导入的 metallic/roughness 打包纹理，
核对前后均为 magFilter=9729、minFilter=9987，没有额外纹理或采样模式变化。

桌面电脑约 82,748 三角形；手机使用去除 `Letters` 键帽字标后的专用 LOD，约 58,876
三角形、2,176,900 B，保留曲面屏、键盘主体和颜色材质。模型+环境传输约手机 4.5 MB、
桌面 9.1 MB，不含 JS/poster；手机路径已明显降低原电脑的解码与网格开销，但仍未达到
原方案 2.5/4 MB 的整体目标。后续若继续压缩，应优先评估纹理/mesh compression，
不要在浏览器运行时隐藏网格或临时改坐标。

本次构建的 Desk Canvas 动态 chunks 合计约 250 KB gzip（不含全站公共 JS），
仍在 300 KB 的 Desk 专属 JS 预算内。

## 回归验证

- `node --experimental-strip-types --test components/desk/desk-assets.test.ts`：
  等待全部资源、中途退出后的迟到释放、共享资源只释放一次、30 次视频纹理
  创建/销毁无残余 frame callback、键盘颜色与曲面屏保留、网页资产尺寸上限。
  共 5 项通过，另有 `test:music` 回归检查。
- 本地 Worker + 内置浏览器：实际观察加载百分比/Overview 完整场景，随机 poster、
  键盘颜色、视频播放/暂停/下一条/退出/重进；退出后 video 的 src=null、readyState=0。
- Console 无本站新增 error/warning。无 Chrome DevTools MCP，因此不冒充 Chrome
  DevTools 或真机验证；内置浏览器不能模拟 WebKit 内存上限。
- lint、Next build、Worker build 和生产配置 dry-run 按提交门禁执行。
  Next 现有 project references 提示与 Node strip-types 的 module-type 提示不来自浏览器。
  路由退出后出现普通 log `THREE.WebGLRenderer: Context Lost.`，对应 Canvas 主动释放
  上下文；退出后 DOM 中 Canvas/video 均为 0，并非测试中发生的意外 context loss。

没有部署生产、修改远程 R2 对象、引入依赖或修改聊天后端。

## Room Shell 构图与运镜复测（2026-08-31）

截图中的模型展台感来自实际几何关系：墙底没有接到桌脚地面、顶板/地板边缘在
Overview 内、窗洞被显示器挡住，台灯底座又落在右侧便签上。现在统一地面线，
补墙并扩展边界，抬高窗户、后移台灯，降低 Overview 俯视程度及全局填充光。
仅复用墙体资源和新增 128×128 接地阴影纹理，没有新增模型下载或实时阴影。

相机原有 Bézier 轨迹仍在，渲染模式原先只由 `videoPlaying` 决定；现在明确把
`entering`/`leaving` 纳入连续帧条件，停止后恢复按需渲染。未获得用户当次浏览器的
trace，因此不把 demand 模式断言为所有“运镜消失”的唯一原因，也不删除 reduced-motion
的直接定位分支。

本地 Worker + 隔离 Chrome（Apple M1 Pro / Metal，全程静音）实际验证：

- 1440×900：直接点击电脑、收音机、相框、便签网格；每次推进约 1.3 秒，
  采集到 76–77 个不同相机位置；四次退出约 1.1 秒，各 64 个不同位置。
- 1280×608：复核 Overview 墙/地板接合、窗户可见、台灯与便签分离。
- 390×844 Chromium 仿真：手机 LOD 与 1K HDR 请求成功，无页面横向滚动；
  电脑推进约 1.1 秒、64 个不同位置。不是 iPhone Safari 真机验证。
  原有底部横向滚动控制条在 focused 时会把 Exit 挤到右侧可视范围外；直接点其
  未滚入的中心坐标未生效，不计作移动端退出验证通过。本次桌面修复未改该控制条。
- 模拟 reduced motion 后重载：点击收音机直接定位，不滞留 entering。
- 四个物品往返后 geometry/texture 数仍为 93/27；电脑退出后 video
  `src=null`、`paused=true`、`readyState=0`，静止为 `demand`。
- 11 项资源回归测试通过。浏览器操作与 Worker 请求中未发现新增应用异常。
  Chrome DevTools MCP 本会话未提供，以上通过独立 Chrome 的 CDP 实测，并非 MCP。

参考：[Three.js 资源释放](https://threejs.org/manual/en/how-to-dispose-of-objects.html)。
