# AX7Z020B OV5640 MIPI 颜色识别验证

本工程基于官方 `22_an5641_mipi_hdmi` 示例迁移到 Vivado 2023.1，目标器件为
`xc7z020clg400-2`。视频链路保持为：

`OV5640 MIPI -> D-PHY -> CSI-2 -> Bayer/RGB -> Gamma -> 颜色高亮 -> VDMA -> DDR -> VDMA -> HDMI`

颜色高亮模块位于 `axis_subset_converter_0` 与采集端 `axi_vdma_1` 之间，不改变
AXI4-Stream 的 `TVALID/TREADY/TKEEP/TUSER/TLAST`。

## 颜色规则

输入为 RGB888，`TDATA[23:16]`、`TDATA[15:8]`、`TDATA[7:0]` 分别为 R、G、B。

- 蓝色：`B >= 100 && 2B >= 3R && 2B >= 3G`，输出 `0080FF`。
- 红色：`R >= 120 && R >= 2G && R >= 2B`，输出 `FF0000`。
- 橙色：`R >= 140 && G >= 70 && R > G && 2G > R && G >= 2B`，输出 `FF8000`。
- 其余像素保持不变。

阈值在 `rtl/axis_color_highlight.v` 的参数区，可重新综合后调整。

## 构建与验证

在仓库根目录执行：

```powershell
E:\Xilinx\Vivado\2023.1\bin\vivado.bat -mode batch `
  -source .\color_test\tools\build_bitstream.tcl
