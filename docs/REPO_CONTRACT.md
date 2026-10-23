# SKYFORGE 仓库契约

> 适用对象：在本仓库工作的所有智能体（任何模型、任何会话）。
> 目的：多个智能体并行工作时保持一致，防止概念增殖和过度抽象，防止互相覆盖。
> 生效：2026-10-22。本契约只能由用户修改或批准修改（见 §9）。

**优先级**：用户在对话中的明确指令 > 本契约 > 各功能文档 / 交接文档（`docs/*.md`）> 智能体自己的习惯。
发现本契约和用户指令冲突时，以用户为准，并在回复里指出冲突点。发现本契约和代码现状不符时，不要自行"修正"任一方，报告给用户。

---

## 1. 架构不变量（不得破坏）

| # | 不变量 |
|---|---|
| A1 | **分层**：`src/data/` 只放数据和纯函数 → `src/sim/` 读数据做仿真 → `src/visual/` 只读仿真状态做显示 → `src/core/Game.js` 编排。`src/ui/Screens.js` 只通过回调（`callbacks.onXxx`）请求状态变化，不直接改仿真。 |
| A2 | 飞行仿真（`Atmosphere`、`Aerodynamics`、`ControlSystem`、`FlightModel`、`Aircraft`、`AIPilot`、`math`）不依赖 DOM、canvas、WebGL 场景，必须能在纯 Node 下运行（`tests/*.test.mjs` 依赖这一点）。允许使用 Three.js 的数学类型（向量、四元数）。**已知例外**：`CombatSystem.js` 会创建曳光弹、导弹网格和 canvas 贴图，这是遗留混合，不得扩大，也不得照着它在别的仿真模块里加显示代码。 |
| A3 | **飞机差异写在配置里**：飞行模型、飞控、HUD 对所有机型共用；机型差异写在 `AIRCRAFT_TYPES` 的配置字段里，不写成共享代码里的新分支（例外见 §2.9）。 |
| A4 | **单位与坐标**：SI 单位、米。模型坐标：+Y 上，−Z 机头，+X 右舷。世界坐标：+Y 上，−Z 初始北向。仿真机体轴：x 前、y 右、z 下（见 `docs/FLIGHT_MODEL.md`）。 |
| A5 | 物理固定步长 1/120 s，渲染层插值；不得在渲染帧里改物理状态。 |
| A6 | **零构建、零运行时依赖**：浏览器直接加载 ES 模块；Three.js 只用 `vendor/three.module.js`（r128）；服务器是 `server.mjs`。不得引入打包器、框架或 npm 运行时依赖。 |
| A7 | 运行时文件（`src/`、`assets/`、`audio/`、`index.html`、`styles.css`）不得引用 `work/`、`backups/`、`tools/`、`tests/`。 |
| A8 | **可动部件只靠变换**：可动部件只改四元数或位置，不靠隐藏、缩放模拟运动。F-16 CAD 铰链一律用 `T(hinge)·R·T(−hinge)·base` 矩阵，不用 pivot / attach 方案（旧方案多次把尾翼、襟翼、舱门一起弄坏）。 |
| A9 | 第三方资产只读：War Thunder 文件只提取实际用到的样本，并在 `sources.json` 记录来源和哈希；不复制整个 bank，不修改游戏目录。 |

---

## 2. 概念登记表（现有的全部"正式概念"）

每个概念只有**一个**归属位置。要扩展时，**先在已有概念里加实例**（新机型、新挂载、新音效包……），不得另起一套平行机制。表外的新东西都算"新概念"，必须走 §5 审查。

### 2.1 机型配置 AircraftConfig
- 注册表：`src/data/aircraft.js` 的 `AIRCRAFT_TYPES`，按机型 id 索引：`f16cm-block52`、`mig29`、`j16`、`j10c`。已退役（不在注册表、不在界面）：`proto1`、`f16-deepseek`，它们的配置常量 `F16A_PROTO1` / `F16A_PROTO2` 只作为其他配置的基础保留，外形存档在 `assets/models/f16-procedural/`。
- 新机型用 `src/data/<id>.js` 的 `create<Id>Config(base)` 工厂，以已有机型为底（`structuredClone`），只覆盖差异。
- 顶层字段是固定集合：`id name shortName nation role rwrCode rwrType rwrEmitter avionicsSource wiki visual mass geometry inertia limits control aero engine systems armament performanceTargets estimates`。**新增顶层字段或子字段 = 新概念。**
- 公开事实和编写系数分开：公开事实放 `src/data/<id>Wiki.js`（由 `tools/import-<id>-wiki.py` 生成，不手改）；拍定的系数写进 `estimates` 列表说明。
- F-16CM 已接入既有 `F16_WIKI`、`wiki`、`performanceTargets`、`estimates`、`control.rollRate` 和航电来源字段。事实引用已保存的战雷 Block 50 快照，项目仍称 Block 52；接入不自动替换飞行数值，差异记录在 `assets/models/f16/README.md`。显式滚转指令 `4.9 rad/s` 与原共享默认一致。

### 2.2 飞行仿真
`Atmosphere`、`Aerodynamics`、`ControlSystem`、`FlightModel`、`Aircraft`、`CombatSystem`、`AIPilot`（都在 `src/sim/`）。全部由配置驱动。

