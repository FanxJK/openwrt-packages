#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

set -e

CURDIR="$(cd "$(dirname "$0")"; pwd)"
VERSION="$(curl -fsSL 'https://router.uu.163.com/api/plugin?type=openwrt-aarch64' | jq -er '.url | capture("/v(?<version>[^/]+)/").version')"
PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$CURDIR/Makefile")"

[ "$PKG_VERSION" != "$VERSION" ] || exit 0

for ARCH in aarch64 arm mipsel x86_64; do
    FILE_INFO="$(curl -fsSL "https://router.uu.163.com/api/plugin?type=openwrt-$ARCH")"
    FILE_MD5="$(printf '%s' "$FILE_INFO" | jq -er '.md5 | select(test("^[0-9a-f]{32}$"))')"
    FILE_VER="$(printf '%s' "$FILE_INFO" | jq -er '.url | capture("/v(?<version>[^/]+)/").version')"

    if [ "$FILE_VER" != "$VERSION" ]; then
        echo "Version mismatch: expected $VERSION, got $FILE_VER"
        exit 1
    fi

    TARBALL="$CURDIR/uu-$ARCH.tar.gz"
    curl -fsSL "http://uurouter.gdl.netease.com/uuplugin/openwrt-$ARCH/v$VERSION/uu.tar.gz" -o "$TARBALL"
    printf '%s  %s\n' "$FILE_MD5" "$TARBALL" | md5sum -c -
    FILE_HASH="$(sha256sum "$TARBALL" | awk '{print $1}')"
    sed -i "/(\$(ARCH),$ARCH)/{n;s/PKG_HASH:=.*/PKG_HASH:=$FILE_HASH/;}" "$CURDIR/Makefile"
    rm -f "$TARBALL"
done

sed -i "s/^PKG_VERSION:=.*/PKG_VERSION:=$VERSION/" "$CURDIR/Makefile"
