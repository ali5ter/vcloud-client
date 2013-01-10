vcloud-client
=============

Very simple web client used to play the VMware vCloud Javascript SDK that comes
with the [SilverLining fling](http://labs.vmware.com/flings) in [VMware Labs](http://labs.vmware.com/flings).

<img src="https://github.com/ali5ter/vcloud-client/blob/master/docs/screenshots/vcloud-client-login.png?raw=true" width="32%"/>&nbsp;
<img src="https://github.com/ali5ter/vcloud-client/blob/master/docs/screenshots/vcloud-client-machines.png?raw=true" width="32%"/>&nbsp;
<img src="https://github.com/ali5ter/vcloud-client/blob/master/docs/screenshots/vcloud-client-library.png?raw=true" width="32%"/>

Installation
------------

This installs directly into your VMware vCloud Director cell. To install run:

    install

The install script can also watch any changes you make to the files under 
the www/ (document root) directory and install the them into the vCD dev
cell automatically. Just run the following in a seperate terminal session:

    install -w

References
----------

* [SilverLining fling](http://labs.vmware.com/flings).
* [VMware Technical Journal article about SilverLining](http://labs.vmware.com/publications/cloud-vmtj-winter2012).
* [VMware vCloud Director docs](https://www.vmware.com/support/pubs/vcd_pubs.html).
* [VMware vCloud Director API](http://www.vmware.com/go/vcloudapi).