已存在的机型可调参数族（只能填值，不能另起同义字段）：
- 襟翼三档：`aero.clFlap`、`aero.clFlapLanding`、`aero.flapPitchMoment {takeoff, landing}`。
- 起飞抬头：`systems.takeoffPitchDeg`、`systems.mainGearZ`、`systems.contactHeight`、`systems.maxGroundPitchDeg`（地面抬头上限，取擦尾角向下取整，默认 14°；由 `tools/measure-tail-strike.mjs` 实测：F-16CM 10、歼-16 9.5、歼-10C 12）。
- 挂载质量：`armament.trackStoreMass`、`armament.pylonMass`（挂架空重，扣重下限；共享代码缺省一律 `??160`，有挂载的机型应在配置写明：歼-16 160、歼-10C 120，F-16 由 `missileLoadoutFromPreset` 写 160）。
- 机炮：`cannon.belts`、`shellDamage`、`tracerShells`、`penetration {apShells, distance, apT, aphe}`、`cannon.trackAmmoMass`（开炮扣弹药质量）。有 `belts` 的机炮，分弹种伤害、曳光弹种、穿甲表都只读配置，共享代码不放任何机型的弹种默认值；`penetration.apShells` 列出用 `apT` 表的弹种，其余用 `aphe`。
- 限制与发动机（三机统一取法）：`limits.ceiling` 取各机维基升限（F-16CM 15,240 m、歼-16 16,000 m、歼-10C 16,500 m）；`limits.flapTakeoffIas` 起飞襟翼限速，有维基值时取维基（F-16CM 470、歼-16 652 km/h），歼-10C 页面无此项、620 km/h 为编写值；`engine.abThreshold` 三机统一为 1（推满军用推力后才进加力）。来源写在配置注释里。
- 外观标记：`visual.scheme` 只供 `JetModel`（F-16 / MiG）选外形配置，歼-16、歼-10C 配置不写。外观实现由 `Game._createJet` 选择，不再用 `visual.j16Model` / `j10cModel` 之类标记（已删除）。
- 音效包：每架玩家机型都写明 `visual.audioManifest` 与 `visual.gunMode`（F-16CM `audio/pack.json`／`loop`，歼-16、歼-10C 各自目录／`shots`）；`Game` 的缺省值只留给 MiG-29。
- 发动机：`engine.ceilingFade`（m，升限以上推力按 exp(−Δh/值) 衰减；不写则不衰减）。
- 命中：`geometry.hitRadius`（机炮命中判定半径，默认 7.2 m）。
- 航电：`systems.seekerLimitedLock`（锁定角受导弹导引头限制，锁定距离按导引头类型计算）。
- 系统开关（同时决定按键）：`systems.dragChute`（B 减速伞）、`systems.fuelDumpRate`（J 放油）、`cannon.belts`（K 换弹链）、`systems.canopyTime`。
- 机库：`visual.hangar {title, code, loadoutTag, menuTag, name[], note, specs[]}`（机库/菜单文案与规格栏）、`visual.paints {default, options:[[id,label]]}`（可选涂装）。
- 已废弃：`flapTrimG`、`flapTrimLandingG`，不得恢复（见 `docs/TAKEOFF_FLAP_TRIM.md`）。

### 2.3 外观对象 Jet
- 三个实现：`JetModel`（F-16 系与 MiG）、`J16Jet`、`J10CJet`。
- 公共接口：`group`、`parts`（Game 读 `parts.wingTips`、`parts.nozzleLocal`、`parts.muzzleFlash`）、`sync(dt, flight, systems, weapons, options)`、`setVisualLoadout`、`getMissileLaunchPose`、`createCadMissileMesh`、`setCockpitView`、`cockpitEyeLocal`、`getCockpitEye`、`getMuzzleWorld`、`getNozzleWorld`、`dispose`。
- 加载就绪：`ready`（JetModel / J16Jet / J10CJet 的 Promise；异步模型完成装配后才完成，失败向等待者传播；程序化模型立即完成）；`airframe` 为已装配的模型根，异步模型加载前为空，程序化 JetModel 指向自身 `group`，供现有发射就绪检查使用。F-16 的 CAD 加载期间隐藏外形，重放最近一次同步状态后显示；已销毁实例的迟到加载结果只释放资源。
- 可选成员：`releaseExternalTanks(stations)`（JetModel、J16Jet、J10CJet 均实现既有接口）、`setPaint`（J10CJet 有）。三个 Jet 的 `releaseExternalTanks` 都只调用共享函数 `storeRelease.js` 的 `detachMountedStores(stores, stations, isTank)`：只处理指定挂点、未释放且 `isTank` 为真的挂载，保留世界位置／旋转／缩放并返回脱离父级的模型数组，由`CombatSystem`接管；重复调用不重复释放。各 Jet 只提供"什么算油箱"的判断。歼-10C 已有 1600 L／800 L 油箱实例及模型；歼-16 战雷维基没有油箱挂载，暂无油箱。
- 接口按实际能力选用，不为形式齐全增加空方法。F-16／歼-16目前各一种游戏涂装，无须补`setPaint`；歼-10C座舱内部暂不制作，现有`setCockpitView`仅保留视角状态。
- 选择实现的**唯一**位置是 `Game._createJet(config, isPlayer)`。新机型实现同一接口，不加新的外观基类或适配层。

### 2.4 模型资产
- 路径：`assets/models/<id>/<id>-white.glb`，旁边放同名 `.json`（审计数据）和 `README.md`。F-16 例外：制作输入`assets/models/f16/f16_cad.glb`，正式游戏加载烘焙的`f16_flight.glb`；高精度`f16_cad_high.glb`保留作预览／制作参考，生成链见本目录`README.md`。
- 可动部件是 rig 节点，glTF extras 字段：`role axis pivot local dir side`（各机型可附加自己的参数）。
- 每个机型模块导出一组函数：`build<Id>Model`、`load<Id>Model`、`pose<Id>(root, state)`、`paint<Id>(root, mode)`。
- 工作分区 `workZone` 只有三个值：`nose`、`mid`、`tail`。
- 生成脚本：`tools/build-<id>-*.mjs|py`；预览页：`tools/<id>-preview.html`，并暴露 `window.__<ID>_PREVIEW__`。
- **启动预加载与模型模板缓存（统一概念）**：唯一 GLB 缓存入口是 `src/visual/modelCache.js` 的 `loadCachedModel(url)`；按绝对 URL 共用加载 Promise 与只读解析模板，失败条目移除以便重试。每次返回独立对象树、几何、材质和贴图，实例内部去重；实例修改／释放不得污染模板或其他实例。F-16、歼-16、歼-10C 的现有加载函数统一调用该入口，不另建机型缓存。
- `Game.init()` 按 `AIRCRAFT_TYPES` 创建所有现役机型的隐藏预热实例并等待 `ready`；原 MiG-29 敌机池预热合并进 `_prewarmAircraftMaterials()`，在实际渲染场景中预热外观／座舱／已登记涂装及主要特效。预热实例由 `Game.aircraftWarmJets` 持有至页面关闭，不用于仿真或作为运行实例；玩家、展示机仍各自创建独立实例，敌机沿用已有对象池。所有资源、预热和初始展示机就绪后才进入菜单，失败使用现有启动错误页。缓存仅限当前页面，不新增持久化键、参数或依赖。细节与备份见 `docs/AIRCRAFT_LOADING.md`。

