# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=fakehttp
PKG_VERSION:=0.9.13
PKG_RELEASE:=1

PKG_SOURCE:=fakehttp-linux-x86_64.tar.gz
PKG_SOURCE_URL:=https://github.com/MikeWang000000/FakeHTTP/releases/download/$(PKG_VERSION)/
PKG_HASH:=a1c50d5c435934b64e004d02c4d3c439317770e9884d5a5ef077f58dece1e62a

PKG_BUILD_DIR:=$(BUILD_DIR)/fakehttp-linux-x86_64

include $(INCLUDE_DIR)/package.mk

STRIP:=true

define Package/fakehttp
	SECTION:=net
	CATEGORY:=Network
	TITLE:=FakeHTTP
	URL:=https://github.com/MikeWang000000/FakeHTTP
	DEPENDS:=@x86_64 +kmod-nft-queue
endef

define Package/fakehttp/description
	Obfuscate all your TCP connections into HTTP protocol, using Netfilter Queue (NFQUEUE).
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	# Make sure the binary is executable
	chmod +x $(PKG_BUILD_DIR)/fakehttp 2>/dev/null || true
endef

define Build/Compile
endef

define Package/fakehttp/conffiles
/etc/config/fakehttp
endef

define Package/fakehttp/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fakehttp $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/fakehttp.config $(1)/etc/config/fakehttp

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/fakehttp.init $(1)/etc/init.d/fakehttp
endef

$(eval $(call BuildPackage,fakehttp))
