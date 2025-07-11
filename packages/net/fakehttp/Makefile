# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=fakehttp
PKG_VERSION:=0.9.18
PKG_RELEASE:=1

PKG_SOURCE:=fakehttp-linux-$(ARCH).tar.gz
PKG_SOURCE_URL:=https://github.com/MikeWang000000/FakeHTTP/releases/download/$(PKG_VERSION)/

ifeq ($(ARCH),x86_64)
  PKG_HASH:=0cdbe34277587b3e9ff8117e6130d5db8d716bb9c5143440884a527ed1d5bfc9
endif

PKG_BUILD_DIR:=$(BUILD_DIR)/fakehttp-linux-$(ARCH)

include $(INCLUDE_DIR)/package.mk

STRIP:=true

define Package/fakehttp
	SECTION:=net
	CATEGORY:=Network
	TITLE:=FakeHTTP
	URL:=https://github.com/MikeWang000000/FakeHTTP
	DEPENDS:= +kmod-nft-queue
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