### 2.5 挂载
- 武器目录：`src/data/hangar.js` 的 `STORE_TYPES`，所有武器共用一张表，id 全局唯一。中国武器的数据对象在 `J16_STORE_DATA`，同一对象可以被多个机型共用，用 `store.aircraft: [...]` 标明哪些机型能挂。
- 挂点：`{id, label, name, allowed}`。预设：`{name, loadout}`。校验和归一化：`<id>LoadoutError`、`normalize<Id>Loadout`。挂载 → 武器槽统一走 `missileLoadoutFromPreset`。
- **挂载注册表**（统一概念）：`src/data/hangar.js` 的 `LOADOUT_JETS`，每个可编辑挂载的机型一项：`{stations, presets, error, normalize}`，有自己武器体系的机型再加 `{stores, sort}`。判断用 `hasLoadout(id)`，武器目录过滤用 `storeOffered(store, id)`。机库存档的默认值和迁移也按这张表循环。原 `cnJets.js` 的 `CN_STORE_JETS` / `isCnStoreJet` 已并入（文件移到 `work/consistency-m1/backup/batch123/`）。
- 歼-10C 共用的歼-16 武器：`j16Weapons.js` 的 `J10C_SHARED_STORES`（声明处直接写 `aircraft:['j16','j10c']`）。
- 挂点离架选择统一用 `src/visual/storeRelease.js`（`selectMountedStore`、`commitMountedRelease`）；整件脱离（抛副油箱）统一用同文件的 `detachMountedStores`，不得在 Jet 里另写。
- 歼-10C 副油箱：`j10cWeapons.js` 的 `tank1600`（挂点 LI／RI）、`tank800`（挂点 C），来自维基挂架表；`fuel` = 维基 `dropTankFuel`（3320 kg）按容量分摊，`mass` = `fuel` + 维基行 68 kg，长度／半径为按容量估算的编写值；外形由 `J10CStores.js` 的油箱车削体生成（`family:'tank'`），蒙皮见 §2.6。
- 带 `store.aircraft` 标记的挂载（歼-16 武器集、歼-10C 专有 Type 90-1 ×7 与副油箱）统一由 `J10CStores.js` 的 `buildTaggedStore(id, spec)` 建模，歼-10C 挂点和 `Game._createStoreMesh` 的机库陈列都调用它；未标记的 F-16 通用目录走 `createStoreModel`。
- **副油箱燃油**（统一概念，三机共用）：油箱挂载数据带 `fuel`（满油 kg，取自维基整套副油箱燃油按容量分摊：F-16 `fuel370`／`fuel300` 合计 3090 kg，歼-10C 合计 3320 kg；歼-16 维基无副油箱）。`armament.externalTanks` 每项为 `{station,id,mass,fuel}`。`Aircraft._feedExternalFuel()` 每帧把发动机用掉的燃油从挂着的油箱平均补回机内（副油箱先用），这部分从 `storesMass` 扣除；`Aircraft.externalFuel` 为剩余副油箱燃油；阻力用的挂载质量 `_storeDragMass()` 不随燃油减少。抛油箱扣"干重 + 剩余燃油"，重生时加满。HUD 续航按机内 + 副油箱燃油计算，T 遥测显示 `EXT`。
- 预设复制统一用`clonePreset(preset, aircraftId)`，调用`LOADOUT_JETS[aircraftId].normalize`；默认预设、旧存档、新建／恢复默认均传机型ID，不猜挂点大小写。
- **既有副油箱通路**：`STORE_TYPES`中`category:'tank'`的挂载与吊舱不进入可发射武器槽。`missileLoadoutFromPreset()`按归一化挂载写`armament.externalTanks:[{station,id,mass}]`，包含自有武器目录分支；质量仍计入`mass.stores`。`Aircraft.jettisonTanks()`扣除登记挂载质量、标记`weapons.jettisonedStations`，`CombatSystem.jettisonTanks()`调用Jet既有释放接口并接管脱离模型。`mass`沿用挂载总质量口径（含满油），燃油由上条"副油箱燃油"机制先于机内燃油使用。歼-16 战雷维基没有副油箱挂载，没有依据前不添加油箱实例。

### 2.6 外观涂装
- 每个机型的 `paint<Id>(root, mode)` 自带模式集合：
  - J-16：`weathered` `camo` `zones` `base` `white` `parts`（`camo` = 银灰迷彩，`J16Skin.js` 的 `applyJ16Skin(root,'camo')`）；
  - J-10C：`white` `zones` `parts` `base` `bayi` `service`；
  - F-16CM：`F16Skin.js` 单一蒙皮。
- 游戏内涂装选择：三机都有，列表在各机型配置的 `visual.paints`（F-16CM 只有`service`基础外观；歼-16 有`service`、`camo`银灰迷彩；J-10C有`service`、`bayi`）。`Screens`读取旧存档时把游戏涂装ID`base`兼容为`service`。游戏ID到模型模式的映射在各自Jet里：`J16_PAINTS.service`→`weathered`、`J16_PAINTS.camo`→`camo`，`J10C_PAINTS.service`→`service`；有多套涂装的 Jet 提供 `setPaint`（J10CJet、J16Jet），机库切换时实时重涂。歼-16 银灰迷彩沿用 `J16Skin.js` 同一着色器（`scheme='camo'`）：亮灰边（前缘襟翼、翼尖、平尾与垂尾前缘和尖部，按模型几何测得）、稍浅的不规则迷彩条纹、亮灰雷达罩、尾号 36001，金属感略强但仍用共享 `SKIN_ENV_INTENSITY` 与 `skinWeather`（减弱）；F-16使用既有单一蒙皮。模型检查用的`paintJ16/paintJ10C('base')`仍表示原始材质，不得全局改名。新增涂装 = 在配置和对应映射中加实例。
- 防发白和做旧统一用 `src/visual/skinFinish.js`（`SKIN_ENV_INTENSITY`、`skinWeather`、`skinGrime`）。彩绘表皮使用共享`SKIN_ENV_INTENSITY=.35`；歼-16旧值`.12`已改用该常量，材质缓存键为v3，亮度并非数值不变。热金属`.5`、玻璃`.65`为独立材质用途，不按蒙皮常量覆盖。歼-10C 副油箱蒙皮（`J10CStores.js` 的 `tankSkin`）同样调用 `SKIN_ENV_INTENSITY`、`skinWeather`、`skinGrime`，另加接缝与加油口；每个油箱实例一份材质，按尺寸共享编译程序。不得再写第二套做旧或亮度方案。

