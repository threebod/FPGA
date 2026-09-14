# 基于 FPGA 机器视觉与空间映射的实体化 Portal 智能解谜平台

## 1. 项目名称

**基于 FPGA 机器视觉与空间映射的实体化 Portal 智能解谜平台**

英文名可暂定为：

**FPGA-Based Machine Vision and Spatial Mapping Physical Portal Puzzle Platform**

---

## 2. 项目定位

本项目受到《Portal（传送门）》系列游戏启发，将游戏中的：

- 激光解谜；
- 镜面反射；
- 蓝色 / 橙色 Portal；
- 空间映射；
- 伴侣方块；
- 按钮；
- 门与机关；

从虚拟游戏世界搬到真实桌面。

与普通激光迷宫不同，本项目加入**顶视机器视觉**。玩家可以自由移动镜子、Portal、目标和道具，摄像头实时观察整个桌面，FPGA 对视频流进行处理，自动识别各个游戏元素的位置和方向，并建立对应的二维数字地图。

随后 FPGA 根据当前场景实时计算：

- 激光传播；
- 镜面反射；
- Portal 入口与出口映射；
- 障碍碰撞；
- 目标命中；
- 方块压板；
- 门与机关状态。

最终形成：

> **视觉感知 → 场景重建 → 光路计算 → 空间传送 → 机关执行**

的完整闭环。

本项目不是简单“把 Portal 游戏搬到 FPGA”，而是：

> **让 FPGA 实时理解一个真实桌面的 Portal 关卡，并让实体世界和数字世界同步运行。**

---

# 3. 核心创意

本项目最核心的创新是：

> **玩家可以自由摆放真实游戏道具，系统通过视觉自动识别并重建关卡，而不是使用固定传感器和固定地图。**

例如桌面上放置：

```text
                 Mirror A
                    /
                   /

Portal A                         Wall

              Companion Cube

          Mirror B

Portal B                        Target
```

顶视摄像头采集场景后，FPGA 自动得到：

```text
Mirror A:
x = 326
y = 178
θ = 42°

Mirror B:
x = 415
y = 332
θ = 18°

Portal A:
x = 120
y = 380
θ = 90°

Portal B:
x = 560
y = 210
θ = 35°

Cube:
x = 280
y = 250

Target:
x = 620
y = 130
```

之后系统立即计算当前光路。

---

# 4. 系统总体架构

```text
                     顶视摄像头
                         ↓
                 FPGA 图像采集模块
                         ↓
        ┌────────────────────────────┐
        │      FPGA 视觉处理前端      │
        │                            │
        │ RGB → HSV / YCbCr          │
        │ 阈值分割                   │
        │ Sobel / 边缘检测           │
        │ 腐蚀 / 膨胀                │
        │ 连通域分析                 │
        │ Bounding Box              │
        │ 角度 / 中心坐标计算        │
        └─────────────┬──────────────┘
                      ↓
        ┌────────────────────────────┐
        │        场景重建模块         │
        │                            │
        │ Mirror                     │
        │ Portal                     │
        │ Target                     │
        │ Wall                       │
        │ Cube                       │
        │ Button                     │
        └─────────────┬──────────────┘
                      ↓
        ┌────────────────────────────┐
        │     FPGA Physics Engine    │
        │                            │
        │ Ray Engine                 │
        │ Reflection Engine          │
        │ Portal Mapping Engine      │
        │ Collision Detection        │
        │ Puzzle State Machine       │
        └─────────────┬──────────────┘
                      ↓
          ┌───────────┴────────────┐
          ↓                        ↓
     HDMI 可视化               实体执行机构
                               舵机 / LED
                               电磁锁 / 门
                               蜂鸣器
```

---

# 5. 视觉系统设计

## 5.1 摄像头布局

推荐采用：

> **顶视单目摄像头**

摄像头固定在桌面正上方，完整覆盖整个游戏区域。

第一版不做三维视觉，只处理二维平面。

推荐游戏区域：

```text
60 cm × 40 cm
或
80 cm × 60 cm
```

这样既适合摄像头识别，也方便现场展示。

---

## 5.2 视觉识别对象

第一阶段只识别：

1. Portal A；
2. Portal B；
3. Mirror；
4. Target；
5. Wall。

后续加入：

6. Companion Cube；
7. Button；
8. Moving Platform；
9. Ball；
10. Turret。

---

# 6. Portal 视觉识别

Portal A 与 Portal B 分别设计为：

