#!/bin/bash

set -e

CURDIR="$(cd "$(dirname "$0")"; pwd)"
VERSION="$1"
FILE_HASH="$2"
PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$CURDIR/Makefile")"

[ "${#FILE_HASH}" -eq 64 ]
[ "$PKG_VERSION" != "$VERSION" ] || exit 0

sed -i "s/^PKG_VERSION:=.*/PKG_VERSION:=$VERSION/" "$CURDIR/Makefile"
sed -i "/(\$(ARCH),x86_64)/{n;s/PKG_HASH:=.*/PKG_HASH:=$FILE_HASH/;}" "$CURDIR/Makefile"