### 2.7 音效
- 音效包：`audio/<id>/pack.json`。固定键：`engineCruise engineThrust engineAfterburner engineCockpitLeft engineCockpitRight gun gunFirst gunLast missile`。
- 来源记录：`audio/<id>/sources.json`。机炮模式 `visual.gunMode`：`loop` 或 `shots`。
- 机型发动机／武器采样加载入口唯一：`AudioEngine.setSampleProfile(manifest, gunMode)`。
- 电子音与人声沿用`AudioEngine`内现有加载通路，独立于机型采样包：官方电子样本来自`audio/wt-gui/`；人声按`src/data/voicePacks.js`在`yuuka`（`audio/voice/`）与`wt-zh`（`audio/voice-wt-zh/`）中二选一，同时叠加电子音，不混用说话人、不用TTS。`Game.start()`等待8个必需电子样本、所选人声和机型采样加载，电子／人声失败提示并可重试；电子锁定／告警／RWR和点击声不回退到旧合成音。浏览器音频仍由用户手势启用，风噪／机械声及既有发动机／武器回退不属于电子音替换范围。说明见`audio/README.md`。

### 2.8 特效
- 加力尾焰：**唯一**着色器是 `src/visual/F16Exhaust.js`，F-16、歼-16、歼-10C 共用。颜色统一由 `exhaustBlueMix(afterburner)` 决定（先蓝后橙），马赫环带动态噪声贴图。新机型必须复用它，不得另写尾焰。
- 炮口火光统一用`VfxAtlas.js`的`createVfxPlume(0)`／`updateVfxPlume`，由`JetModel.js`、`J16Systems.js`、`J10CEffects.js`各自装配和驱动；旧F-16独立分支及歼-10C星形贴图已删除。`J10CEffects.js`仍是本机特效装配入口，尾焰调用共享着色器，不应整文件删除。
- 其他特效：`VfxAtlas.js`（贴图羽流）、`Effects.js`、`Trail.js`、`BombExplosion.js`。

### 2.9 统一概念 + 机型条目（取代按 id 分支）
共享代码只写一份机制，机型差异是数据：配置字段（§2.1）或注册表条目（`LOADOUT_JETS`、`AIRCRAFT_TYPES`）。

- 共享代码里只剩这些按 id 的写法：默认机型 `'f16cm-block52'`（`Game.js` 两处、`Screens.js` 一处）和 `Game._createJet` 选外观实现（§2.3）。
- 规则：**不再新增按 id 的分支**。新机型 = 新配置 + 需要时在注册表加一项；新的机型差异 = 新配置字段，按 §5 提案后登记到 §2.1。
- 只统一已经重复的东西（§6.1），不加通用框架或插件层。

### 2.10 持久化与调试入口（固定集合）
- localStorage 键：`skyforge.settings.v1`、`skyforge.hangar.v1`、`skyforge.<id>.paint`（每机型一个涂装键，`skyforge.j10c.paint` 是其中之一）。
- URL 参数：`aircraft`、`autostart=instant|runway|test`、`paint`、`gearDebug`；预览页有各自的参数。
- 全局调试对象：`window.__SKYFORGE__`（Game 实例）。
- 按键：见 `index.html` 帮助弹窗，以及 `Game._frameInput`。按配置启用的键：B 减速伞（`systems.dragChute`）、J 放油（`systems.fuelDumpRate`）、K 弹链（`cannon.belts`；三机都有：F-16CM 弹链来自维基 `f16Wiki.js`，歼-16、歼-10C 来自各自维基数据）。帮助弹窗、主菜单快捷键、暂停提示均列出 K。
- **可修改操作绑定**（用户 2026-10-23 批准）：唯一动作表为 `src/data/controls.js` 的 `CONTROL_ACTIONS`，现有 33 个动作的默认键位、分组、标签及纯函数均在此；Input、Game、Screens、HUD 共用，不另建输入框架。沿用 `skyforge.settings.v1`，新增 `keyBindings` 字段：动作 id → 候选组合数组，每个组合为同时按下的键码数组，左右修饰键按 Shift／Control／Alt／Meta 合并；缺失或无效的动作绑定恢复默认。设置中点“修改”→键盘擷取单键或组合键→鼠标点“确定”才保存，允许相同绑定、不移除其他动作；完整组合优先于其严格子集，无关操作仍可并用。提供取消、单项默认和全部默认；机炮可从既有鼠标左键改为键盘。默认行为沿用现状，三架玩家机型共用，能力限制仍读机型配置。主菜单、暂停、帮助、HUD 与提示文字同步当前键位。此次未新增 localStorage 键、游戏动作、第三方依赖、URL 参数或全局对象。

**新增键名、参数、全局对象、按键 = 新概念。**

### 2.11 测试与工具
- `tests/*.test.mjs`：纯 Node，不开浏览器。
- `tools/check-*.mjs`：浏览器检查，用 `tools/cdp.mjs` 的 `withBrowser`，需要 4173 端口的服务在跑。
- `tools/audit-*.mjs`：审计；`tools/measure-*`：测量（如 `measure-tail-strike.mjs`：各机型擦尾角）。
- 飞机加载／缓存：`tests/model-cache.test.mjs` 检查合并请求、模板及实例资源隔离、失败重试；`tools/check-aircraft-loading.mjs` 检查启动等待、缓存复用、切换／销毁、F-16 显示门控及失败页。
- `package.json` 的 scripts 只是登记表。本机没有 npm，实际用绝对路径的 node 运行。

