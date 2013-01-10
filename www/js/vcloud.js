/**
 * @file vcloud.js
 * Playing with the VMware vcloud-js-sdk.js
 * @author Alister Lewis-Bowen <alister@different.com>
 */

!function ($) { // pass in jquery object

    'use strict';

    /*global window*/
    /*global localStorage */
    /*global console */
    /*global vmware */
    /*global sprintf */
    /*global vApp */
    /*global vM */
    /*global Template */

    var vcd = {},       // vCloud JS SDK obejct
        user = {},      // Authenticated User details
        vapps = [],     // vApp objects - includes VM objects
        templates = {}, // Template objects
        tasks = [],     // Task history
        running = [],   // Running tasks
        metrics = [],   // Org stats
        networks = [],  // Available network names
        vdcs = [];      // Available VDC names

    /**
     * @method: init
     * Bootstrap the SDK and authenticate with vCD cell
     */
    function init () {
        $('#navbar').hide();
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
        vcd.register(vmware.events.cloud.TASK_START, function () {
            console.info('SDK task started'); refresh();
        });
        vcd.register(vmware.events.cloud.TASK_COMPLETE, function () { console.info('SDK task complete'); refresh(); });

        // Handler for SDK template search completion
        vcd.register(vmware.events.cloud.SEARCH_COMPLETE, function (results) {
            console.info('SDK template search complete...'); console.dir(results);
        });

        // Handler for SDK errors
        vcd.register(vmware.events.cloud.ERROR, function (e) {
            console.error('SDK error: '+ e.eventData);
            showAlert(e.eventData, 'error');
        });

        $('#login').submit(login);
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
                console.info(sprintf('Logged into %s as %s',
                            vcd.getUserOrg(), vcd.getUserName()));
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
        $('#search').submit(onSearch);
        $('#nav-logout').click(logout);
        $('#nav-refresh').click(refresh);
        $('#machines').delegate('.op-fav', 'click', function () { onBtnClick(this, 'fav'); });
        $('#machines').delegate('.op-edit', 'click', function () { onBtnClick(this, 'edit'); });
        $('#machines').delegate('.op-del', 'click', function () { onBtnClick(this, 'del'); });
        $('#machines').delegate('.op-play', 'click', function () { onBtnClick(this, 'play'); });
        $('#machines').delegate('.op-pause', 'click', function () { onBtnClick(this, 'pause'); });
        $('#machines').delegate('.op-stop', 'click', function () { onBtnClick(this, 'stop'); });
        $('#library').delegate('.op-instantiate', 'click', function () { onBtnClick(this, 'instantiate'); });
        $('#navbar').show();
        $('#workspace').show();
        showView('#machines');

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
        var url = sprintf('%squery?type=user&format=records&filter=name==%s',
                vcd.base, vcd.getUserName()),
            user1 = user;

        console.info('Custom vCD query: '+ url);
        $('#nav-progress').show();

        vcd.fetchURL(url, 'GET', '', function (xml) {
            $(xml).find('UserRecord').each(function () {
                $('#nav-progress').hide();
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
                url = sprintf('%sorg/%s', adminUrl, orgId),
                user1 = user;

            console.info(sprintf('Custom vCD call: %s', url));
            $('#nav-progress').show();

            vcd.fetchURL(url, 'GET', '', function (xml) {

                var url = $(xml).find(sprintf('UserReference[name=%s]', vcd.getUserName())).attr('href'),
                    user2 = user1;

                console.info(sprintf('Custom vCD call: %s', url));

                vcd.fetchURL(url, 'GET', '', function (xml) {
                    $('#nav-progress').hide();
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
        var views = ['#machines', '#library', '#prefs'],
            link;

        for (var i=0; i<views.length;i++) {
            link = $(sprintf('#nav-views a[href="%s"]', views[i])).parent();
            if (viewName === views[i]) {
                link.addClass('active');
                $('body').addClass(views[i]);
                $(views[i]).show();
            }
            else {
                link.removeClass('active');
                $('body').removeClass(views[i]);
                $(views[i]).hide();
            }
        }
    }

    /**
     * @method: refresh
     * Tell the SDK to refresh the data model
     */
    function refresh () {
        $('#nav-progress').show();
        vcd.updateModels();
        vcd.getAllTemplates();
        vcd.taskManager.update();
    }

    /**
     * @method: onRefresh
     * Store the data model and refresh data in the UI
     */
    function onRefresh () {
        $('#nav-progress').hide();
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
        running = runningTasks(),
        metrics = vcd.metrics(),
        networks = vcd.getNetworks(),
        vdcs = vcd.getVdcList();
        fetchMetadata();

        console.debug('User...'); console.dir(user);
        console.debug('Task history...'); console.dir(tasks);
        console.debug('Running tasks...'); console.dir(running);
        console.debug('Metrics...'); console.dir(metrics);
        if (vdcs.length !== 0) {  console.debug('VDCs...'); console.dir(vdcs); }
        if (networks.length !==0) {  console.debug('Networks...'); console.dir(networks); }

        updateMachines();
        updateLibrary();

    }

    /**
     * @method runningTasks
     * Return an array of running tasks
     */
    function runningTasks () {
        var running = [];
        var tasks = vcd.taskManager.taskLog();

        for (var i=0; i<tasks.length; i++) {
            // The log record in the task log contains the following array
            // elements: owner, description, timestamp, status, task_url
            if (tasks[i][3] === 'running') {
                running.push(vcd.taskManager.details(tasks[i][4]));
            }
        }

        return running;
    }

    /**
     * @method fetchMetadata
     * Fetch the metadata for each vApp
     */
    function fetchMetadata () {
        var vapp;

        $('#nav-progress').show();

        for (var i=0; i<vapps.length; i++) {

            vapp = vapps[i];

            vcd.metadata.register(
                vcd.metadata.get(vapp), function (data) {
                    $('#nav-progress').hide();
                    // set vapp favorite if defined in metadata
                    if (data.favorite !== undefined) {
                        vapp.favorite(data.favorite);
                    }
             });
        }
    }

    /**
     * @method onBtnClick
     * Handle the click event for a vApp/VM button
     * @param obj DOMObject
     * @param op String fav|edit|del|play|stop|pause
     */
    function onBtnClick (obj, op) {
        var _obj = getObject($(obj).parents('tr').attr('id')),
            timestamp = Math.round(new Date().getTime() / 1000),
            name = sprintf('VAPP-%s', timestamp),
            desc = sprintf('Updated: %s', timestamp);

        switch(_obj.constructor) {
            case vApp:
                switch(op) {
                    case 'fav':
                        toggleFav(_obj);
                        break;
                    case 'edit':
                        // TODO: Allow these values to be edited :)
                        _obj.edit(name,desc);
                        break;
                    case 'del':
                        if (_obj.canDelete()) _obj.deleteVApp();
                        break;
                }
            case vM:
                switch(op) {
                    case 'play':
                        if (_obj.canPowerOn()) _obj.powerOn();
                        break;
                    case 'stop':
                        if (_obj.canPowerOff()) _obj.powerOff();
                        break;
                    case 'pause':
                        if (_obj.canSuspend()) _obj.suspend();
                        break;
                }
                break;
            case Template:
                if (op === 'instantiate') createVapp(_obj);
                break;
        }
    }

    /**
     * @method toggleFav
     * Toggle the favorite metadata attribute on the selected vApp
     * @param vapp vcd.vApp
     */
    function toggleFav (vapp) {
        var fav = 1;

        if (vapp.favorite() === 1) fav = 0;
        $('#nav-progress').show();

        vcd.metadata.register(
            vcd.metadata.set(vapp, 'favorite', fav),
            function () {
                $('#nav-progress').hide();
                vapp.favorite(fav);
                updateMachines();
            }
        );
    }

    /*
     * @method getObject
     * Return vApp/VM/Template object based on given ID
     * @param id urn
     * @returns array
     */
    function getObject (id) {
        var vms, i;

        if (id.match('vAppTemplate')) {
            for (i=0; i<templates.length; i++) {
                if (templates[i].getHref() === id) return templates[i];
            }
        }
        else {
            for (i=0; i<vapps.length; i++) {
                if (vapps[i].getID() === id) return vapps[i];
                vms = vapps[i].getChildren();
                for (var j=0; j<vms.length; j++) {
                    if (vms[j].getID() === id) return vms[j];
                }
            }
        }
    }

    /**
     * @method: showAlert
     * Render a notification
     * @see http://twitter.github.com/bootstrap/components.html#alerts
     * @param msg String
     * @param type success(default)|info|warning|error
     */
    function showAlert (msg, type) {
        var type = type || 'success',
            title = {
                'success': 'Success!',
                'info': 'Information',
                'block': 'Warning!',
                'error': 'Error!'
            },
            html = [];

        if (type === 'warning') type = 'block';

        html.push(sprintf('<div class="alert alert-%s">', type));
        html.push('<button type="button" class="close" data-dismiss="alert">&times;</button>');
        html.push(sprintf('<h4>%s</h4>%s</div>', title[type], msg));
        $(html.join('')).prependTo('#workspace');
    }

    /**
     * @method: updateWorkspace
     * Update the machines table
     * TODO: Nicer to use an MVC/MVVM pattern like that provided by knockout,
     *       ember or angular.
     */
    function updateMachines () {
        var vapp, vms;
        $('#machines table tbody').empty();
        for (var i=0; i<vapps.length; i++) {
            vapp = vapps[i];
            $(vAppRow(vapp)).appendTo('#machines table tbody');
            vms = vapp.getChildren();
            for (var j=0; j<vms.length; j++) {
                $(vmRow(vms[j])).appendTo('#machines table tbody');
            }
        }
    }

    /**
     * @method: vAppRow
     * Return representation of a vApp table row
     * @param vapp vcd.vApp
     */
    function vAppRow (vapp) {
        var html = [];
        html.push(sprintf('<tr id="%s" class="vapp%s" rowspan="%s">',
            vapp.getID(), (hasTask(vapp.getID()) ? ' busy' : ''), vapp.getNumberOfVMs()));
        html.push(sprintf('<td class="vapp name">%s</td>', vapp.getName()));
        html.push('<td class="vm name">&ndash;</td>');
        html.push('<td class="ops"><span class="btn-toolbar btn-group">');
        html.push(favBtn(vapp));
        html.push(editBtn(vapp));
        html.push(delBtn(vapp));
        html.push('</span></td>');
        html.push(sprintf('<td class="status">%s</td>', vapp.getStatusMessage()));
        html.push(sprintf('<td class="desc">%s</td>', vapp.getDescription() || ''));
        html.push('<td class="ip">&ndash;</td>');
        html.push('</tr>');
        return html.join('');
    }

    /**
     * @method: favBtn
     * Return the favorite button for the given vApp object
     * @param vapp vcd.vApp
     */
    function favBtn (vapp) {
        var fav = vapp.favorite(),
            icon = sprintf('<i class="%s"></i>', (fav ? 'icon-star' : 'icon-star-empty')),
            btn  = sprintf('<a class="op-fav btn btn-mini" href="#">%s</a>', icon);
        return btn;
    }

    /**
     * @method: delBtn
     * Return the delete button for the given vApp object
     * @param vapp vcd.vApp
     */
    function delBtn (vapp) {
        var enabled = (vapp.canDelete() ? '' : ' disabled'),
            icon = '<i class="icon-trash"></i>',
            btn = sprintf('<a class="op-del btn btn-mini%s" href="#">%s</a>', enabled, icon);
        return btn;
    }

    /**
     * @method: editBtn
     * Return the edit button for the given vApp object
     * @param vapp vcd.vApp
     */
    function editBtn (vapp) {
       var  icon = '<i class="icon-edit"></i>',
            btn = sprintf('<a class="op-edit btn btn-mini" href="#">%s</a>', icon);
        return btn;
    }

    /**
     * @method: vmRow
     * Return representation of a VM table row
     * @param vm vcd.vM
     */
    function vmRow (vm) {
        var html = [];
        html.push(sprintf('<tr id="%s" class="vm%s">', vm.getID(), (hasTask(vm.getID()) ? ' busy' : '')));
        html.push('<td class="vapp name">&ndash;</td>');
        html.push(sprintf('<td class="vm name">%s</td>', vm.getName()));
        html.push('<td class="ops"><span class="btn-toolbar btn-group">');
        html.push(playBtn(vm));
        html.push(pauseBtn(vm));
        html.push(stopBtn(vm));
        html.push('</span></td>');
        html.push(sprintf('<td class="status">%s</td>', vm.getStatusMessage()));
        html.push(sprintf('<td class="desc">%s</td>', vm.getDescription() || ''));
        html.push(sprintf('<td class="ip">%s</td>', vm.getIP()));
        html.push('</tr>');
        return html.join('');
    }

    /**
     * @method hasTask
     * Return true if given object id has a running task associated with it
     * @param id|href
     */
    function hasTask (id) {
        var ids = vcd.taskManager.inProgress();
        for (var i=0; i<ids.length; i++) {
            if (id.match(ids[i])) return true;
        }
        return false;
    }

    /**
     * @method: playBtn
     * Return the play button for the given VM object
     * @param vm vcd.VM
     */
    function playBtn (vm) {
        var enabled = (vm.canPowerOn() ? '' : ' disabled'),
            icon = '<i class="icon-play"></i>',
            btn = sprintf('<a class="op-play btn btn-mini%s" href="#">%s</a>', enabled, icon);
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
            btn = sprintf('<a class="op-pause btn btn-mini%s" href="#">%s</a>', enabled, icon);
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
            btn = sprintf('<a class="op-stop btn btn-mini%s" href="#">%s</a>', enabled, icon);
        return btn;
    }

    /**
     * @method: updateLibrary
     * Update the library table
     * TODO: Nicer to use an MVC/MVVM pattern like that provided by knockout,
     *       ember or angular.
     */
    function updateLibrary () {
        $('#library table tbody').empty();
        for (var i=0; i<templates.length; i++) {
            $(templateRow(templates[i])).appendTo('#library table tbody');
        }
    }

    /**
     * @method: templateRow
     * Return representation of a template table row
     * @param tmpl vcd.Template
     */
    function templateRow (tmpl) {
        var html = [];
        html.push(sprintf('<tr id="%s" class="%s">', tmpl.getHref(), (hasTask(tmpl.getHref()) ? 'busy' : '')));
        html.push(sprintf('<td class="name">%s</td>', tmpl.getName()));
        html.push(sprintf('<td class="desc">%s</td>', tmpl.getDescription() || ''));
        html.push(sprintf('<td class="vms">%s</td>', tmpl.getAttr('numberOfVMs')));
        html.push(sprintf('<td class="cpu">%s</td>', tmpl.getCPUMhz()));
        html.push(sprintf('<td class="memory">%s</td>', tmpl.getMemoryMB()));
        html.push(sprintf('<td class="storage">%s</td>',
            Math.floor(tmpl.getStorageKB()/1024).toFixed(0)));
        html.push(sprintf('<td class="ops">%s</td>', createVappBtn(tmpl)));
        html.push('</tr>');
        return html.join('');
    }

    /**
     * @method: createVappBtn
     * Return the instantiate button for the given Template object
     * @param tmpl vcd.Template
     */
    function createVappBtn (tmpl) {
        var icon = '<i class="icon-plus"></i>',
            btn = sprintf('<a class="op-instantiate btn btn-mini" href="#">%s</a>', icon);
        return btn;
    }

    /**
     * @method: createVApp
     * Instantiate a Template to create a vApp
     */
    function createVapp (tmpl) {
        // TODO: Allow edit of these parameters
        var timestamp = Math.round(new Date().getTime() / 1000),
            name = sprintf('%s-%s', tmpl.getName(), timestamp),
            desc = tmpl.getDescription() || sprintf('Created: %s', timestamp),
            vdc = vdcs[0],          // take the first VDC available
            network = networks[0],  // take the first Network available
            template = tmpl.getHref(),
            powerOn = true;         // power on after instantiate

        $('#nav-progress').show();

        /**
         * The SDKs instantiation method is currently very limited, e.g.
         * instantiation will fail if the template needs any EULA approvals.
         * The SDK would have to provide some way to know if one was present
         * and provide a mechanism to show and approve it.
         */
        if (vcd.instantiateVApp(name, desc, vdc, network, template, powerOn)) {
            console.debug(sprintf('SDK is instantiating vApp: %s', name));
        }
        else {
            console.debug(sprintf('SDK could not instantiate template: %s', tmpl.getName()));
            $('#nav-progress').hide();
        }
    }

    /**
     * @method: onSearch
     * Search vApps or Templates
     */
    function onSearch () {
        var isMachineView = ($('body').attr('class').indexOf('machines') !== -1 ? true : false),
            searchTerm = $('#search input').val().toLowerCase();

        if (isMachineView) {
            $('#machines table tbody tr').hide();
            $('#machines table tbody td').each(function () {
                if ($(this).text().indexOf(searchTerm) !== -1) {
                    $(this).parents('tr').show();
                }
            });
        }
        else { // Library View
            $('#library table tbody tr').hide();
            $('#library table tbody td').each(function () {
                if ($(this).text().indexOf(searchTerm) !== -1) {
                    $(this).parents('tr').show();
                }
            });

            // Examples of using SDK to return a set of Template objects 
            // based on a search term or set of facets...
            vcd.searchCatalog(searchTerm);
            vcd.searchCatalogFaceted({
                'name': '',      // template name
                'owner': '',     // template owner username
                'catalog': '',   // catalog name
                'cpu': '0-2',    // cpu Mhz range, '-'=any, e.g. '0-2', '3-4', '4-'
                'memory': '-',   // memory MB range, '-'=any, e.g. '0-127', '128-256', '256-1024', '1024-'
                'storage': '-',  // storage KB range, '-'=any, e.g. '0-199999', '200000-399999', '4000000-'
                'searchTerm': '' // general search term which is not a facet
            });
        }
        return false; // prevent screen refresh
    }

    init();

}(window.jQuery);
