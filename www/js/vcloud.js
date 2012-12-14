/**
 * @file vcloud.js
 * Playing with the VMware vcloud-js-sdk.js
 * @author Alister Lewis-Bowen <alister@different.com>
 */

!function ($) { // pass in jquery object

    'use strict';

    var vcd = {},       // vCloud JS SDK obejct
        user = {},      // Authenticated User details
        vapps = [],     // vApp objects
        templates = {}, // Template objects
        tasks = [],     // Task history
        metrics = [],   // Org stats
        networks = [],  // Available network names
        vdcs = [];      // Available VDC names

    /**
     * @method: init
     * Bootstrap the SDK and authenticate with vCD cell
     */
    function init () {
        $('#navbar').hide();
        $('#nav-progress').removeClass('clear');
        $('#workspace').hide();
        $('#login').hide();
        $('#spinner').show().center();

        // TODO: Might be nice to edit this in the UI
        if (localStorage.server === undefined) {
            localStorage.server = (window.location.href).split('/').
                slice(0,3).join('/');
        }

        // Bootstrap vCloud JS SDK lib
        vcd = new vmware.cloud(localStorage.server+"/api/",
            vmware.cloudVersion.V5_1);

        // TODO: Consider bypassing /versions API call in SDK bootstrap

        // Handle successful bootstrap - just once :)
        vcd.once(vmware.events.cloud.INITIALIZATION_COMPLETE, function() {
            console.info('SDK ready');
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
        vcd.register(vmware.events.cloud.TASK_START, function() { console.info('SDK task started'); });
        vcd.register(vmware.events.cloud.TASK_COMPLETE, function() { console.info('SDK task complete'); });

        // Handler for SDK errors
        vcd.register(vmware.events.cloud.ERROR, function(e) { console.error('SDK error: '+ e.eventData); });

        // Handlers for UI icons and buttons
        $('#login').submit(login);
        $('#nav-logout').click(logout);
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
                console.info('Logged into '+ vcd.getUserOrg() +' as '+ vcd.getUserName());
                localStorage.loggedin = '1';
            }
            else {
                console.warn('Session still exists');
            }
            $('#login').hide();
            initWorkspace();
        }
        else {
            if (e.eventData.confirm) {
                console.warn('Session expired');
                logout();
            }
            else {
                console.warn('Invalid credentials');
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
     * Initialize the UI
     */
    function initWorkspace () {
        if (localStorage.loggedin === '0') return; // not authenticated

        $('.nav-user span.org').text(vcd.getUserOrg());
        $('.nav-user span.user').text(vcd.getUserName());
        $('#nav-views a').click(function() { showView($(this).attr('href')); });
        $('#navbar').show();
        $('#nav-progress').addClass('clear');
        showView('#machines');
        $('#workspace').show();

        // Once the User is authentcated, the SDK calls the vcd.begin() method
        // to asynchronously make vCD API calls to populate the data model
        // with information about the available vApps, VMs, VDCs, Networks
        // and Org tasks and metrics.
        // So we're not blocked on waiting for the completion of these API
        // calls, we can quickly restore the data model from the browser local
        // browser storage, if available, and continue to render the UI...
        if (localStorage.vcdData) {
            vcd.loadCache(localStorage.vcdData);
            updateWorkspace();
        }

        // There's nothing to stop us getting extra information from vCD once
        // we have an authenticated session. This could also be saved and
        // restored from browser local storage if need be. Here are some
        // examples of using the SDK to make vCD API query and admin calls...
        fetchUserDetail();
        fetchUserRole();
    }

    /**
     * @method: fetchUserDetail
     * Example using the SDK make a vCD API query
     * @see http://www.vmware.com/pdf/vcd_15_api_guide.pdf
     *
     * Steps to retrieving the authenticated User details:
     * 1. GET /api/query?type=user&format=records&filter=name==[user_name]
     * 2. Populate user object with attributes of the returned UserRecord
     */
    function fetchUserDetail () {
        var url = vcd.base  // SDK stored end-point URL
                + 'query?type=user&format=records&filter=name=='
                + vcd.getUserName(),
            user1 = user;
        console.info('Custom vCD query: '+ url);

        vcd.fetchURL(url, 'GET', '', function (xml) {
            $(xml).find('UserRecord').each(function () {
                $.each(this.attributes, function (i, attrib){
                    user1[attrib.name] = attrib.value;
                    // TODO: Be nice if this record contained the role name
                });
            });
        });
    }

    /**
     * @method: fetchUserRole
     * Example using the SDK to make vCD API admin calls
     * @see http://www.vmware.com/pdf/vcd_15_api_guide.pdf
     *
     * Steps to retrieving the Users role
     * 1. Extract the Org Id from the Org URL
     * 2. GET /api/admin/org/{id} to get Organization object
     * 3. Extract the User URL to make the following call...
     * 4. GET /api/admin/user/{id} to get User object
     * 5. Extract the role name
     */
    function fetchUserRole () {
        var adminUrl = vcd.getAdminUrl();

        if (adminUrl !== undefined) { // check if user had admin rights

            var orgUrl = vcd.getUserOrgUrl(),
                orgId = orgUrl.substring(orgUrl.indexOf('/api/org/')+9, orgUrl.length),
                url = adminUrl +'org/'+ orgId,
                user1 = user;
            console.info('Custom vCD call: '+ url);

            vcd.fetchURL(url, 'GET', '', function (xml) {

                var url = $(xml).find('UserReference[name='+ vcd.getUserName() +']').attr('href'),
                    user2 = user1;
                console.info('Custom vCD call: '+ url);

                vcd.fetchURL(url, 'GET', '', function (xml) {
                    user2.roleName = $(xml).find('Role').attr('name');
                    $('#navbar span.nav-user').append(' ('+user2.roleName +')');
                });
            });
        }
        else {
            console.warn('The authenticated User does not have admin rights.');
        }
    }

    /**
     * @method: showView
     * Show the given view and hide other views
     */
    function showView (viewName) {
        var views = ['#machines', '#library', '#prefs'];
        for (var i=0; i<views.length;i++) {
            if (viewName === views[i]) {
                $('#nav-views a[href="'+ views[i] +'"]').parent().addClass('active');
                $(views[i]).show();
            }
            else {
                $('#nav-views a[href="'+ views[i] +'"]').parent().removeClass('active');
                $(views[i]).hide();
            }
        }
    }

    /**
     * @method: refresh
     * Tell the SDK to refresh the data model
     */
    function refresh () {
        $('#nav-progress').removeClass('clear');
        vcd.updateModels();
        vcd.getAllTemplates();
    }

    /**
     * @method: onRefresh
     * Store the data model and refresh data in the UI
     */
    function onRefresh () {
        $('#nav-progress').addClass('clear');
        console.info('SDK refreshed data model');

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
        vapps = vcd.getVApps(vcd.SORTBY.DATE),
        templates = vcd.getCatalog(),
        tasks = vcd.taskHistory().slice(0, 10),
        metrics = vcd.metrics(),
        networks = vcd.getNetworks(),
        vdcs = vcd.getVdcList();

        fetchMetadata();

        console.debug('User...'); console.dir(user);
        console.debug('Tasks...'); console.dir(tasks);
        console.debug('Metrics...'); console.dir(metrics);
        if (vdcs.length !== 0) {  console.debug('VDCs...'); console.dir(vdcs); }
        if (networks.length !==0) {  console.debug('Networks...'); console.dir(networks); }

        updateMachines();
        updateLibrary();

    }

    /**
     * @method fetchMetadata
     * Fetch the metadata for each vApp
     */
    function fetchMetadata () {
        var vapp;

        for (var i=0; i<vapps.length; i++) {

            vapp = vapps[i]

            vcd.metadata.register(
                vcd.metadata.get(vapp),
                function (data) {
                    if (data.favorite !== undefined) {
                        vapp.favorite(data.favorite);
                    }
                }
            );
        }
    }

    /**
     * @method onClickFavBtn
     * Handle the click event for the vApp favorite button
     */
    function onClickFavBtn () {
        var obj = getObject($(this).parents('tr').attr('id'));
        if (!obj.isVM()) toggleFav(obj);
    }

    /**
     * @method toggleFav
     * Toggle the favorite metadata attribute on the selected vApp
     * @param vapp vcd.vApp
     */
    function toggleFav (vapp) {
        var fav = 1;

        if (vapp.favorite() === 1) fav = 0;
        $('#nav-progress').removeClass('clear');

        vcd.metadata.register(
            vcd.metadata.set(vapp, 'favorite', fav),
            function () {
                $('#nav-progress').addClass('clear');
                vapp.favorite(fav);
                updateMachines();
            }
        );
    }

    /*
     * @method getObject
     * Return vApp, VM object based on given ID
     */
    function getObject (id) {
        for (var i=0; i<vapps.length; i++) {
            if (vapps[i].getID() === id) return vapps[i];
        }
    }

    /**
     * @method: updateWorkspace
     * Update the machines table
     * TODO: Might be nice to use a MVC/MVVM pattern like that provided by
     *       knockout.js
     */
    function updateMachines () {
        var vapp, vms, vm;

        $('#machines table tbody').empty();

        for (var i=0; i<vapps.length; i++) {
            vapp = vapps[i];
            $('<tr id="'+ vapp.getID() +'" rowspan="'+ vapp.getNumberOfVMs()
                +'"><td class="name">'+ vapp.getName()
                +'</td><td class="name">&ndash;</td>'
                +'</td><td class="ops">'+ favBtn(vapp)
                +'</td><td class="status">'+ vapp.getStatusMessage()
                +'</td><td class="desc">'+ vapp.getDescription()
                +'</td><td class="ip">&ndash;'
                +'</td></tr>').appendTo('#machines table tbody');

            vms = vapp.getChildren();
            for (var j=0; j<vms.length; j++) {
                vm = vms[j];
                $('<tr id="'+ vm.getID() +'"><td class="name">&ndash;'
                    +'</td><td class="name">'+ vm.getName()
                    +'</td><td class="ops"><span class="btn-toolbar btn-group">'
                    + playBtn(vm) + pauseBtn(vm) + stopBtn(vm)
                    +'</span></td>'
                    +'</td><td class="status">'+ vm.getStatusMessage()
                    +'</td><td class="desc">'+ vm.getDescription()
                    +'</td><td class="ip">'+ vm.getIP()
                    +'</td></tr>').appendTo('#machines table tbody');
            }

            // TODO: Test if click event already bound to these objects
            $('.op-fav').click(onClickFavBtn);
            //$('.op-play').click(playVM);
            //$('.op-pause').click(suspendVM);
            //$('.op-stop').click(stopVM);
        }
    }

    /**
     * @method: favBtn
     * Return the favorite button for the given vApp object
     * @param vapp vcd.vApp
     */
    function favBtn (vapp) {
        var fav = vapp.favorite(),
            icon = '<i class="'+ (fav === 1 ? 'icon-star' : 'icon-star-empty') + '">',
            btn  = '<a class="op-fav btn btn-mini" href="#">'+ icon +'</a>';
        return btn;
    }

    /**
     * @method: playBtn
     * Return the play button for the given VM object
     * @param vm vcd.VM
     */
    function playBtn (vm) {
        var enabled = (vm.canPowerOn() ? '' : ' disabled'),
            icon = '<i class="icon-play"></i>',
            btn = '<a class="op-play btn btn-mini'+ enabled +'" href="#">'+ icon + '</a>';
        return btn;
    }

    /**
     * @method: pauseBtn
     * Return the pause button for the given VM object
     * @param vm vcd.VM
     */
    function pauseBtn (vm) {
        var enabled = (vm.canSuspend() ? '' : ' disabled'),
            icon = '<i class="icon-pause"></i>',
            btn = '<a class="op-pause btn btn-mini'+ enabled +'" href="#">'+ icon + '</a>';
        return btn;
    }

    /**
     * @method: stopBtn
     * Return the stop button for the given VM object
     * @param vm vcd.VM
     */
    function stopBtn (vm) {
        var enabled = (vm.canPowerOff() ? '' : ' disabled'),
            icon = '<i class="icon-stop"></i>',
            btn = '<a class="op-stop btn btn-mini'+ enabled +'" href="#">'+ icon + '</a>';
        return btn;
    }
    /**
     * @method: updateLibrary
     * Update the library table
     * TODO: Might be nice to use a MVC/MVVM pattern like that provided by
     *       knockout.js
     */
    function updateLibrary () {
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
