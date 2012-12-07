/**
 * @file vcloud.js
 * Testing the VMware vcloud-js-sdk.js
 * @author Alister Lewis-Bowen <alister@different.com>
 */

!function ($) { // pass in jquery object

    'use strict';

    var vcd; // vCloud JS SDK obejct

    /**
     * @method: init
     * Bootstrap the SDK and authenticate with vCD cell
     */
    function init () {
        $('.spinner').show();

        if (localStorage.server === null) {
            localStorage.server = (window.location.href).split('/').
                slice(0,3).join('/');
        }

        // Bootstrap vCloud JS SDK lib
        vcd = new vmware.cloud(localStorage.server+"/api/",
            vmware.cloudVersion.V5_1);

        // TODO: /versions API call in SDK bootstrap can take over a minute to
        // complete!! Can this be bypassed?

        // Handle successful bootstrap - just once :)
        vcd.once(vmware.events.cloud.INITIALIZATION_COMPLETE, function() {
            console.log('SDK init complete');
            $('.form-login').show();
            $('.spinner').hide();
            if (localStorage.loggedin == '1') vcd.confirmLoggedIn();
            else logout();
        });

        // Handler for SDK login method
        vcd.register(vmware.events.cloud.LOGIN, onLogin);

        // Handler for SDK refresh of data model
        vcd.register(vmware.events.cloud.REFRESH_COMPLETE, onRefresh);

        // Handler for SDK task start and completion
        vcd.register(vmware.events.cloud.TASK_START, function() { console.log('SDK task started'); });
        vcd.register(vmware.events.cloud.TASK_COMPLETE, function() { console.log('SDK task complete'); });

        // Handler for SDK errors
        vcd.register(vmware.events.cloud.ERROR, function(e) { console.log('SDK error: '+ e.eventData); });

        // Register callback to initiate login
        $('.form-login').submit(login);

        // Register callback on logout link
        $('.logout').click(logout)
    }

    /**
     * @method: login
     * Attempt to authenticate with vCD
     */
    function login () {
        var org = $('input:text[name=org]').val(),
            usr = $('input:text[name=usr]').val(),
            pwd = $('input:password').val();
        if (org !== '' && usr !== '' && pwd !== '') {
            vcd.login(usr, pwd, org);
            $('.spinner').show();
        }
        return false; // prevent screen refresh
    }

    /**
     * @method: onLogin
     * Callback from SDK login method
     */
    function onLogin (e) {
        if (e.eventData.success) {
            if (!e.eventData.confirm) {
                console.log('Logged into '+ vcd.getUserOrg() +' as '+ vcd.getUserName());
                localStorage.loggedin = '1';
            }
            else {
                console.log('Session still exists');
            }
            $('.form-login').hide();
            initWorkspace();
        }
        else {
            if (e.eventData.confirm) {
                console.log('Session expired');
                logout();
            }
            else {
                console.log('Invalid credentials');
                $('input:password').val('');
            }
        }
        $('.spinner').hide();
    }

    /**
     * @method: logout
     * Clean up when logging out
     */
    function logout () {
        localStorage.loggedin = '0';
        $('.navbar').hide();
        $('.machines').hide();
        $('.form-login').show();
    }

    /**
     * @method: initWorkspace
     * Initialise the authrnticated UI
     */
    function initWorkspace () {
        $('.navbar').show();
        $('.machines').show();

        // Restore vcd data model so we have some data to work with
        // while SDK is refreshing it
        if (localStorage.vcdData) {
            vcd.loadCache(localStorage.vcdData);
            updateWorkspace();
        }
    }

    /**
     * @method: onRefresh
     * Store the data model and refresh data in the UI
     */
    function onRefresh () {
        console.log('SDK refreshed data model');

        // Save this updated data model so we can restore it and not block
        // the UI logic from rendering the workspace
        localStorage.vcdData = vcd.saveCache();

        updateWorkspace();
    }

    /**
     * @method: updateWorkspace
     * Update the data in the UI
     * TODO: Might be nice to use a MVC/MVVM pattern like that provided by
     *       knockout.js
     */
    function updateWorkspace () {
        var vapps = vcd.getVApps(vcd.SORTBY.DATE),
            tasks = vcd.taskHistory().slice(0, 10),
            metrics = vcd.metrics(),
            vapp = {},
            vm = {};

        for (var i=0; i<vapps.length; i++) {
            vapp = vapps[i];
            console.log('vApp name: '+ vapp.getName() +' VMs: '+ vapp.getNumberOfVMs());
        }
    }

    init();

}(window.jQuery);
