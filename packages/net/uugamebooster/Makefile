# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=uugamebooster
PKG_VERSION:=9.0.0
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION)-$(ARCH).tar.gz
PKG_SOURCE_URL:=https://uu.gdl.netease.com/uuplugin/openwrt-$(ARCH)/v$(PKG_VERSION)/uu.tar.gz?
ifeq ($(ARCH),aarch64)
  PKG_HASH:=660059945376d8eefa6ed643b4450eb6cd13c8af63e3f758d10c1aa8ca57685f
else ifeq ($(ARCH),arm)
  PKG_HASH:=6d92b673b874b248babb4bc938d36c7997b94ad11684529e15b363537d054ec2
else ifeq ($(ARCH),mipsel)
  PKG_HASH:=ea1d7cd59fe3a6391cc8e3eeb8047e40826ce68fb17317a9465ac4c88aad8068
else ifeq ($(ARCH),x86_64)
  PKG_HASH:=37fb83e47fac97eadca8dade8015c4174902a54617a334c3775a5b69c0a013b8
endif

PKG_LICENSE:=Proprietary
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

include $(INCLUDE_DIR)/package.mk

STRIP:=true

TAR_CMD=$(HOST_TAR) -C $(1)/ $(TAR_OPTIONS)

define Package/uugamebooster
  SECTION:=net
  CATEGORY:=Network
  DEPENDS:=@(aarch64||arm||mipsel||x86_64) +kmod-tun
  TITLE:=NetEase UU Game Booster
  URL:=https://uu.163.com
endef

define Package/uugamebooster/description
  NetEase's UU Game Booster Accelerates Triple-A Gameplay and Market.
endef

define Build/Compile
endef

define Package/uugamebooster/conffiles
/.uuplugin_uuid
/usr/share/uugamebooster/uu.conf
endef

define Package/uugamebooster/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/uuplugin $(1)/usr/bin/uugamebooster
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/xtables-nft-multi $(1)/usr/bin/xtables-nft-multi

	$(INSTALL_DIR) $(1)/usr/share/uugamebooster
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/uu.conf $(1)/usr/share/uugamebooster/uu.conf

	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_CONF) ./files/uugamebooster.config $(1)/etc/config/uugamebooster
	$(INSTALL_BIN) ./files/uugamebooster.init $(1)/etc/init.d/uugamebooster
endef

$(eval $(call BuildPackage,uugamebooster))
