# Linux Mount

To mount a new disk on Linux, find it with lsblk, create a filesystem with mkfs, make a mount point, then add a line to the fstab file using the partition UUID so it mounts at boot. Run mount with the all flag to test and check dmesg for errors.
