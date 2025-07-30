# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=fakesip
PKG_VERSION:=0.0.1
PKG_RELEASE:=1

PKG_SOURCE:=fakesip-linux-$(ARCH).tar.gz
PKG_SOURCE_URL:=https://github.com/MikeWang000000/FakeSIP/releases/download/$(PKG_VERSION)/

ifeq ($(ARCH),x86_64)
  PKG_HASH:=xx
endif

PKG_BUILD_DIR:=$(BUILD_DIR)/fakesip-linux-$(ARCH)

include $(INCLUDE_DIR)/package.mk

STRIP:=true

define Package/fakesip
	SECTION:=net
	CATEGORY:=Network
	TITLE:=FakeSIP
	URL:=https://github.com/MikeWang000000/FakeSIP
	DEPENDS:= +kmod-nft-queue
endef

define Package/fakesip/description
	Obfuscate all your TCP connections into HTTP protocol, using Netfilter Queue (NFQUEUE).
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	# Make sure the binary is executable
	chmod +x $(PKG_BUILD_DIR)/fakesip 2>/dev/null || true
endef

define Build/Compile
endef

define Package/fakesip/conffiles
/etc/config/fakesip
endef

define Package/fakesip/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fakesip $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/fakesip.config $(1)/etc/config/fakesip

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/fakesip.init $(1)/etc/init.d/fakesip
endef

$(eval $(call BuildPackage,fakesip))