- 蓝色圆环；
- 橙色圆环。

FPGA 可以通过颜色空间转换进行识别。

例如：

```text
RGB
 ↓
HSV
 ↓
Blue Threshold
 ↓
Portal A
```

以及：

```text
RGB
 ↓
HSV
 ↓
Orange Threshold
 ↓
Portal B
```

最终得到：

```text
Portal A:
Center = (x1, y1)
Angle  = θ1

Portal B:
Center = (x2, y2)
Angle  = θ2
```

为了便于识别 Portal 朝向，可以在 Portal 圆环上增加：

- 小箭头；
- 黑白定位标记；
- 非对称图案。

---

# 7. 镜面视觉识别

镜面模块可以在顶部增加明显定位标记。

例如：

```text
●────────────●
     Mirror
```

FPGA 找到两个端点：

```text
P1(x1,y1)
P2(x2,y2)
```

即可计算镜面中心：

```text
x = (x1 + x2) / 2
y = (y1 + y2) / 2
```

以及角度：

```text
θ = atan2(y2-y1, x2-x1)
```

第一版为了降低 FPGA 实现难度，可以避免直接计算复杂 atan2，而使用：

- 查找表 LUT；
- CORDIC；
- 离散角度编码。

例如只允许：

```text
0°
15°
30°
45°
60°
75°
90°
...
```

这样更适合 FPGA 硬件实现。

---

# 8. FPGA 视觉前端

视觉部分建议优先采用传统图像处理，而不是直接上 YOLO。

推荐流水线：

```text
Camera
 ↓
RGB565 / RGB888
 ↓
RGB → HSV / YCbCr
 ↓
颜色阈值
 ↓
二值图
 ↓
腐蚀
 ↓
膨胀
 ↓
连通域
 ↓
Bounding Box
 ↓
中心坐标
 ↓
方向计算
```

FPGA 可以重点实现：

- 视频流采集；
- 色彩空间转换；
- 阈值分割；
- Sobel；
- 3×3 窗口；
- 腐蚀；
- 膨胀；
- 连通域统计；
- ROI；
- Bounding Box。

这样能够明显体现 FPGA 的流式并行处理优势。

---

# 9. 场景重建

视觉系统识别完成后，将现实世界转换为内部二维地图。

例如：

```text
Object 0:
TYPE = PORTAL_A
X = 120
Y = 380
ANGLE = 90

Object 1:
TYPE = PORTAL_B
X = 560
Y = 210
ANGLE = 35

Object 2:
TYPE = MIRROR
X = 326
Y = 178
ANGLE = 42
```

可以将这些对象信息存储在 BRAM 中。

数据结构：

```text
Object_ID
Object_Type
Position_X
Position_Y
Angle
Width
Height
State
```

---

# 10. 光线路径计算

## 10.1 光线表示

一条激光表示为：

```text
Origin = (x, y)
Direction = (dx, dy)
```

FPGA 每次计算：

> 当前光线首先碰到哪个对象？

候选对象包括：

- Mirror；
- Wall；
- Portal；
- Target。

---

## 10.2 光线与镜面求交

计算：

```text
Ray
×
Mirror Segment
```

得到：

```text
Intersection Point
```

若交点有效，则进入反射模块。

---

# 11. 镜面反射

反射关系：

```text
R = D - 2(D·N)N
```

其中：

- D：入射方向；
- N：镜面法向；
- R：反射方向。

FPGA 可采用：

- 定点运算；
- DSP Slice；
- LUT；
- CORDIC；

实现实时反射计算。

---

# 12. Portal 空间映射

这是项目的核心机制之一。

当激光进入 Portal A：

```text
Position_A
Direction_A
```

FPGA 将它映射到 Portal B：

```text
Position_B
Direction_B
```

之后继续传播。

例如：

```text
Laser
   ↓
Portal A

          Portal B
             ↓
          Mirror
             ↓
           Target
```

Portal 不只是简单“从 A 跳到 B”。

还需要考虑：

- Portal 朝向；
- 入射角；
- 出射角；
- 坐标系转换。

因此本项目真正实现的是：

> **二维 Portal 坐标变换系统。**

---

# 13. 碰撞检测

FPGA 需要不断判断光线是否撞击：

```text
Mirror
Portal
Wall
Target
Receiver
```

如果：

```text
Hit Mirror
```

执行反射。

如果：

```text
Hit Portal
```

执行空间映射。

如果：

