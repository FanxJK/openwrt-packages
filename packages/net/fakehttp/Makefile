# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=fakehttp
PKG_VERSION:=0.9.12
PKG_RELEASE:=1

PKG_SOURCE:=fakehttp-linux-x86_64.tar.gz
PKG_SOURCE_URL:=https://github.com/MikeWang000000/FakeHTTP/releases/download/$(PKG_VERSION)/
PKG_HASH:=c4fe9224abd090afe349e8eb21e53b7c4e3fb53eae8a2293db964450f063a57e

include $(INCLUDE_DIR)/package.mk

STRIP:=true

TAR_CMD=$(HOST_TAR) -C $(1)/ $(TAR_OPTIONS)

define Package/fakehttp
  SECTION:=net
  CATEGORY:=Network
  TITLE:=FakeHTTP
  URL:=https://github.com/MikeWang000000/FakeHTTP
  DEPENDS:=+kmod-nft-queue +kmod-nf-conntrack +iptables-mod-nfqueue +iptables-mod-conntrack-extra
endef

define Package/fakehttp/description
  Obfuscate all your TCP connections into HTTP protocol, using Netfilter Queue (NFQUEUE).
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
