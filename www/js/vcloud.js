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
        $('#spinner').show().center();

        // TODO: Might be nice to edit this in the UI
        if (localStorage.server === undefined) {
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
            $('#login').show();
            $('#spinner').hide();
            if (localStorage.loggedin == '1') vcd.confirmLoggedIn();
            else logout();
        });

        // Handler for SDK login method
        vcd.register(vmware.events.cloud.LOGIN, onLogin);

        // Handlers for SDK refresh of data model
        vcd.register(vmware.events.cloud.REFRESH_COMPLETE, onRefresh);
        vcd.register(vmware.events.cloud.TEMPLATE_REFRESH, onRefresh);

        // Handler for SDK task start and completion
        vcd.register(vmware.events.cloud.TASK_START, function() { console.log('SDK task started'); });
        vcd.register(vmware.events.cloud.TASK_COMPLETE, function() { console.log('SDK task complete'); });

        // Handler for SDK errors
        vcd.register(vmware.events.cloud.ERROR, function(e) { console.log('SDK error: '+ e.eventData); });

        // Register callback to initiate login
        $('#login').submit(login);

        // Register callback on logout link
        $('#nav-logout').click(logout);

        // Register callback on refresh link
        $('#nav-refresh').click(refresh);
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
            $('#spinner').show().center();
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
            $('#login').hide();
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
        $('#spinner').hide();
    }

    /**
     * @method: logout
     * Clean up when logging out
     */
    function logout () {
        localStorage.loggedin = '0';
        $('#navbar').hide();
        $('#workspace').hide();
        $('#spinner').hide();
        $('#login').show();
    }

    /**
     * @method: initWorkspace
     * Initialise the authrnticated UI
     */
    function initWorkspace () {
        $('.nav-user span.org').text(vcd.getUserOrg());
        $('.nav-user span.user').text(vcd.getUserName());
        $('#navbar').show();
        $('#workspace').show();

        // Restore vcd data model so we have some data to work with
        // while SDK is refreshing it
        if (localStorage.vcdData) {
            vcd.loadCache(localStorage.vcdData);
            updateWorkspace();
        }
    }

    /**
     * @method: refresh
     * Tell the SDK to refresh the data model
     */
    function refresh () {
        $('#nav-progress').toggleClass('clear');
        vcd.updateModels();
        vcd.getAllTemplates();
    }

    /**
     * @method: onRefresh
     * Store the data model and refresh data in the UI
     */
    function onRefresh () {
        $('#nav-progress').toggleClass('clear');
        console.log('SDK refreshed data model');

        // Save this updated data model so we can restore it and not block
        // the UI logic from rendering the workspace
        localStorage.vcdData = vcd.saveCache();

        updateWorkspace();
    }

    /**
     * @method: updateWorkspace
     * Update the data in the UI
     */
    function updateWorkspace () {
        var vapps = vcd.getVApps(vcd.SORTBY.DATE),
            templates = vcd.getCatalog(),
            tasks = vcd.taskHistory().slice(0, 10),
            metrics = vcd.metrics(),
            networks = vcd.getNetworks(),
            vdcs = vcd.getVdcList();

        console.log('Available VDCs : '+ vdcs);
        console.log('Available Networks : '+ networks);

        updateMachines(vapps);
        updateLibrary(templates);

    }

    /**
     * @method: updateWorkspace
     * Update the machines table
     * TODO: Might be nice to use a MVC/MVVM pattern like that provided by
     *       knockout.js
     */
    function updateMachines (vapps) {
        var vapp, vms, vm;

        $('#machines table tbody').empty();

        for (var i=0; i<vapps.length; i++) {
            vapp = vapps[i];
            $('<tr rowspan="'+ vapp.getNumberOfVMs()
                +'"><td class="name">'+ vapp.getName()
                +'</td><td class="name">&ndash;</td>'
                +'</td><td class="status">'+ vapp.getStatusMessage()
                +'</td><td class="desc">'+ vapp.getDescription()
                +'</td><td class="ip">&ndash;'
                +'</td></tr>').appendTo('#machines table tbody');

            vms = vapp.getChildren();
            for (var j=0; j<vms.length; j++) {
                vm = vms[j];
                $('<tr><td class="name">&ndash;'
                    +'</td><td class="name">'+ vm.getName()
                    +'</td><td class="status">'+ vm.getStatusMessage()
                    +'</td><td class="desc">'+ vm.getDescription()
                    +'</td><td class="ip">'+ vm.getIP()
                    +'</td></tr>').appendTo('#machines table tbody');
            }
        }
    }

    /**
     * @method: updateLibrary
     * Update the library table
     * TODO: Might be nice to use a MVC/MVVM pattern like that provided by
     *       knockout.js
     */
    function updateLibrary (templates) {
        var tmpl, vms;

        $('#library table tbody').empty();

        for (var i=0; i<templates.length; i++) {
            tmpl = templates[i];
            $('<tr><td class="name">'+ tmpl.getName()
                +'</td><td class="desc">'+ tmpl.getDescription()
                +'</td><td class="featured"></td>'
                +'</td><td class="downloads">'+ tmpl.getDownloads()
                +'</td></tr>').appendTo('#library table tbody');
            }
        }

    init();

}(window.jQuery);