```text
Hit Wall
```

停止传播。

如果：

```text
Hit Target
```

触发机关。

---

# 14. 防止无限循环

例如：

```text
Portal A
 ↓
Portal B
 ↓
Mirror
 ↓
Portal A
```

可能形成无限循环。

因此设置：

```text
MAX_BOUNCE
```

例如：

```text
MAX_BOUNCE = 16
```

超过最大传播次数后停止计算。

---

# 15. 实体激光与数字光路

系统可以同时维护：

### 实体光路

真实激光：

```text
Laser
 ↓
Mirror
 ↓
Sensor
```

### 数字光路

FPGA 根据视觉识别结果实时计算：

```text
Predicted Ray
```

HDMI 显示：

```text
黄色：预测光路
红色：实际命中
```

如果二者偏差过大：

```text
Calibration Required
```

这样系统还可以具备一定的自动校准能力。

---

# 16. HDMI 数字孪生界面

屏幕实时显示：

```text
┌────────────────────────────────┐
│          PORTAL LAB            │
│                                │
│   Mirror A                     │
│      /                         │
│     /                          │
│                                │
│  O Portal A                    │
│                ███ Wall        │
│                                │
│           / Mirror B           │
│                                │
│  O Portal B          ◎ Target  │
│                                │
│ Ray Bounce: 3                  │
│ Portal State: ACTIVE           │
└────────────────────────────────┘
```

玩家移动现实中的镜子：

> 屏幕里的镜子同步移动。

玩家旋转 Portal：

> 数字地图实时更新。

---

# 17. Companion Cube 玩法

可以加入 Portal 中非常经典的：

> **Weighted Companion Cube**

实体方块顶部加入颜色或视觉标记。

摄像头识别：

```text
Cube:
X
Y
```

同时识别：

```text
Button Area
```

如果：

```text
Cube ∈ Button
```

则：

```text
Button = ON
```

触发：

```text
Door Open
```

完整链路：

```text
摄像头
 ↓
Cube Detection
 ↓
FPGA
 ↓
Button Logic
 ↓
Servo
 ↓
Door Open
```

这样游戏不再只有激光。

---

# 18. 小球 Portal 传送

后期可加入非常适合现场展示的：

> **实体小球传送**

效果：

```text
           Portal A
              ◎
Ball --->     ◎

                       ◎ ---> Ball
                       ◎
                   Portal B
```

并不真正传送同一个小球。

而是：

### Portal A

```text
红外传感器
↓
检测小球进入
↓
收球机构
```

### FPGA

```text
Portal A Trigger
↓
空间映射
↓
Portal B Trigger
```

### Portal B

```text
储球仓
↓
舵机
↓
释放另一个小球
```

同时：

- Portal 灯光闪烁；
- 音效播放；
- HDMI 显示传送动画。

视觉系统可以进一步确认：

```text
Ball disappeared at A
Ball appeared at B
```

形成闭环。

---

# 19. 自由关卡模式

这是视觉版本最重要的玩法之一。

玩家可以：

> **自己摆关卡。**

例如自由放置：

```text
Mirror
Portal
Wall
Target
Cube
Button
```

系统：

```text
摄像头
 ↓
自动识别
 ↓
建立地图
 ↓
实时开始游戏
```

不需要手动输入地图。

---

# 20. 自动判断关卡是否有解

高级版本可增加：

```text
Scene Reconstruction
 ↓
Search Engine
 ↓
Possible Solution
```

系统自动判断：

```text
Current Puzzle: Solvable
```

并给出提示：

```text
Mirror A → 37°
Mirror B → 61°
```

或者：

```text
Current Puzzle: Unsolvable
Reason:
Portal B blocked by Wall
```

这可以作为高级创新功能，不建议放入第一版 MVP。

---

# 21. 游戏关卡设计

## Level 1：单镜反射

```text
Laser → Mirror → Target
```

学习镜面角度。

---

## Level 2：双镜反射

```text
Laser
 ↓
Mirror A
 ↓
Mirror B
 ↓
Target
```

---

## Level 3：第一次传送

```text
Laser
 ↓
Portal A
 ↓
Portal B
 ↓
Target
```

---

## Level 4：Mirror + Portal

```text
Laser
 ↓
Mirror
 ↓
Portal A
 ↓
Portal B
 ↓
Target
```

---

## Level 5：伴侣方块

```text
Cube
 ↓
Button
 ↓
Door Open
```

---

## Level 6：多机关联动

