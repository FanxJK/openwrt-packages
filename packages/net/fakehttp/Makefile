# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=fakehttp
PKG_VERSION:=0.9.12
PKG_RELEASE:=1

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/fakehttp
  SECTION:=net
  CATEGORY:=Network
  TITLE:=FakeHTTP
  URL:=https://github.com/MikeWang000000/FakeHTTP
  DEPENDS:=+kmod-nft-queue +kmod-nf-conntrack +iptables-mod-nfqueue +iptables-mod-conntrack-extra
  PKGARCH:=all
endef

define Package/fakehttp/description
  Obfuscate all your TCP connections into HTTP protocol, using Netfilter Queue (NFQUEUE).
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	wget -O $(PKG_BUILD_DIR)/fakehttp.gz https://github.com/MikeWang000000/FakeHTTP/releases/download/$(PKG_VERSION)/fakehttp-linux-x86_64.tar.gz
	gzip -d $(PKG_BUILD_DIR)/fakehttp.gz
endef

define Build/Compile
endef

define Package/fakehttp/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fakehttp $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/config
endef

define Package/fakehttp/conffiles
/etc/config/fakehttp
endef

$(eval $(call BuildPackage,fakehttp))
