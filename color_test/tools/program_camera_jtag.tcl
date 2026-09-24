# Configure PL, initialize the Zynq PS, download the recovery application, and run it.
# Prerequisites:
#   1. Run tools/build_bitstream.tcl.
#   2. Run tools/build_camera_recovery.tcl.
#   3. Start hw_server and connect the AX7Z020B JTAG cable.

set project_dir [file normalize [file join [file dirname [info script]] ..]]
set bit_file [file join $project_dir color_test.runs impl_1 system_wrapper.bit]
set ps_init [file join $project_dir build camera_recovery camera_platform hw ps7_init.tcl]
set elf_file [file join $project_dir build camera_recovery output camera_recovery.elf]

foreach required [list $bit_file $ps_init $elf_file] {
    if {![file exists $required]} {
        puts stderr "ERROR: required build output not found: $required"
        exit 2
    }
}

connect -url tcp:127.0.0.1:3121

if {[catch {
    targets -set -nocase -filter {name =~ "*APU*"}
    rst -system
    after 2000

    targets -set -nocase -filter {name =~ "xc7z020*"}
    fpga -file $bit_file
    after 500

    targets -set -nocase -filter {name =~ "*Cortex-A9*#0"}
    configparams force-mem-access 1
    source $ps_init
    ps7_init
    ps7_post_config
    rst -processor
    dow $elf_file
    configparams force-mem-access 0
    con
} detail]} {
    puts stderr "ERROR: JTAG programming failed: $detail"
    catch {configparams force-mem-access 0}
    catch {disconnect}
    exit 3
}

puts "JTAG programming complete: $elf_file"
disconnect
exit 0