必须同时：

- Cube 压住按钮；
- 激光通过 Portal；
- Receiver 被激活。

才能打开门。

---

## Level 7：自由关卡

玩家自己摆放关卡。

---

# 22. FPGA 技术点

整个项目可以覆盖大量 FPGA 核心知识。

## 视频部分

- 摄像头采集；
- 像素时钟；
- 视频时序；
- 帧缓存；
- HDMI / VGA。

## 图像处理

- RGB → HSV；
- Threshold；
- Sobel；
- 3×3 Window；
- Morphology；
- Connected Components；
- Bounding Box。

## 计算部分

- 定点运算；
- 向量运算；
- CORDIC；
- LUT；
- DSP Slice。

## 存储部分

- BRAM；
- Object Table；
- Frame Buffer。

## 控制部分

- FSM；
- PWM；
- GPIO；
- UART；
- SPI；
- I2C。

## 图形部分

- 线段绘制；
- Sprite；
- Overlay；
- 实时地图显示。

---

# 23. 为什么必须使用 FPGA

评委可能会问：

> 为什么不用 STM32 或 Raspberry Pi？

回答可以从以下几点展开。

### 1. 实时视频流处理

摄像头产生连续高速像素流，FPGA 可以采用流水线结构：

```text
Pixel In
↓
Color Convert
↓
Threshold
↓
Morphology
↓
Feature
```

每个时钟周期处理一个像素。

### 2. 并行视觉计算

多个图像处理模块可以同时运行。

### 3. 并行几何计算

可以并行判断多个镜面、Portal 和障碍物。

### 4. 确定性低延迟

玩家移动物体后，系统需要立即更新数字地图与光路。

### 5. 实时 HDMI

FPGA 可以同时完成：

```text
Vision
+
Physics
+
HDMI
```

### 6. 软硬件融合度高

FPGA 不只是一个外设控制器，而是：

> **整个 Portal 世界的实时视觉与物理计算核心。**

---

# 24. MVP：第一版比赛原型

第一版不要做得过大。

推荐 MVP：

```text
1 个顶视摄像头
+
1 个 Laser
+
2 个 Mirror
+
2 个 Portal
+
1 个 Target
+
HDMI
```

需要实现：

### 视觉

- Portal A 识别；
- Portal B 识别；
- Mirror 位置识别；
- Mirror 角度识别；
- Target 识别。

### FPGA

- 场景重建；
- 光线求交；
- 镜面反射；
- Portal 映射；
- Target 判断。

### 显示

HDMI 实时显示：

```text
实体地图
+
预测光路
+
当前状态
```

只要这一版稳定完成，已经具备较强比赛展示效果。

---

# 25. 第二阶段升级

加入：

```text
Companion Cube
+
Button
+
Servo Door
```

形成：

```text
视觉识别
↓
逻辑判断
↓
实体机关
```

---

# 26. 第三阶段升级

加入：

```text
Ball Tracking
+
Physical Portal Ball Transfer
```

实现实体“小球传送”。

---

# 27. 第四阶段升级

加入：

- AI 目标识别；
- 自动关卡解析；
- 自动求解；
- 多光源；
- 分光器；
- Moving Platform；
- Turret。

---

# 28. 是否需要 AI

第一版：

> **不建议使用 YOLO。**

原因是本项目中的 Portal、Mirror、Target 都可以专门设计视觉标记。

传统 FPGA 图像算法：

```text
颜色
+
轮廓
+
几何
```

已经足够。

而且更能体现 FPGA 硬件实现。

后续可以加入轻量 AI，识别：

```text
Mirror
Cube
Turret
Portal
Button
Target
```

形成：

> FPGA 视觉前处理 + NPU / ARM AI 推理

的异构系统。

---

# 29. 项目创新点

## 创新点 1：视觉驱动的实体 Portal 世界

传统游戏地图是提前写好的。

本项目地图来自：

> **真实世界实时视觉识别。**

---

## 创新点 2：实体—数字孪生

现实中的：

```text
Mirror
Portal
Cube
Target
```

与 HDMI 中的数字地图一一对应。

---

## 创新点 3：FPGA 实时光路引擎

FPGA 实时完成：

- 光线求交；
- 反射；
- Portal 映射；
- 碰撞。

---

## 创新点 4：动态 Portal 坐标映射

Portal 可以被玩家自由移动和旋转，而不是固定位置。

---

## 创新点 5：自由搭建关卡

