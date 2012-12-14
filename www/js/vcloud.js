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

        fetchMetadata();

        // There's nothing to stop us getting extra information from vCD once
        // we have an authenticated session. This could also be saved and
        // restored from browser local storage if need be. Here are some
        // examples of using the SDK to make vCD API query and admin calls...
        fetchUserDetail();
        fetchUserRole();
    }

    /**
     * @method: fetchMetadata
     * Fetch specific metadata
     */
    function fetchMetadata () {
        // Use SDK metadata method to query 'favorite' (vApp metadata Number
        // type with key 'featured' and value 1 or more) vApps...
        vcd.metadata.register(vcd.metadata.filterVApps('favorite'), function(o) {
            console.dir(o);
        });
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
        fetchMetadata();
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

        // Show what what we're not rendering to the UI...
        console.debug('User...'); console.dir(user);
        console.debug('Tasks...'); console.dir(tasks);
        console.debug('Metrics...'); console.dir(metrics);
        if (vdcs.length !== 0) {  console.debug('VDCs...'); console.dir(vdcs); }
        if (networks.length !==0) {  console.debug('Networks...'); console.dir(networks); }

        updateMachines();
        updateLibrary();

    }

    /**
     * @method toggleFavorite
     * Toggle the favorite metadata attribute on the selected vApp
     */
    function toggleFavorite (e) {
        var icon = $(this).children('i'),
            obj = getObject($(this).parents('tr').attr('id')),
            fav = 1;

        if (!obj.isVM()) {  // check this is a vApp

            if (obj.favorite() === 1) fav = 0;
            $('#nav-progress').removeClass('clear');

            vcd.metadata.register(
                vcd.metadata.set(obj, 'favorite', fav),
                function () {
                    $('#nav-progress').addClass('clear');
                    obj.favorite(fav);
                    if (fav === 1) {
                        icon.removeClass('icon-star-empty');
                        icon.addClass('icon-star');
                    }
                    else {
                        icon.removeClass('icon-star');
                        icon.addClass('icon-star-empty');
                    }

                }
            );
        }
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
                +'</td><td class="ops"><a class="op-fav btn btn-mini" href="#"><i class="icon-star-empty"></i> Favorite</a></td>'
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
                    +'<a class="op-play btn btn-mini disabled" href="#"><i class="icon-play"></i></a>'
                    +'<a class="op-pause btn btn-mini disabled" href="#"><i class="icon-pause"></i></a>'
                    +'<a class="op-stop btn btn-mini disabled" href="#"><i class="icon-stop"></i></a>'
                    +'</span></td>'
                    +'</td><td class="status">'+ vm.getStatusMessage()
                    +'</td><td class="desc">'+ vm.getDescription()
                    +'</td><td class="ip">'+ vm.getIP()
                    +'</td></tr>').appendTo('#machines table tbody');
            }

            // TODO: Test if click event already bound to these objects
            $('.op-fav').click(toggleFavorite);
            //$('.op-play').click(playVM);
            //$('.op-pause').click(suspendVM);
            //$('.op-stop').click(stopVM);
        }
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
