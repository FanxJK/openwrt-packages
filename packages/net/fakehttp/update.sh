#!/bin/bash

set -x

export CURDIR="$(cd "$(dirname $0)"; pwd)"

curl -fsSL "https://api.github.com/repos/MikeWang000000/FakeHTTP/releases/latest" -o "$CURDIR/latest.json" || exit 1
VERSION="$(jq -r ".tag_name" "$CURDIR/latest.json" || exit 1)"
PKG_VERSION="$(awk -F "PKG_VERSION:=" '{print $2}' "$CURDIR/Makefile" | xargs)"
[ "$PKG_VERSION" != "$VERSION" ] || exit 0

PKG_HASH=$(jq -r '.assets[] | select(.name=="fakehttp-linux-x86_64.tar.gz") | .digest' "$CURDIR/latest.json" | sed 's/^sha256://')

sed -i "s,PKG_VERSION:=.*,PKG_VERSION:=$VERSION,g" "$CURDIR/Makefile"
sed -i "s,PKG_HASH:=.*,PKG_HASH:=$PKG_HASH,g" "$CURDIR/Makefile"

rm -f "$CURDIR/latest.json"