玩家自由摆放道具，系统自动生成游戏地图。

---

## 创新点 6：真实机关联动

数字计算最终控制：

- LED；
- 舵机；
- 电磁锁；
- 门；
- 小球机构。

形成真实闭环。

---

# 30. 与普通激光迷宫的区别

普通项目：

```text
Laser
+
Mirror
+
Sensor
```

本项目：

```text
Machine Vision
+
Scene Reconstruction
+
FPGA Image Processing
+
Ray Engine
+
Reflection Engine
+
Portal Mapping
+
Digital Twin
+
Physical Interaction
```

核心不是：

> 激光能不能照到目标。

而是：

> **FPGA 能否实时看懂一个由玩家自由搭建的真实 Portal 世界，并同步运行它的空间规则。**

---

# 31. 主要难点

1. 摄像头畸变；
2. 光照变化；
3. 镜面角度识别；
4. 视觉坐标与真实坐标映射；
5. FPGA 连通域分析；
6. 光线路径硬件化；
7. Portal 坐标变换；
8. HDMI 图形显示；
9. 实际激光与理论轨迹误差；
10. 机械结构可靠性。

---

# 32. 风险控制

## 不建议第一版做

- 三维 Portal；
- 复杂 SLAM；
- 深度摄像头；
- 全场景 YOLO；
- 多球实时三维物理；
- 真正复杂光学追踪。

## 第一版只做二维

把桌面视为：

```text
XY Plane
```

所有对象只具有：

```text
X
Y
Angle
```

这样项目复杂度会下降很多。

---

# 33. 推荐开发路线

## Phase 1：摄像头

实现：

```text
Camera → HDMI
```

---

## Phase 2：颜色识别

识别：

```text
Blue Portal
Orange Portal
Red Target
```

---

## Phase 3：Mirror

实现镜面定位和角度计算。

---

## Phase 4：场景重建

建立 Object Table。

---

## Phase 5：Ray Engine

完成：

```text
Laser → Mirror → Target
```

---

## Phase 6：Portal

完成：

```text
Laser
↓
Portal A
↓
Portal B
↓
Target
```

---

## Phase 7：HDMI 数字孪生

同步显示实体地图。

---

## Phase 8：机关

加入：

```text
Cube
Button
Door
```

---

## Phase 9：小球传送

形成最终高展示效果版本。

---

# 34. 项目一句话介绍

> **我们将《Portal》的空间传送与光学解谜机制搬到现实桌面，通过顶视摄像头和 FPGA 机器视觉实时识别玩家自由摆放的镜面、Portal、目标和机关，自动重建实体关卡，并由 FPGA 实时完成激光反射、Portal 空间映射和碰撞计算，使现实世界与数字世界同步运行。**

---

# 35. 答辩开场表达

可以这样介绍：

> 大多数电子游戏的世界规则都存在于程序中，而我们的项目尝试做相反的事情——让程序去理解一个真实存在的游戏世界。玩家可以直接在桌面上移动镜子和传送门，摄像头观察整个场景，FPGA 实时识别这些实体道具的位置与方向，并构建数字地图。之后 FPGA 像运行一个游戏物理引擎一样，实时计算激光反射和 Portal 空间映射，再将结果反馈到现实机关中，从而形成一个真正连接虚拟规则与实体世界的 Portal 解谜平台。

---

# 36. 综合评价

| 维度 | 评价 |
|---|---|
| FPGA 技术体现 | ★★★★★ |
| 创新性 | ★★★★★ |
| 视觉效果 | ★★★★★ |
| 游戏性 | ★★★★★ |
| 现场展示 | ★★★★★ |
| 可扩展性 | ★★★★★ |
| 第一版实现难度 | ★★★★☆ |
| 完整版实现难度 | ★★★★★ |

---

# 37. 当前最推荐版本

如果用于 FPGA 比赛选题，当前最推荐将项目控制在：

> **顶视摄像头自动识别 Portal、镜面与目标 → FPGA 实时重建二维场景 → FPGA 实时计算激光反射与 Portal 映射 → HDMI 显示实体场景数字孪生与预测光路 → 命中目标后控制实体机关。**

这一版本已经同时包含：

```text
FPGA机器视觉
+
实时图像处理
+
目标定位
+
场景重建
+
定点几何计算
+
Portal空间映射
+
HDMI
+
FSM
+
实体交互
```

技术链条完整，同时保留了非常强的游戏创意和现场展示效果。
