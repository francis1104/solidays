# Desk 3D 素材目录

整理日期：2026-08-30。桌面已使用麦当劳纸杯；本轮继续入库新下载的模型，
将收音机和两张便签接入场景，其余新下载模型只作为候选。

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
│   ├── desk-web.glb
│   ├── pc-mingtu.glb
│   ├── mcdonalds-cup.glb
│   ├── vintage-radio.glb
│   ├── note-pad.glb
│   └── note-paper.glb
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

## 现在有哪些

| 类别   | 素材                                                                         | 状态 / 区别                                                                          |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 桌子   | `desks/computer-desk/source/ComputerDesk.fbx`                                | 1 套组合源模型，附原始贴图；网页使用其中提取并降采样后的桌子                         |
| 电脑   | `computers/pc-mingtu/source/PC+MODEL+MINGTU.fbx`                             | 当前曲面显示器 + 键盘的源模型；最终网页版保留前移位置及内屏 UV 修复                  |
| 电脑   | `computers/pc-alternative/source/PC.glb`                                     | 另一款独立电脑候选，约 9.61 MiB；不是 MINGTU；文件内作者字段为 Elixon Avila          |
| 电脑   | `desks/computer-desk/processed/computer-keyboard.glb`                        | 从桌子套装提取的电脑/键盘，约 1.63 MiB；不是另一次下载的独立套装，未使用             |
| 杯子   | `cups/coffee-cup/source/coffee_cup.glb`                                      | 新候选：约 1.69 MiB，1 个 mesh、3 张内嵌图片                                         |
| 杯子   | `cups/cup-with-holder/source/cup_with_holder.glb`                            | 新候选：约 4.79 MiB，2 个 mesh、7 张内嵌图片；两个 mesh 属于同一文件，不计为两次下载 |
| 杯子   | `cups/mcdonalds-cup/source/mcdonalds_cup.glb`                                | 已选用：原件约 1.51 MiB，1 个 mesh、2 张内嵌图片；经 Blender 归一化后替换场景灰模杯  |
| 环境   | `environments/kloofendal-overcast/source/kloofendal_overcast_puresky_4k.hdr` | 1 个环境原件；网页手机用 1K、桌面用 2K，不是三个不同环境                             |
| 收音机 | `radios/vintage-radio/source/vintage_radio.glb`                              | 已选用：木质复古收音机，1,894 三角形，1K 内嵌纹理；网页约 1.99 MiB                   |
| 便签   | `notes/sticky-notes/source/unpacked/post_it.fbx`                             | 组合包有四款（五个 mesh），只选 `SINGLE` 平放便签本和 `single` 单张纸；不是放四张    |
| 相框   | `frames/picture-frame/source/picture_frame.glb`                              | 新候选，仅入库；尚未替换场景相框                                                     |
| 台灯   | `lamps/desk-lamp/source/desk_lamp_low_poly.glb`                              | 新候选，仅入库；未加入场景                                                           |
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
