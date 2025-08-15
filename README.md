> **⚠️ This project is archived and no longer maintained.**

vcloud-client
=============

Trivial web client used to play the VMware vCloud Javascript SDK  that comes
with the [SilverLining fling](http://labs.vmware.com/flings/silverlining)
in [VMware Labs](http://labs.vmware.com/flings).

<img src="http://ali5ter.github.io/repository/images/vcloud-client-login.png?raw=true" width="32%"/>&nbsp;
<img src="http://ali5ter.github.io/repository/images/vcloud-client-machines.png?raw=true" width="32%"/>&nbsp;
<img src="http://ali5ter.github.io/repository/images/vcloud-client-library.png?raw=true" width="32%"/>

Documentation about how to use the SDK is supplied with the SilverLining fling distribution. Once downloaded and unpacked, it can be found under ```vcloud-js-sdk/vCloudDirectorJSSDK.pdf```.
This document is included in this repo for convenience under the ```docs``` directory.

Installation
------------

This installs directly into your VMware vCloud Director cell, so you'll 
need shell access to the machine running vCD. Clone this repo to that
machine and run:

    install

The install script can also watch any changes you make to the files under 
the www/ (document root) directory and install these changes automatically.
Just run the following in a seperate terminal session:

    install -w

References
----------

* [SilverLining fling](http://labs.vmware.com/flings/silverlining).
* [VMware Technical Journal article about SilverLining](http://labs.vmware.com/publications/cloud-vmtj-winter2012).
* [VMware vCloud Director docs](https://www.vmware.com/support/pubs/vcd_pubs.html).
* [VMware vCloud Director API](http://www.vmware.com/go/vcloudapi).
* [VMware vCloud Director Evaluation](https://my.vmware.com/web/vmware/evalcenter?p=vcloud-director15&lp=default:).
