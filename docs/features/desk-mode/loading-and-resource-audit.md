# Desk 加载与资源审查（2026-08-30）

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

| 资产 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 桌子 GLB | 12,300,340 B | 1,045,324 B |
| 电脑 GLB | 3,793,860 B | 3,794,192 B |
| 环境 HDR | 16,953,534 B / 4K | 手机 1,182,382 B / 1K；桌面 4,288,238 B / 2K |

桌子网格仍为 754 三角形，未改变形状；输入/输出 sampler 相同。Blender 导出时的
“多个 image node 共用 sampler”提示来自导入的 metallic/roughness 打包纹理，
核对前后均为 magFilter=9729、minFilter=9987，没有额外纹理或采样模式变化。

电脑约 82,748 三角形，尚未做有损减面。模型+环境传输仍约手机 6.0 MB、桌面
9.1 MB，不含 JS/poster；**仍未达到原方案 2.5/4 MB 的目标**。
后续可在保持键帽/曲面屏细节的前提下制作手机 LOD，以及评估 mesh/texture 压缩；
本轮不新加解码器或改变模型形状。

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

参考：[Three.js 资源释放](https://threejs.org/manual/en/how-to-dispose-of-objects.html)。
