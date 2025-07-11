#!/bin/bash

set -x

export CURDIR="$(cd "$(dirname $0)"; pwd)"

curl -fsSL "https://api.github.com/repos/MikeWang000000/FakeHTTP/releases/latest" -o "$CURDIR/latest.json" || exit 1
VERSION="$(jq -r ".tag_name" "$CURDIR/latest.json" || exit 1)"
PKG_VERSION="$(awk -F "PKG_VERSION:=" '{print $2}' "$CURDIR/Makefile" | xargs)"
if [ "$PKG_VERSION" = "$VERSION" ]; then
    rm -f "$CURDIR/latest.json"
    exit 0
fi


sed -i "s,PKG_VERSION:=.*,PKG_VERSION:=$VERSION,g" "$CURDIR/Makefile"

for ARCH in "x86_64"; do
    if [ "$ARCH" = "x86_64" ]; then
        FILE_HASH=$(jq -r '.assets[] | select(.name=="fakehttp-linux-x86_64.tar.gz") | .digest' "$CURDIR/latest.json" | sed 's/^sha256://')
        if [ -z "$FILE_HASH" ]; then
            echo "Error: Failed to extract file hash from latest.json"
            rm -f "$CURDIR/latest.json"
            exit 1
        fi
    fi

    HASH_LINE="$(($(sed -n -e "/(\$(ARCH),$ARCH)/=" "$CURDIR/Makefile") + 1))"
    sed -i "${HASH_LINE}s/PKG_HASH:=.*/PKG_HASH:=$FILE_HASH/" "$CURDIR/Makefile"
done

rm -f "$CURDIR/latest.json"