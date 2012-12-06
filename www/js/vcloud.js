/**
 * @file vcloud.js
 * Testing vcloud-js-sdk.js
 * @author Alister Lewis-Bowen <alister@vmware.com>
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

        // Callback on successful bootstrap
        vcd.once(vmware.events.cloud.INITIALIZATION_COMPLETE, function() {
            console.log('SDK init complete');
            $('.form-login').show();
            $('.spinner').hide();
            if (localStorage.loggedin == '1') vcd.confirmLoggedIn();
            else logout();
        });

        // Register callback for SDK login method
        vcd.register(vmware.events.cloud.LOGIN, onLogin);

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
        $('.form-login').show();
    }

    /**
     * @method: initWorkspace
     * Render the authrnticated workspace
     */
    function initWorkspace () {
        $('.navbar').show();
        $('.machines').show();
    }

    init();

}(window.jQuery);