```

主要输出：

- bitstream：`color_test.runs/impl_1/system_wrapper.bit`
- 硬件平台：`color_test.xsa`
- 时序报告：`reports/post_impl_timing.rpt`
- 资源报告：`reports/post_impl_utilization.rpt`

当前自检结果：

- RTL 仿真：17 项检查，0 失败；
- BD 校验通过，20 个 IP 均未锁定；
- bitstream 生成成功；
- 实现后 WNS `0.748 ns`、TNS `0 ns`、WHS `0.018 ns`、THS `0 ns`；
- LUT 16699（31.39%）、寄存器 23886（22.45%）、BRAM Tile 36.5（26.07%）。

## 首次上板建议

1. 连接 OV5640 MIPI、HDMI 显示器和 JTAG，开发板使用 JTAG 启动模式。
2. 在 Vivado Hardware Manager 中下载
   `color_test.runs/impl_1/system_wrapper.bit`。
3. 在 Vitis 2023.1 中以 `color_test.xsa` 创建或更新硬件平台，初始化 PS 后，将
   `software/mipi_hdmi/mipi_hdmi.elf` 下载到 Cortex-A9 #0 并运行。
4. 依次放置纯红、纯蓝和橙色色卡，确认 HDMI 图像中的目标颜色被替换为固定高亮色，
   其他区域保持原图。

当前地址映射与官方工程一致，因此保留的官方 ELF 可用于首轮 JTAG 验证。目录中的
`bootimage/BOOT.bin` 仍是官方原始镜像，不包含本工程的新 bitstream，不要用它验证
颜色高亮功能。

## SD 卡启动

`sd_boot/BOOT.bin` 是使用 Vitis 2023.1 Bootgen 打包的当前颜色高亮版本，依次包含：

1. `software/mipi_hdmi/color_test/zynq_fsbl/fsbl.elf`（当前硬件平台生成的 FSBL）；
2. `color_test.runs/impl_1/system_wrapper.bit`（颜色高亮 bitstream）；
3. `software/mipi_hdmi/mipi_hdmi/Debug/mipi_hdmi.elf`（当前重新编译的应用）。

注意不要误用 `software/mipi_hdmi/mipi_hdmi.elf`：它是 2020 年的原始 ELF。
重新编译硬件或应用后，应在 `sd_boot` 目录重新运行：

```powershell
& 'E:\Xilinx\Vitis\2023.1\bin\bootgen.bat' -arch zynq -image boot.bif -o BOOT.bin -w on
```

将 MicroSD 卡的启动分区格式化为 FAT32，把 `sd_boot/BOOT.bin` 复制到分区根目录。
断电后插卡，按 AX7Z020B 板卡上的启动模式跳线/丝印切换到 SD 启动，再上电。
串口使用 115200 波特率观察 FSBL 和应用日志，同时检查 HDMI 摄像头画面及颜色高亮。
本仓库只完成了镜像生成与分区检查；当前环境未连接 SD 卡，尚未完成上板启动验证。

### CSI 调试核时钟

`color_test.srcs/constrs_1/new/debug_hub.xdc` 将 `dbg_hub` 接至 PS FCLK0（100 MHz）。
此前自动连接的时钟来自 MIPI 高速时钟；摄像头无输出时，Hardware Manager 无法检测到调试核。
使用 ILA 时，必须下载同一次实现生成的 `system_wrapper.bit` 和 `system_wrapper.ltx`。
本次实现的 USER 扫描链为 1，可在 Hardware Manager 的 Tcl Console 中设置
`set_property BSCAN_SWITCH_USER_MASK 1 [get_hw_devices xc7z020_1]` 后刷新设备。
新的 bitstream 和 BOOT.bin 已生成，但尚未上板验证；时序报告中有 83 条 CSI IP 内置 ILA
内部的跨时钟路径违例（WNS -2.913 ns），视频处理路径的时序满足约束。

## 摄像头串口诊断

应用源码位于 `software/mipi_hdmi/mipi_hdmi/src/`。修改后在 Vitis 2023.1 中构建 `mipi_hdmi` 应用，确认 `software/mipi_hdmi/mipi_hdmi/Debug/mipi_hdmi.elf` 已更新，再按上面的命令重新打包 `sd_boot/BOOT.bin`；仅下载 bitstream 不会更新这些串口打印。

上电后观察 `OV5640 0x3008`、`CSI long packets` 和 `Camera VDMA S2MM status`：

串口连接沿用官方例程的 PS UART1（115200 波特率）；新镜像启动时应先看到 `color_test camera diagnostic start`。
当前诊断镜像在启动显示后先输出彩条 5 秒，串口会打印 `HDMI color bars for 5 seconds`，
然后才初始化摄像头。彩条能显示而摄像头画面黑，说明 HDMI 输出通路可以工作，继续检查摄像头输入。
彩条也看不到时，先检查显示器输入源、HDMI 连接和显示输出通路。

- `0x3008 = 0x02` 表示传感器寄存器读回正常且已退出软件待机，但不能单独证明 MIPI 视频链路正常。
- 两秒内 `CSI long packets` 增加，表示 CSI 接收端看到了完整视频长包；不增加时结合 `CRC errors` 和 VDMA 状态继续检查摄像头时钟、MIPI 排线和接收链路。没有长包时，`CRC errors = 0` 不能说明链路正常。
- `OV5640 write failed` 会给出失败的寄存器地址；此时先检查 I²C 与摄像头供电。

## 迁移说明

Vivado 2023.1 会把官方 MIPI CSI-2 IP 内部的 `axis_data_fifo` 从 1.1 升级到 2.0。
新版将同步 FIFO 的计数端口拆分为读/写计数端口，本工程在
`repo/ip/MIPI_CSI_2_RX/hdl/LLP.vhd` 中改用 `axis_rd_data_count`，其余 CSI-2 数据路径
未修改。

官方 IP 自带的 ILA 和旧版 HDMI/MIPI 时钟约束在 2023.1 下会产生若干 Critical
Warning；它们未阻止 DRC、布局、布线或 bitstream 生成，且已约束的时序路径全部满足。
目前时序报告中 CSI IP 内置 ILA 的跨时钟路径未满足约束；首次上板仍需观察
MIPI 锁定、图像稳定性和 HDMI 输出，才能完成物理验证。
