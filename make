#!/bin/bash
#
# @file make
# ☆  Script for building and installing this test
# @author Alister Lewis-Bowen <alister@vmware.com>
#

#
# A timestamp
#
TIMESTAMP=$(date +"%F-%H%M%S")
#
# SilverLining src directory
#
SL_SRC=www
#
# Official Build war file name
#
WAR=ui-vcloud-webapp-1.0.0.war
#
# Back up war file name
#
BACKUP=${WAR}.$TIMESTAMP.bak
#
# Source Tree Build target directory
#
ST_TARGET=ui/ssui/ui-vcloud-webapp/target/ui-vcloud-webapp-1.0.0
#
# Source Tree base directory
#
ST_BASE=${VCLOUD_SRC_ROOT:-'.'}
#
# Default vCloud JS SDK src directory
#
SDK_SRC=${VCLOUD_JS_SDK_ROOT:-'../vcloud-js-sdk'};

function _failWith {
    echo 'failed'; echo $1; echo
    exit 0
}

function _mkdir {
    [ -d $1 ] && rm -fR $1
    mkdir -p $1 2>/dev/null
}

function _refreshSdk {
    echo -n 'Retrieving vCloud JS SDK... '
    git clone git://gitorious.eng.vmware.com/vcloud-js-sdk/vcloud-js-sdk.git \
vcloud-js-sdk &>/dev/null
    mv vcloud-js-sdk/vcloud-js-sdk*.js $SL_SRC/js/lib/
    rm -fR vcloud-js-sdk
    echo 'done'
    echo
}

function _setSdkSrcDir {
    echo -n "Where is your vcloud-js-sdk src tree? [$SDK_SRC] "
    read srcDir
    [ ! -z "$srcDir" ] && SDK_SRC=$srcDir;
    echo
}

function _copySdk {
    echo -n 'Copying vCloud JS SDK... '
    [ ! -d $SDK_SRC ] && _failWith "Unable to find a SDK src tree directory at $SDK_SRC"
    cp $SDK_SRC/vcloud-js-sdk*.js $SL_SRC/js/lib/
    echo 'done'
    echo
}

function _setVcdSrcDir {
    echo -n "Where is your vCD src tree? [$ST_BASE] "
    read srcDir
    [ ! -z "$srcDir" ] && ST_BASE=$srcDir
    echo
}

function _installIntoP4Source {
    echo -n 'Installing SilverLining into your src tree... '
    ST_TARGET=$ST_BASE/$ST_TARGET
    [ ! -d $ST_TARGET ] && _failWith "Unable to find a src tree directory at $ST_TARGET"
    local dir=$ST_TARGET/vcloud-js-sdk-test
    _mkdir $dir
    cp -r $SL_SRC/* $dir/
    echo 'done'
    echo
}

function _help {
    local helpText="
Internal make script for vCloud SDK test

With no option this script will install this test into the vCD src tree
sync'ed from perforce.

Usage: make <option>
-rs, --refresh-sdk     fetch the SDK lib from git and place into current
                       SilverLining doc root
-cs, --copy-sdk        copy the SDK lib from a local vCloud JS SDK src tree
                       and place into current SilverLining doc root
-id, --install-dev     install current SilverLining doc root into a a vCD src tree

For further information, refer to https://wiki.eng.vmware.com/CloudDirector/Projects/SilverLining
"
    echo "$helpText"
}

case "$1" in
    --help|-h)
        _help
        ;;
    #
    # Fetch SDK lib from git and place them into this src tree
    #
    --refresh-sdk|-rs)
        _refreshSdk
        ;;
    #
    # Copy SDK lib from local SDK src tree and place them into this src tree
    #
    --copy-sdk|-cs)
        _setSdkSrcDir
        _copySdk
        ;;
    #
    # Copy current SilverLining doc root into correct position in vCD src tree
    #
    --install-dev|-id|*)
        _setVcdSrcDir
        _installIntoP4Source
        echo "Test  was installed successfully at $ST_TARGET"
        echo 'Go to http://[your_cell_host_and_port]/cloud/vcloud-js-sdk-test/index.html'
        echo
        ;;
esac
