#!/usr/bin/env bash
# One-time (safe to re-run), as root: gives the photo store its own fixed-size disk, so photos can
# never fill the server's main disk. It's a 40 GB file formatted as a disk and mounted at
# /srv/hidl-media, remounted at every boot (/etc/fstab). The space is reserved right away.
#
#   sudo /opt/hidl/media/setup-disk.sh            (SIZE=40G by default)
set -euo pipefail
IMG=/srv/hidl-media.img
MNT=/srv/hidl-media
SIZE="${SIZE:-40G}"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
if [ ! -e "$IMG" ]; then
  free_gb=$(df --output=avail -BG / | tail -1 | tr -dc 0-9)
  need_gb=${SIZE%G}
  if [ "$free_gb" -lt $((need_gb + 20)) ]; then
    echo "Only ${free_gb} GB free; keeping at least 20 GB for everything else. Stopping." >&2
    exit 1
  fi
  fallocate -l "$SIZE" "$IMG"
  chmod 600 "$IMG"
  # nodiscard: otherwise formatting hands the reserved space straight back to the main disk.
  mkfs.ext4 -q -m 0 -E nodiscard -L hidl-media "$IMG"
  echo "Made $IMG ($SIZE)."
fi
# Reserve the whole size on the main disk (fills any holes; the contents don't change).
fallocate -l "$SIZE" "$IMG"

mkdir -p "$MNT"
grep -q "^$IMG " /etc/fstab || echo "$IMG $MNT ext4 loop,defaults,nofail,X-fstrim.notrim 0 2" >> /etc/fstab   # weekly fstrim would un-reserve the space
mountpoint -q "$MNT" || mount "$MNT"
mkdir -p "$MNT/meta" "$MNT/data"
chmod 700 "$MNT/meta" "$MNT/data"
df -h "$MNT"
