set project_dir [file normalize [file join [file dirname [info script]] ..]]
set report_dir [file join $project_dir reports]
file mkdir $report_dir

open_project [file join $project_dir color_test.xpr]
set_property ip_repo_paths [list [file join $project_dir repo ip]] [current_project]
update_ip_catalog

set bd_file [get_files */system.bd]
open_bd_design $bd_file
validate_bd_design
generate_target all $bd_file
update_compile_order -fileset sources_1

reset_run synth_1
launch_runs synth_1 -jobs 2
wait_on_run synth_1
set synth_status [get_property STATUS [get_runs synth_1]]
puts "BUILD_STATUS synth_1=$synth_status"
if {![string match "synth_design Complete*" $synth_status]} {
    error "Synthesis failed: $synth_status"
}

open_run synth_1
report_utilization -file [file join $report_dir post_synth_utilization.rpt]
report_timing_summary -file [file join $report_dir post_synth_timing.rpt]
close_design

launch_runs impl_1 -to_step write_bitstream -jobs 2
wait_on_run impl_1
set impl_status [get_property STATUS [get_runs impl_1]]
puts "BUILD_STATUS impl_1=$impl_status"
if {![string match "write_bitstream Complete*" $impl_status]} {
    error "Implementation/bitstream failed: $impl_status"
}

open_run impl_1
report_utilization -file [file join $report_dir post_impl_utilization.rpt]
report_timing_summary -file [file join $report_dir post_impl_timing.rpt]
write_hw_platform -fixed -include_bit -force \
    -file [file join $project_dir color_test.xsa]
close_design
close_project