### 2.12 工作区与文档
- `work/<任务名>/`：临时文件和备份，已被 `.gitignore` 排除、不进版本库。**构建／导入脚本不得从 `work/` 读输入**（`work/` 可随时清理）。
- `sources/`：采集快照区，存放一次性采集、难以重建的工具输入：`sources/wiki/<id>.html`（战雷维基页面快照，`tools/import-<id>-wiki.py` 读取）、`sources/j10c/cad/faces.json|faces.bin`（SolidWorks 导出的面片，`tools/j10c-sw-export.py` 写入、`tools/build-j10c-cad-base.mjs` 读取）、`sources/j16/audio-*/inventory.json`（音频提取清单，`tools/record-j16-audio-sources.mjs` 读取）。运行时文件不得引用 `sources/`。
- `backups/`：git 启用（2026-10-23）前的手工备份，只追加。
- `docs/<FEATURE>.md`：功能说明。交接内容写进对应的功能文档或资产 README，不另建交接文档；通用规则只写在本契约里，不在别处复述。
- 根目录 `README.md` 是公开仓库面向其他参与者的入口文档。每次改动影响玩家可见的功能、操作按键、机型数据来源或目录结构时，**同一次改动里同步更新 README**（用户 2026-10-23 要求实时更新）。
- `docs/changes/`：改动记录文件夹。`README.md` 为倒序索引与摘要；完成的工作文档（如临时交接）原文移入、命名 `日期-主题.md`，封存后不再修改。临时交接文档完成后一律移到这里，不删除。
- `assets/models/<id>/README.md`：资产说明。

---

## 3. 读写区与所有权

**读**：所有智能体可以读仓库里的任何文件。
**写**：按下表。"所有者"指用户当前把该机型或功能交给的那个任务；所有权跟着任务走，不跟着模型走。不确定自己是不是所有者时，视为不是。

