# 新野

手机横屏微信 H5 单关游戏，使用 Phaser、TypeScript 和 Vite。

- 玩法策划：`游戏策划案.md`。
- 运行数值、卡牌与波次：`src/config.ts`。
- 战斗逻辑：`src/game/Battle.ts`。
- 美术清单、分层与序列动画：`assets/game/asset-manifest.json`。
- 资源加载与进度条：`src/loading.ts`。
- 开场：`src/render/Opening.ts`；战场对位：`src/render/layout.ts`。

开发入口为 `npm run dev`，端口为 5188。构建命令为 `npm run build`，输出目录为 `dist`；只打包当前资源清单引用的正式素材。

机关和守军从卡栏按住拖放，按住时显示合法位置，松手后关闭。场上守军可拖动调整本层驻守点；钱袋需要点击收取。

最新拖放、手动收取军饷、楼梯转向与点击隔离修改已写入源码。按用户要求停止测试，尚未编译或运行验证；现有 `dist` 仍为此前构建。

角色骨骼与动作在 `tools/character-art.mjs` 统一编排，机关与场景动作在 `tools/configure-art.mjs` 编排；构建会自动生成运行清单。游戏、卡牌和美术预览共用 `art/runtime/art-player.js`，不要在各入口复制采样逻辑。

美术拼装预览：`npm run art:preview`，打开 `http://127.0.0.1:8766/`。修改动作后运行 `npm run art:configure`；更换原始素材后运行 `npm run art:build`。分件保留原始比例，换姿势同时切换对应的尺寸与枢轴，父骨骼统一带动子部件；盾牌可见性由清单的 `shieldSlots` 声明。

每个具体分件的接缝、手心与握柄点记录在 `art/character-joints.json`，坐标相对于该分件裁切后的宽高归一化；不同姿势不能共用默认枢轴。左右手由角色的 `hands` 映射声明，与绘制前后层级分开。武器跟随对应手心，双手武器的另一只手通过清单约束跟随支撑握点。刘备躯干已经绘有上袖，分离手臂连接的是各姿势对应的袖口。

刘备单腿素材为内置图像生成工具生成，原图在 `art/source/L01/liubei-legs-v2.png`，提示词及来源记录在 `art/generation-records.json`。
