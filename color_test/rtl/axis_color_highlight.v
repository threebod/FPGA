`timescale 1ns/1ps

// AXI4-Stream RGB888 pixel highlighter.
//
// The datapath is intentionally combinational: TVALID, TREADY and all
// sideband signals are passed through unchanged, while TDATA is replaced
// only for pixels matching one of the configured colour predicates.  This
// makes the block safe to insert between the RGB/gamma path and a video VDMA
// without changing frame timing or packet boundaries.
module axis_color_highlight #(
    parameter integer BLUE_MIN_B = 100,
    parameter integer RED_MIN_R = 120,
    parameter integer ORANGE_MIN_R = 140,
    parameter integer ORANGE_MIN_G = 70,
    parameter integer TKEEP_WIDTH = 3,
    parameter integer TUSER_WIDTH = 1
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "XIL_INTERFACENAME ACLK, ASSOCIATED_BUSIF S_AXIS:M_AXIS" *)
    input  wire                         aclk,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TDATA" *)
    input  wire [23:0]                  s_axis_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TVALID" *)
    input  wire                         s_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TREADY" *)
    output wire                         s_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TKEEP" *)
    input  wire [TKEEP_WIDTH-1:0]       s_axis_tkeep,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TUSER" *)
    input  wire [TUSER_WIDTH-1:0]       s_axis_tuser,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 S_AXIS TLAST" *)
    input  wire                         s_axis_tlast,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TDATA" *)
    output wire [23:0]                  m_axis_tdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TVALID" *)
    output wire                         m_axis_tvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TREADY" *)
    input  wire                         m_axis_tready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TKEEP" *)
    output wire [TKEEP_WIDTH-1:0]       m_axis_tkeep,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TUSER" *)
    output wire [TUSER_WIDTH-1:0]       m_axis_tuser,
    (* X_INTERFACE_INFO = "xilinx.com:interface:axis:1.0 M_AXIS TLAST" *)
    output wire                         m_axis_tlast
);

    // aclk is part of the interface so the block can be packaged/connected
    // as an AXI4-Stream stage.  The zero-latency implementation does not
    // need a clocked register.
    wire unused_aclk = aclk;

    wire [7:0] red   = s_axis_tdata[23:16];
    wire [7:0] green = s_axis_tdata[15:8];
    wire [7:0] blue  = s_axis_tdata[7:0];

    wire [8:0] red_x2   = {1'b0, red} << 1;
    wire [8:0] green_x2 = {1'b0, green} << 1;
    wire [8:0] blue_x2  = {1'b0, blue} << 1;

    wire blue_hit = (blue >= BLUE_MIN_B) &&
                    (blue_x2 >= (red * 3)) &&
                    (blue_x2 >= (green * 3));

    wire red_hit = (red >= RED_MIN_R) &&
                   (red >= (green * 2)) &&
                   (red >= (blue * 2));

    wire orange_hit = (red >= ORANGE_MIN_R) &&
                      (green >= ORANGE_MIN_G) &&
                      (red > green) &&
                      (green_x2 > red) &&
                      (green >= (blue * 2));

    localparam [23:0] BLUE_HIGHLIGHT   = 24'h0080FF;
    localparam [23:0] RED_HIGHLIGHT    = 24'hFF0000;
    localparam [23:0] ORANGE_HIGHLIGHT = 24'hFF8000;

    assign m_axis_tdata = blue_hit   ? BLUE_HIGHLIGHT :
                          red_hit    ? RED_HIGHLIGHT :
                          orange_hit ? ORANGE_HIGHLIGHT :
                                       s_axis_tdata;

    assign m_axis_tvalid = s_axis_tvalid;
    assign s_axis_tready = m_axis_tready;
    assign m_axis_tkeep  = s_axis_tkeep;
    assign m_axis_tuser  = s_axis_tuser;
    assign m_axis_tlast  = s_axis_tlast;

endmodule