| 区 | 路径 | 所有者 | 写入权 |
|---|---|---|---|
| **R 只读输入** | `vendor/`、`node_modules/`、各机型源文件（如 `assets/models/j10c/J10C.STEP` 和参考照片、`assets/models/陣風F3-R/`）、`audio/wt-*`、`audio/voice*`、仓库外目录（`D:\`、War Thunder 安装目录、SolidWorks 模板） | 无 | **禁止写入**。临时修改外部设置的（如 SolidWorks 默认模板），用完必须恢复 |
| **C 共享核心** | `src/core/`、`src/sim/`、`src/world/`、`src/ui/`、`src/main.js`、`index.html`、`styles.css`、`server.mjs`、`start.cmd` 等启动脚本 | 用户 | 只有当用户的指令**直接要求**改这里时才能写；按 §4.2 最小改动 |
| **S 共享注册表** | `src/data/aircraft.js`、`hangar.js`（含 `LOADOUT_JETS`）、`storeDimensions.js`、`voicePacks.js`、`f16Stations.js`、`package.json` | 用户 | 只能**追加登记**（新机型一行、新预设、新 script）；改结构或改已有条目要用户明确要求 |
| **U 共享视觉工具** | `src/visual/skinFinish.js`、`storeRelease.js`、`VfxAtlas.js`、`Effects.js`、`Trail.js`、`CameraRig.js`、`BombExplosion.js`、`CadMissileLibrary.js`、`modelCache.js`、`src/visual/jet/materials.js`、`geometry.js`、`profileCurve.js`、`profiles.js`、`missileModels.js`、`dropTankModel.js`；`tools/cdp.mjs`、`tools/lib/`、`tools/shoot.mjs`、`tests/helpers/` | 用户 | 同 C 区；改动会影响所有机型，必须跑所有受影响机型的检查 |
| **F16 机型区** | `JetModel.js`、`F16*.js`、`CadGeometry.js`、`CadLandingGear.js`、`assets/models/f16/`、`tools/*f16*`、`tools/*door*`、`tools/*gear*`、`tests/f16-*`、`tests/cad-landing-gear*`、`docs/HYDRAULIC_GEAR.md`、`F16_INTAKE_LIGHT.md` | 负责 F-16 的任务 | 所有者可写；其他任务只读 |
| **J16 机型区** | `J16*.js`、`src/visual/jet/j16*.js`、`src/data/j16*.js`、`assets/models/j16/`、`assets/textures/j16/`、`audio/j16/`、`tools/*j16*`、`tests/j16-*`、`docs/J16_*.md` | 负责歼-16 的任务 | 同上 |
| **J10C 机型区** | `J10C*.js`、`src/data/j10c*.js`、`assets/models/j10c/`（源文件除外）、`audio/j10c/`、`tools/*j10c*`、`tests/j10c-*` | 负责歼-10C 的任务 | 同上 |
| **新机型区** | 按 §2 命名约定新建的 `<id>` 前缀文件 | 创建它的任务 | 机型本身须经用户批准（新机型属于"新实例"，但它的文件名、注册条目要在开工前告诉用户） |
| **W 工作区** | `work/<任务名>/` | 创建它的任务 | 自由写；不得写别人的 `work/` 子目录；运行时和构建／导入脚本都不得引用 |
| **SRC 采集快照** | `sources/` | 用户 | 只能整份重新采集替换（重新保存维基页面、重新导出 CAD 面片）并记录日期；不得手改内容；运行时不得引用 |
| **B 备份** | `backups/`、`work/*/backup/` | 所有人 | 只追加，不覆盖、不删除（git 启用前的历史，不再新增） |
| **D 文档** | `docs/` 下各功能文档归对应功能区；`README.md`、本契约 | 功能所有者 / 用户 | `README.md` 和本契约归用户 |

跨区规则：
- 一个任务需要写别人的机型区或 C/S/U 区时，**先停下来告诉用户**：要改哪个文件、为什么、影响面，得到同意再写。用户在指令里已经点名要改的，视为已同意，但仅限点名的范围。
- 同一时间同一文件只应有一个写入任务。发现文件在自己读过之后被改过（修改时间变了，或内容和预期不符），**以磁盘为准**，重新读后再改，不回滚别人的改动。冲突无法合并时报告用户。

---

## 4. 写入规则

### 4.1 所有写入
1. **先读后写**：改任何文件前读当前内容；共享文件在动手前再查一次修改时间。
2. **git 分工**：工作区由多个会话共用（同一个目录、同一个 `.git`），`git switch` 会当场替换所有人的文件。
   - **禁止**在共用工作区切分支或改写历史：`switch`／`checkout <分支>`／`merge`／`reset`／`checkout -- <文件>`／`stash` 只由主控执行。
   - **提交**：只能 `git add <自己刚改的路径>` 后提交，**禁止 `git add -A` 和 `git commit -a`**；提交前用 `git status` 确认暂存区里只有自己的文件，别把别人写了一半的改动带进来。
   - **推送**由主控统一做，其他会话不 `push`。
   - 只读命令随时可用：`git log`／`status`／`diff`／`show`。
   - 需要真正并行提交时用 `git worktree add ../skyforge-<任务名> task/<任务名>`，每个会话一个独立目录，共用同一份 `.git`。
   - `backups/`、`work/*/backup/` 只保留 git 启用（2026-10-23）之前的历史，不再新增备份副本。
3. **编码**：文本文件一律 UTF-8，用编辑工具写入。禁止用 PowerShell 的 `Set-Content` 或 `Out-File` 写含中文的文件（预览页曾因此损坏）。
4. **最小改动**：只改任务需要的行。禁止顺手重排格式、批量改名、跑格式化工具、整理 import、删"看起来没用"的代码。
5. **照抄周边风格**：命名、缩进、注释密度和所在文件一致。
6. **不留死代码和临时代码**：调试代码、实验分支、`console.log` 放 `work/`，不进 `src/`。
7. **数据要有依据**：坐标、角度、系数写实测值或注明来源；编写的游戏系数在配置的 `estimates` 或注释里注明。禁止"大概""应该"。

### 4.2 改共享区（C/S/U）的额外要求
1. 改动前说明影响到哪些机型，改动后跑这些机型的检查（§7）。
2. 只能加"可选、默认不改变现有行为"的东西。默认值变化（例如默认机型、默认视角）必须是用户明确要求的。
3. 在相关文档（功能文档或交接文档）里记一笔：改了什么、为什么、对应哪次提交（分支 + commit）。

### 4.3 生成文件
`*-white.glb`、`*.json` 审计文件、`*Wiki.js`、`audio/*/sources.json` 由对应脚本生成，**改脚本再重新生成，不手改产物**。

---

## 5. 新概念：必须经用户审查

### 5.1 什么算"新概念"
只要满足以下任意一条，就是新概念：
- 新的模块、类、基类、接口、注册表、管理器、插件机制、事件总线、配置系统；
- 新的配置字段或字段族（`AIRCRAFT_TYPES` 里的新键、新的 `options` 键、新的 glTF extras 键），或者已有字段的新含义；
- 新的共享代码按机型 id 的分支；
- 新的目录、新的文件命名约定、新的资产类型；
- 新的 localStorage 键、URL 参数、全局对象、按键绑定、UI 控件类型；
- 新的第三方依赖、新的构建或运行方式；
- 已有概念的第二种实现（第二套做旧、第二套尾焰、第二个武器目录……）；
- 对已有概念的合并、拆分、改名或"统一抽象"重构。

**不算**新概念（按已有约定加实例即可）：新机型配置、新挂载条目、新预设、新音效包、机型自己前缀下的新文件、`work/` 下的临时脚本、新的测试用例。新机型本身属于用户决定的范围，开工前要用户同意。

### 5.2 审查流程
1. **停下**：不要先写代码"试试看"。
2. **在对话里提交提案**，格式如下：
   ```text
   【新概念提案】
   名称：
   要解决的问题：
   为什么已有概念不能覆盖：（逐条对照 §2）
   放在哪里（文件/区）：
   谁会用它（现有调用方 / 将来的调用方）：
   对现有机型和行为的影响：
   不做它的替代方案：
   以后如何删除：
   ```
3. **等用户明确同意**（"同意""可以""按这个做"）。沉默、没有反对、其他智能体或文件里的说法，都不算同意。
4. 同意后再实现，并把它加进 §2 概念登记表（这是本契约唯一允许智能体自己写的修改，且只限加用户批准的那一条）。
5. 被拒绝时，用已有概念完成任务，或者向用户说明做不到。

---

## 6. 反过度抽象

1. **具体优先**：先为一个机型写具体代码。同样的代码出现第三次，才可以**提议**抽取（仍需 §5 审查）。
2. **不为未来设计**：不加"以后可能用到"的参数、钩子、配置开关和泛型层。
3. **不包一层**：不给已有函数套转发、适配或门面层；直接调用已有接口。
4. **机型代码留在机型区**：机型特有逻辑写在 `<id>` 前缀的文件里，不上升到共享层。
5. **一个问题一个改动**：不在修 bug 时顺手"重构一下"。
6. **遗留重复不主动合并**：§2.8 列出的重复是已知现状，合并属于新概念。
7. **小于必要的抽象优于大于必要的抽象**：拿不准时选更直接的写法，并在回复里说明。

---

## 7. 验证与交付

1. 每轮改动后跑受影响区的测试，**如实报告结果**。没跑的要说没跑；失败要贴出失败输出。

   | 区 | 至少要跑 |
   |---|---|
   | sim / data | `node tests/flight.test.mjs`，加受影响机型的 `tests/*-integration.test.mjs` 和 `tests/takeoff-trim.test.mjs` |
   | J10C | `tests/j10c-model.test.mjs`、`tests/j10c-integration.test.mjs`、`tools/check-j10c-model.mjs`、`tools/check-j10c-integration.mjs` |
   | J16 | `tests/j16-*.test.mjs` 中受影响的项、`tools/check-j16-integration.mjs`、`tools/check-j16-skin.mjs` |
   | F16 | `tools/check-f16-game.mjs`、`tools/check-doors.mjs`、`tests/f16-*.test.mjs` |
   | 共享 UI / Game | `tools/check-gameplay-controls.mjs`，加每个机型的游戏内检查 |
   | 外观亮度 | `tools/measure-skin-brightness.mjs` + `tools/skin-brightness-stats.py` |

2. 视觉改动必须多角度验证（不能只看追尾视角）：机头下方、侧面、上方、收起 / 放下、打开 / 关闭。
3. 浏览器检查需要 `node server.mjs 4173` 在跑；服务停了要先重启，不能把"连不上"当成通过。
4. **每轮回复最下面附测试网址**：`http://127.0.0.1:4173/`（按需加 `?aircraft=<id>`，或附预览页地址）。
5. 飞行手感、视觉观感最终由用户验收。自动测试通过只说明数值合理。

2026-10-23收尾例外：用户明确要求“时间紧张……不做任何测试”。本轮M8／M9／M7／M6文档收尾、M4配置接入、L7资产说明、M5接口说明及两机既有油箱接口实现均不运行测试或截图／亮度测量；该指令优先于§4.2和本节通常要求，仅适用于本轮。交接必须标为“实现／文档完成，本轮未测试”，不能用此前音效或缓存的通过结果替代本轮验证。用户要求保留并更新临时交接，故本轮不删除该文件。

---

## 8. 环境事实（只记录，不是概念）

- 没有 npm。
- git 2.55（`C:\Program Files\Git\cmd\git.exe`），已写入机器 PATH。**在 DSH 会话里 `git` 可能不在 PATH 上**（进程环境取的是会话启动时的快照），用绝对路径调用或新开终端。
- 提交身份：用本机 `git config user.name` / `user.email`（不在仓库里写死）；行尾策略 `core.autocrlf=false` + `core.eol=lf`，细则见 `.gitattributes`。
- node：DSH 运行时依赖目录下的 `node\bin\node.exe`
- python：同目录树下的 `python\python.exe`（有 numpy、trimesh、PIL、win32com；没有 scipy）
- 定位这两条路径：`Get-ChildItem "$env:USERPROFILE\.dsh\dsh-runtimes" -Recurse -Include node.exe,python.exe | Select-Object -ExpandProperty FullName`
- PowerShell 会丢空字符串参数，会吞掉 JSON 引号；Python 输出中文前设 `PYTHONIOENCODING=utf-8`。
- headless Chrome 偶尔卡住一次，重跑即可；连续失败才算失败。

---

## 9. 修订本契约

- 只有用户能修改本契约，或批准智能体修改。唯一例外是 §5.2 第 4 步：把用户已批准的新概念登记进 §2。
- 发现本契约与代码不符（例如概念已被删除、路径已变）时，报告用户并附修订建议，不要自行改动。
- 修订时在文末追加一行记录：日期、改了什么、谁批准。

### 修订记录
- 2026-10-23：用户批准“可修改的操作绑定”新概念提案（回复“允许”），在 §2.10 登记 `CONTROL_ACTIONS`、既有设置中的 `keyBindings` 字段与点击修改／键盘擷取／鼠标确认流程；33 项操作支持重绑、重复组合、恢复默认及动态提示。
- 2026-10-22：初版。按 2026-10-22 的代码现状整理（用户要求编写）。
- 2026-10-22：§2.8 尾焰统一为单一着色器（`F16Exhaust.js` + `exhaustBlueMix`，先蓝后橙，动态贴图马赫环）。用户在对话中指示"统一着色器"。
- 2026-10-22：按用户要求清理文档，删除过时或与本契约重复的 `HANDOFF.md`、`HANDOFF_J11.md`、`HANDOFF_J10C.md`、`J16_SYSTEMS.md`（备份在 `work/md-cleanup/deleted/`），并同步 §1 A8、§2.12、§3 中的引用。
- 2026-10-22：根目录 `README.md`、`docs/AVIONICS.md`、`assets/models/j16/README.md`、`audio/README.md` 曾被删除，随后按用户要求从备份恢复，并把其中的过时内容更正为现状（备份在 `work/md-cleanup/deleted-2/`）。
- 2026-10-22：按用户要求从游戏断开测试原型机1型与 F-16 DeepSeek（§2.1），模型存档到 `assets/models/f16-procedural/`。
- 2026-10-22：经用户要求新建临时交接 `docs/HANDOFF_CONSISTENCY_TEMP.md`（§2.12 的例外），统一性修复全部完成后删除。
- 2026-10-22：按用户要求给 F-16CM、歼-16 加涂装选择（§2.6）和每机型涂装键 `skyforge.<id>.paint`（§2.10）；机库改版：出战方式在中上、机型在下方一行、挂载按类别分段、"挂载选择 / 收起"开关面板。备份在 `work/hangar-ui/backup/before/`。
- 2026-10-22：用户批准"统一概念 + 机型条目"（M1 批次 0–3）：§2.1 新增 `engine.ceilingFade`、`geometry.hitRadius`、`cannon.trackAmmoMass`、`systems.seekerLimitedLock`、`visual.hangar`、`visual.paints`；§2.5 `CN_STORE_JETS` 并入 `LOADOUT_JETS`（含 F-16CM），`cnJets.js` 退役；§2.9 改写为统一概念规则；§2.10 B/J/K 键按配置启用。备份在 `work/consistency-m1/backup/`。
- 2026-10-22：用户决定 F-16CM 也扣弹药质量（`cannon.trackAmmoMass:true`）；用户批准 M11，§2.1 新增 `systems.maxGroundPitchDeg`（实测擦尾角），新增 `tools/measure-tail-strike.mjs`。两项均未跑测试，测试清单见 `docs/HANDOFF_CONSISTENCY_TEMP.md`。备份在 `work/m11/backup/`。
- 2026-10-22：用户指示“执行。运行概念合并/创建概念”，批准统一启动预加载与模型模板缓存；§2.3 登记三种 Jet 的 `ready`／`airframe` 和 F-16 加载门控，§2.4 登记唯一 `modelCache.js` 入口、实例资源隔离、全部现役机型预加载及合并后的材质预热，§2.11 登记加载检查，§3 登记共享工具所有权。22个Node测试、9个浏览器检查通过。备份在 `work/aircraft-loading-20261022/backup/before/`；说明见 `docs/AIRCRAFT_LOADING.md`。
- 2026-10-23：用户要求完成图片中的一致性收尾、先做油箱接口而暂缓模型，并更新契约和交接且不做任何测试。同步§2.1 F-16维基接入、§2.3既有Jet接口能力、§2.4资产用途、§2.5预设归一化及既有副油箱通路、§2.6涂装ID和蒙皮常量、§2.7已修复音效、§2.8统一炮口火光，§7记录本轮免测及保留交接。未新增概念、配置字段、注册表、存储键或供油机制；后续新增仍须§5批准。备份在`work/consistency-closeout-20261023/backup/before/`。
- 2026-10-23：用户批准统一性审计第1–3项及死代码清理：§2.1 机炮弹种数据只读配置（歼-16 补 `shellDamage`、`tracerShells`；新增子字段 `penetration.apShells`，歼-16 `['AP-T']`、歼-10C `['AP-I']`），`CombatSystem` 删除歼-16 弹种默认值；`pylonMass` 缺省统一 `??160`，歼-16 写明 160；删除未使用的 `visual.j16Model`／`j10cModel`，注明 `visual.scheme` 只供 `JetModel`；删除 `Game.js` 未用导入。未跑测试，清单见交接 §2.7。备份在 `work/consistency-audit-fix/backup/`。
- 2026-10-23：用户要求三机升限按维基、加力阈值统一为 1、补起飞襟翼限速并在配置注明来源（§2.1）；指出 `work/` 被构建脚本依赖的问题，新增采集快照区 `sources/`（§2.12、§3 SRC 区），三份维基快照、歼-10C 面片、歼-16 音频清单复制进来（`work/` 原件保留），四个导入／构建脚本及 `j10c-sw-export.py` 改读写 `sources/`；`import-f16-wiki.py` 补读襟翼限速并重新生成 `f16Wiki.js`。未跑测试，清单见交接 §2.8。备份在 `work/sources-move/backup/`。
- 2026-10-23：用户要求三机都能用 K 切换弹种：`import-f16-wiki.py` 读取 M61A1 弹链表（默认／对空／隐踪／穿甲及穿深），F-16CM 补 `cannon.belts`、`shellDamage`（编写值，围绕原 7/发）、`tracerShells ['API-T']`、`penetration`（`apShells ['AP-I','API-T']`）；帮助与快捷键文字改为三机通用。22 个 Node 测试通过，浏览器检查未跑（交接 §2.9）。备份在 `work/f16-belts/backup/`。用户要求对三份 `releaseExternalTanks` 提出抽取提案（见交接 §2.9），待批准。
- 2026-10-23：用户批准【新概念提案】共享挂载脱离函数：`storeRelease.js` 新增 `detachMountedStores(stores, stations, isTank)`（§2.3、§2.5），JetModel／J16Jet／J10CJet 的 `releaseExternalTanks` 改为调用它。同轮按用户要求做歼-10C 副油箱（§2.5，`tank1600`／`tank800`，维基挂架表，尺寸估算）；歼-16 维基无油箱，未做。验证：22 个 Node 测试、`check-gameplay-controls`、`check-f16-game` 通过，脱离函数单项检查与歼-10C 油箱多角度截图、离地 33–37 cm、O 键抛出 3 个油箱扣 3524 kg 通过。备份在 `work/detach-stores/backup/`、`work/j10c-tanks/backup/`。
- 2026-10-23：用户要求做油箱蒙皮和副油箱燃油（数值按维基，三机）。§2.6 歼-10C 油箱蒙皮复用 `skinFinish.js`；§2.5 新增统一概念"副油箱燃油"：挂载 `fuel` 字段（F-16 合计 3090 kg、歼-10C 合计 3320 kg，均来自维基；歼-16 维基无副油箱）、`externalTanks.fuel`、`Aircraft._feedExternalFuel／externalFuel／_storeDragMass`，HUD 续航与 `EXT` 遥测。验证：`work/drop-tank-fuel/check.mjs`（先耗副油箱、质量一致、阻力不降、抛油箱扣干重+余油、重生加满）、22 个 Node 测试、`check-gameplay-controls`、`check-j10c-integration`、油箱截图与着色器编译检查通过。仓库已启用 git，本轮起不再写备份副本。
- 2026-10-23：用户批准统一性剩余第1–3项：`buildJ10CWeapon` 改名 `buildTaggedStore`（§2.5，两机共用挂载建模入口）；F-16CM 写明 `visual.audioManifest:'audio/pack.json'`、`gunMode:'loop'`（§2.1）；删除歼-16／歼-10C 未被读取的 `visual.scheme`。§2.12 新增规则：`README.md` 为公开入口文档，影响玩家可见内容的改动须同步更新；本轮已更新 README（机型、操作、武器／副油箱、机库、目录、参与开发、参考）。只做了语法检查，测试由用户自行运行。
- 2026-10-23：按用户要求封存临时交接：新建改动记录文件夹 `docs/changes/`（§2.12），`docs/HANDOFF_CONSISTENCY_TEMP.md` 原文移为 `docs/changes/2026-10-23-三机统一性修复-交接原文.md`，摘要、验证状态与待跑测试写入 `docs/changes/README.md`。上文修订记录中提到的交接文档路径均指该封存文件。
- 2026-10-23：用户要求把 §4.1.2 由"开工建 task 分支"改为**git 分工**：多会话共用同一工作区时，禁止切分支／合并／回滚／重置，只允许按路径提交自己刚改的文件（禁止 `git add -A`），推送由主控统一做，真正并行时用 `git worktree`。起因：某会话新建并切到 `task/changes-folder`，`git switch` 会替换共用工作区的文件，主控的提交会落到别人的分支上。README"参与开发"同步。
