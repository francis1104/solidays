# Desk 3D 素材目录

整理日期：2026-09-03。旧桌面模型保留为历史素材；当前 `/desk` 使用两套由 Kenney
CC0 源包统一编排的低模视觉包，以及原有两张可交互便签。

## 当前网页使用的双版本资源

| 版本     | 模型来源                                                                     | 视觉用途                                                     |                桌面产物 |                移动产物 |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------: | ----------------------: |
| Studio   | [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)               | 开放桌架、电脑、收音设备、照片显示器、灯、音箱、书架、植物、座椅 | 约 388 KiB / 8,269 tris | 约 227 KiB / 3,857 tris |
| Neon     | [Kenney Space Station Kit](https://kenney.nl/assets/space-station-kit)       | 工作台、宽屏电脑、收音终端、照片终端、控制台、容器、座椅        | 约 289 KiB / 5,275 tris | 约 180 KiB / 2,693 tris |
| 两者远景 | [Kenney City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) | 窗外低模城市剪影                                             |          已并入主题 GLB |             只保留 5 栋 |

上述页面标注均为 Kenney 官方页面声明的 CC0 资产。源 ZIP 与解包文件位于
`assets/3d/packs/kenney/`，该目录被 Git 忽略；网页不会远程加载第三方模型，也不会在
运行时解析 FBX。`scripts/desk/build-visual-variants.py` 是选择、定位、命名和导出的唯一
清单，`build-visual-variants.mjs` 负责安全调用 Blender。

主物件并非直接使用源包的原始硬边灰模。Blender 打包阶段只对桌面、屏幕、键盘、收音
设备、照片终端、灯和音箱增加 1～2 段小倒角；Studio 额外生成桌垫、金属前缘和独立
键帽，Neon 额外生成控制台与双色状态键。背景建筑仍保留原始低面数。页面保留 Neon
源模型的颜色图集，并按木材、深色金属、亮金属分别处理 Studio 材质，不再把一件物品
内的所有材质压成同一种颜色。

## 目录与使用规则

```text
assets/3d/                              # 本地素材库，现有 .gitignore 已忽略
├── README.md
├── models/
│   ├── desks/computer-desk/            # 一整套桌椅/电脑场景
│   │   ├── source/ComputerDesk.fbx
│   │   ├── textures/                  # 原套装贴图，不拆散
│   │   ├── processed/                 # 桌子、电脑键盘提取版及 Blender 文件
│   │   ├── process_desk_only.py
│   │   └── archive/from-public/        # 原 public/desk 的重复导出
│   ├── computers/
│   │   ├── pc-mingtu/
│   │   │   ├── source/PC+MODEL+MINGTU.fbx
│   │   │   └── archive/               # 旧合并版与 from-public 副本
│   │   ├── pc-alternative/source/PC.glb
│   │   └── gaming-desktop-pc/         # 新电脑整包，保留 FBX 与配套纹理
│   ├── radios/vintage-radio/source/vintage_radio.glb
│   ├── notes/sticky-notes/            # 四款便签组合包；原 ZIP/纹理不拆散
│   │   └── source/unpacked/           # 解包的 blend / FBX / OBJ / MTL / 纹理
│   ├── frames/picture-frame/source/picture_frame.glb
│   ├── lamps/desk-lamp/source/desk_lamp_low_poly.glb
│   ├── environments/night-room-shell/
│   │   ├── source/modkit/              # CC0 ModKit 原始窗墙/地面/顶板
│   │   └── processed/                  # Blender CLI 标准化网页模型
│   └── cups/
│       ├── coffee-cup/source/coffee_cup.glb
│       ├── cup-with-holder/source/cup_with_holder.glb
│       └── mcdonalds-cup/source/mcdonalds_cup.glb
├── environments/kloofendal-overcast/
│   ├── source/kloofendal_overcast_puresky_4k.hdr
│   └── archive/from-public/            # 原 public/desk 的 4K 副本
└── archive/2026-08-30-directory-metadata/ # 原日期目录的 Finder 元数据

public/desk/                           # 仅当前实际使用的网页资产，进入 Git
├── models/
│   ├── variants/
│   │   ├── desk-studio.glb
│   │   ├── desk-studio-mobile.glb
│   │   ├── desk-neon.glb
│   │   └── desk-neon-mobile.glb
│   ├── desk-web.glb
│   ├── pc-mingtu.glb
│   ├── mcdonalds-cup.glb
│   ├── vintage-radio.glb
│   ├── note-pad.glb
│   ├── note-paper.glb
│   ├── room-wall-window.glb
│   ├── room-wall-straight.glb
│   ├── room-floor.glb
│   ├── room-ceiling.glb
│   └── desk-lamp.glb
├── kloofendal-overcast-1k.hdr
└── kloofendal-overcast-2k.hdr
```

- 一款素材一个目录；保留原下载文件名，外层文件夹负责分类。
- `source/` 是原件；`processed/` 是离线提取/预览版本；`archive/` 是旧导出或副本。
- 组合模型及配套贴图整包保存，不能按贴图文件数量当成多个模型。
- 本地素材库不进入 Git；仓库保留清单、处理脚本和网页实际使用的产物。
  新 checkout 如需重新处理模型，要先恢复本地素材库备份。
- 新模型接入页面前按[Blender CLI 流程](./desktop-world-plan.md#资产处理约定)
  处理，再复制经过验证的最终产物到 `public/desk/models/`。不能用 `archive/` 覆盖当前网页版本。
- `desk-web.glb`、`pc-mingtu*.glb`、麦当劳杯、旧收音机和旧 Room Shell 目前属于历史网页
  产物，不再由 `/desk` 请求；在完成一次 DEV/生产回滚窗口前暂不删除。

## 现在有哪些

| 类别   | 素材                                                                         | 状态 / 区别                                                                          |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 桌子   | `desks/computer-desk/source/ComputerDesk.fbx`                                | 1 套组合源模型，附原始贴图；网页使用其中提取并降采样后的桌子                         |
| 电脑   | `computers/pc-mingtu/source/PC+MODEL+MINGTU.fbx`                             | 当前曲面显示器 + 键盘的源模型；最终网页版保留前移位置及内屏 UV 修复                  |
| 电脑   | `computers/pc-mingtu/processed/pc-mingtu-mobile.glb`                         | 手机专用 LOD；移除高密度键帽字标，约 58,876 三角形，保留曲面屏与键盘主体             |
| 电脑   | `computers/pc-alternative/source/PC.glb`                                     | 另一款独立电脑候选，约 9.61 MiB；不是 MINGTU；文件内作者字段为 Elixon Avila          |
| 电脑   | `desks/computer-desk/processed/computer-keyboard.glb`                        | 从桌子套装提取的电脑/键盘，约 1.63 MiB；不是另一次下载的独立套装，未使用             |
| 杯子   | `cups/coffee-cup/source/coffee_cup.glb`                                      | 新候选：约 1.69 MiB，1 个 mesh、3 张内嵌图片                                         |
| 杯子   | `cups/cup-with-holder/source/cup_with_holder.glb`                            | 新候选：约 4.79 MiB，2 个 mesh、7 张内嵌图片；两个 mesh 属于同一文件，不计为两次下载 |
| 杯子   | `cups/mcdonalds-cup/source/mcdonalds_cup.glb`                                | 已选用：原件约 1.51 MiB，1 个 mesh、2 张内嵌图片；经 Blender 归一化后替换场景灰模杯  |
| 环境   | `environments/kloofendal-overcast/source/kloofendal_overcast_puresky_4k.hdr` | 1 个环境原件；网页手机用 1K、桌面用 2K，不是三个不同环境                             |
| 房间   | `models/environments/night-room-shell/source/modkit/`                        | GitHub ModKit v1.2 的 CC0 模块；只取窗墙、直墙、地板、顶板，未带入整套工业道具       |
| 房间   | `models/environments/night-room-shell/processed/room-*.glb`                  | 已由 Blender CLI 归一化的低模 Room Shell；页面按受控镜头铺开，约 2.3k 三角形         |
| 收音机 | `radios/vintage-radio/source/vintage_radio.glb`                              | 已选用：木质复古收音机，1,894 三角形，1K 内嵌纹理；网页约 1.99 MiB                   |
| 便签   | `notes/sticky-notes/source/unpacked/post_it.fbx`                             | 组合包有四款（五个 mesh），只选 `SINGLE` 平放便签本和 `single` 单张纸；不是放四张    |
| 相框   | `frames/picture-frame/source/picture_frame.glb`                              | 新候选，仅入库；尚未替换场景相框                                                     |
| 台灯   | `lamps/desk-lamp/source/desk_lamp_low_poly.glb`                              | 已选用：低模台灯源；网页版通过 Blender CLI 缩放至约 2.19 高、256px 纹理              |
| 电脑   | `computers/gaming-desktop-pc/`                                               | 新候选，保留整个下载包；未替换 MINGTU                                                |

三个杯子先前只复制入库；本轮按用户要求清理 Downloads，详见下节。GLB 都自包含，未发现
外部图片/buffer URI。素材库原文件不变；麦当劳款经 Blender 离线缩放、归一化后接入网页，
另两款仍为候选。没有减面、改画贴图或 R2 上传。
原始下载链接与授权信息暂未提供，正式使用前需补齐来源/许可，不能仅凭 GLB 推断授权。
桌子套装原贴图也包含杯子等物品，仍随整包保存，不算这次新增的三个杯子。

### 本轮下载清理与来源

- 本轮核对 8 个 Downloads 顶层条目，共 54 个文件：三个杯子、收音机、相框、台灯、
  `gaming-desktop-pc` 文件夹和 `sticky-notes` 文件夹。
- 全部复制/确认项目内已有同内容文件，并逐文件 SHA-256 一致后，才将 Downloads
  原条目移动到 `/Users/francis/.Trash/solidays-model-downloads-20260830`。
  下载目录不再保留这些副本；可以从废纸篓恢复。未清理其他下载文件或项目原始素材。
- 收音机 GLB 内声明：[Loïc / Vintage radio](https://sketchfab.com/3d-models/vintage-radio-e2b64f5031fa45e8be661a89baeae3f0)，
  CC BY 4.0；收音机聚焦时页面保留作者和来源链接。本项目做了尺寸归一化与交互覆盖。
- 相框 GLB 声明：[Oneironauticus / Picture frame](https://sketchfab.com/3d-models/picture-frame-01006278a27e402c9ccf5a69358c3add)，CC BY 4.0。
- 台灯 GLB 声明：[KozlovMaksim / Desk Lamp Low Poly](https://sketchfab.com/3d-models/desk-lamp-low-poly-0dded6b36c464294a0ab966b18109f6d)，CC BY 4.0。
- 便签与新电脑包未提供可核实的原始下载页/许可；保留为待补信息，不能宣称已核验授权。
  本轮仅 DEV 接入，未发布生产、未上传 R2。

### 2026-08-31 环境资源

- Room Shell 原始资源：[JaronKBragg7337/asset-pack-ue-threejs-blender-unity](https://github.com/JaronKBragg7337/asset-pack-ue-threejs-blender-unity)，
  使用 v1.2 发布包直接下载；仓库与随包许可证声明为 CC0。
- 本轮仅取 `Wall_Window`、`Wall_Straight`、`Floor`、`Ceiling` 四个无贴图模块，归类到
  `models/environments/night-room-shell/source/modkit/`，并重命名为语义化的处理产物；
  通过 `scripts/desk/process-model.mjs` 统一导出，自包含产物进入 `public/desk/models/`。
- 网页中的窗外夜景不是额外远程图片，而是一个 512×320 的本地 CanvasTexture：固定星点、低层建筑
  和暖色窗光，避免增加网络请求与版权不明的图片依赖。
- 台灯网页产物 `desk-lamp.glb` 使用 `--scale 0.05 --max-texture-size 256`，从约 4.1 MiB
  压到约 655 KiB；台灯的原始来源与 CC BY 4.0 信息见上方链接。
- MINGTU 手机 LOD 使用同一 Blender CLI，从源 FBX 排除 `Letters` 网格后导出为
  `pc-mingtu-mobile.glb`；完整桌面版仍保留原始网格。页面按 coarse pointer/窄屏在加载阶段选择
  手机产物，不在浏览器运行时隐藏网格或改写坐标。

## 重复文件和旧版

整理前用 SHA-256 核对，以下文件内容完全相同。为保留备份，本次只迁移归档，不删除：

| 原副本（已移出 public）                  | 现在的归档位置（相对 assets/3d）                                                  | 对应主文件                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `public/desk/pc-mingtu.fbx`              | `models/computers/pc-mingtu/archive/from-public/pc-mingtu.fbx`                    | 同目录树 `source/PC+MODEL+MINGTU.fbx`                |
| `public/desk/pc-mingtu.glb`              | `models/computers/pc-mingtu/archive/from-public/pc-mingtu.glb`                    | 同目录树 `archive/pc-mingtu.glb`，旧的单网格合并版   |
| `public/desk/desk-only.glb`              | `models/desks/computer-desk/archive/from-public/desk-only.glb`                    | 同目录树 `processed/desk-only.glb`，未降采样的桌子   |
| `public/desk/kloofendal-overcast-4k.hdr` | `environments/kloofendal-overcast/archive/from-public/kloofendal-overcast-4k.hdr` | 同目录树 `source/kloofendal_overcast_puresky_4k.hdr` |

`public/desk/pc.glb` 则是**不同内容**的历史导出，9 个 mesh，与 MINGTU 结构相符；
已单独保存在 `models/computers/pc-mingtu/archive/from-public/pc.glb`。
它既不是另一款 `PC.glb` 的重复文件，也不是当前修复后的 `public/desk/models/pc-mingtu.glb`。
处理参数未确认，不把它当成可复用的最新产物。

前一轮原有四个网页资产的路径和文件内容均不变，另外新增 `models/mcdonalds-cup.glb`。
原 `public/desk/` 中未被页面引用的
五个文件已移入本地素材库，避免混淆版本或随站点公开发布。

## 处理路径

- 曲面电脑：使用方案中的 `desk:process-model` 命令，源路径已更新为分类目录，
  `--part-offset` 与 `--screen-uv` 参数保持不变。
- 桌子提取：`models/desks/computer-desk/process_desk_only.py` 的默认路径相对于自身目录，
  不再写死机器绝对路径或下载日期。
- 网页桌子与 HDR：`scripts/desk/prepare-scene-assets.py` 从新的本地分类目录读入，
  输出仍是桌子与两档 HDR，不改变 URL。
- 麦当劳杯：同一 `desk:process-model` 流程，`--scale 0.168`；输出底部中心为原点、
  约 0.795 × 1.0 × 0.795 的 GLB，完整命令记录在方案中。前端沿用原杯子落点，
  新模型参与加载进度与统一资源释放，不在运行时修正单位。
- `.blend` 及 `.blend1` 预览文件和贴图一起保留；两份的图片均已内嵌，无链接库。
- 收音机：`--scale 1.12 --max-texture-size 1024`，宽 2.24 × 高 1.179 × 深 1.089；
  便签分别 `--only-mesh SINGLE` / `--only-mesh single`，均 `--scale 0.72 --max-texture-size 512`。
  两份便签产物各约 0.35 MiB，底部中心原点；完整命令见方案。
- Blender 导出有多 image node 共享 sampler 的提示；产物 sampler 均为 LINEAR /
  LINEAR_MIPMAP_LINEAR，实际纹理已目检。该提示不等于贴图丢失。

## 本轮验证记录

- 本地 Worker + 内置浏览器，实际 viewport：1280 × 720、478 × 863。
  桌面两张纸并排、竖屏前后排列；收音机控制位于机身，未弹出播放器。
- 收音机静音状态下验证播放/暂停、四首曲目循环；音频 metadata 显示 `5:42`，
  控件点击后透视 wrapper 的 `scrollTop` 始终为 0。
- 纸面输入、关闭重开草稿保留、提交 201 且显示一次、历史分页通过。
  离开 Desk 后普通聊天仍保留草稿/历史；Canvas、audio 和纸面 host 均已卸载。
- 新资源与释放测试 9 项通过；`test:chat-realtime` 39 项通过；lint、Next/OpenNext
  build、生产配置门禁及 Wrangler dry-run 通过。没有生产部署或远程 D1 写入。
- `--only-mesh does-not-exist` 实测返回非零退出码且不生成 GLB。
- 浏览器无新 Error/Warning；卸载时 Three.js 的 `Context Lost` 是正常 renderer
  disposal 日志。终端仍有原有 Node module type、Next TS project references、
  本地 Cron 不自动触发的提示，不通过改动业务配置掩盖这些提示。
- 尚未进行真实 iPhone Safari / 微信软键盘验证；浏览器竖屏不等于真机验收。
