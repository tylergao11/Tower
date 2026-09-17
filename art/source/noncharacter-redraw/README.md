# 非人物美术重绘

本批集中绘制素材，没有运行浏览器或验收。保持手绘漫画、粗描边、旧木与暗铁质感；UI 使用哑光旧纸、深褐与炭黑底色，禁用蓝绿底板和强金属反光。

| 源图 | 内容 | 独立导出目录 |
| --- | --- | --- |
| mechanisms.png | 地刺、连弩车、悬毒壶、军需账房、寒风机关、拒马、翻板、破甲钩爪、悬锤、滚木架，共 10 张整图 | art/packed/noncharacter-redraw/mechanisms（无损中间件） |
| parts.png | 上述机关需要运动或装填的 16 个主体部件 | art/packed/noncharacter-redraw/parts（无损中间件） |
| effects.png | 箭矢、毒滴、毒溅、寒风、命中、格挡、扬尘、碎木、碎铁、治疗、维修、钱袋、解救、护盾、破盾、回营，共 16 张 | art/packed/noncharacter-redraw/effects（无损中间件） |
| ui.png | 纸面板、深色卡栏、褐色卡底、气泡、名牌、暂停、声音、铜钱，共 8 张 | assets/game/noncharacter-redraw/ui |

源图保留透明通道，导出裁切见 `art/noncharacter-redraw-assets.json`；导出工具为 `tools/pack-noncharacter-redraw.mjs`。`tools/runtime-art.mjs` 将实际引用的机关和特效从无损裁切合入 `assets/game/atlases/world-*.webp`，不用的整图不占手机加载量；UI 单独按显示尺寸压缩为 WebP。未另画地面或背景拆件。

新 UI 已接入界面样式和场上名牌、气泡；机关活动件、特效与卡牌预览通过 `tools/noncharacter-redraw.mjs` 接入现有资源清单和动画播放器。已执行资源导出与压缩，按用户要求没有运行浏览器、测试或验收。人物素材与人物动作不属于本批修改范围。

## 生成来源

工具：内置 `image_gen.imagegen`。

风格参考：用户提供的《主公快跑》整图、底部卡栏局部与右上章节牌局部。主要约束：无人物、无图格背景、真实透明、哑光材质、大形与粗描边、抑制碎纹和强反光。

| 批次 | 内置生成文件 |
| --- | --- |
| 机关整图 | exec-3dcc0f26-597f-4d05-b82b-16cbf6b12148.png |
| UI 部件 | exec-330b8c97-3963-4674-8bed-8375d62df192.png |
| 特效 | exec-a4d65371-1677-4ce3-81d5-f7a388e5613c.png |
| 机关活动件 | exec-4d73ad96-b360-415c-a290-7352476af1e0.png |

上述原始生成文件位于 `C:/Users/84720/.codex/generated_images/01a0af32-2474-76c3-b93f-23de804d6b49/`，项目内源图是对应文件的原样副本。
