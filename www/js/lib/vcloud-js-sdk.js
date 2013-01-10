/** @license VMware Cloud Director JavaScript SDK Library
 *
 * Copyright (c) 2012 VMware, Inc. All rights reserved.
 *
 */

var vmware = (typeof vmware == "undefined" || !vmware) ? {} : vmware;
vmware.events = (typeof vmware.events == "undefined" || !vmware.events) ? {} : vmware.events;

var global;
var global2;

var imageData;
vmware.cloudVersion = {
    V1_0: "1.0",
    V1_5: "1.5",
    V5_1: "5.1"
};

var connectivity = 1;

vmware.events.cloud = {
    INITIALIZATION_COMPLETE: 'event.cloud.initialization.complete',
    LOGIN: 'event.cloud.login',
    TASK_START: 'event.cloud.task.start.',
    TASK_COMPLETE: 'event.cloud.task.complete.',
    REFRESH_COMPLETE: 'event.cloud.refresh.complete',
    REFRESH_SINGLE: 'event.cloud.refresh.single',
    TEMPLATE_REFRESH: 'event.cloud.template.refresh',
    SEARCH_COMPLETE: 'event.cloud.search.complete',
    PROGRESS_UPDATE: 'event.cloud.progress.update',
    NEW_TICKET: 'event.cloud.ticket.new',
    ERROR: 'event.cloud.error',
    TEMPLATE_FILLED: 'event.cloud.template.filled.'
};

/*
 * vmware.cloud Object
 * This is the main object used by the SDK.
 *
 * Events triggered:
 * vmware.events.cloud.INITIALIZATION_COMPLETE
 * vmware.events.cloud.ERROR
 *
 * Example of instantiation of the SDK:
 * cloud = new vmware.cloud("https://10.0.0.1:8080/api/", vmware.cloudVersion.v5_1);
 */
vmware.cloud = function(base, version) {
    var baseUrl = base;
    var loginUrl = "";

    /*
     * Validate the API version and fetch the login URL
     */
    var initialize = function() {
        vmware.rest.get(baseUrl.concat("versions")).done(function(xhr) {
            $(xhr).find("VersionInfo").each(function() {
                if ($(this).find("Version").text() == version) {
                    loginUrl = $(this).find("LoginUrl").text();
                    that.trigger(vmware.events.cloud.INITIALIZATION_COMPLETE);
                    return;
                }
            });

            if (loginUrl == "") that.trigger(vmware.events.cloud.ERROR, localizer.get("SYSTEM_NOT_SUPPORTED"));
        })
            .error(function() {
            that.trigger(vmware.events.cloud.ERROR, localizer.get("SYSTEM_NOT_SUPPORTED"));
        });
    };

    initialize();

    /*
     * Models to cache vApps, vMs, templates and networks for the session
     */
    var numberVApps = function() {
        c = 0;
        for (v in models["vapps"]) c++;
        return c;
    };
    var models = {
        "vapps": {},
        "vms": {}
    };
    var tempModels = {
        "vapps": {},
        "vms": {}
    };
    var catalog = [];
    var networks = {};
    var vdcList = {};

    /*
     * Public API properties and methods...
     */
    var that = vmware.eventManager({});
    that.base = baseUrl;

    /*
     * Login: Method to authenticate with vCD
     *
     * Events triggered: vmware.events.cloud.LOGIN
     *
     * Example:
     * cloud.login('orgadmin-1', 'password', 'org-1');
     */
    that.login = function(username, password, organization) {
        var url = username + "@" + organization + ":" + password;
        var enUrl = $.base64.encode(url);
        vmware.rest.addHeader("Authorization", "Basic " + $.base64.encode(username + "@" + organization + ":" + password));
        vmware.rest.addHeader("Accept", "application/*+xml;version=5.1");

        vmware.rest.post(loginUrl)
            .done(function(xhr) {
            var loginEvent = {
                    success: true,
                    data: $.parseXML((xhr.xml ? xhr.xml : (new XMLSerializer())
                        .serializeToString(xhr)))
                },
                user = loginEvent.data.childNodes[0].getAttribute("user"),
                org = loginEvent.data.childNodes[0].getAttribute("org"),
                adminUrl = $(loginEvent.data).find('Link[href*="/api/admin"]').attr('href'),
                orgUrl = $(loginEvent.data).find('Link[name="'+ org +'"]').attr('href');
            that.user = new User(user, org, orgUrl, adminUrl);
            that.begin();
            that.trigger(vmware.events.cloud.LOGIN, loginEvent);
        })
            .fail(function(xhr) {
            var loginEvent = {
                success: false,
                data: xhr.statusText // authorization failure
            };
            that.trigger(vmware.events.cloud.LOGIN, loginEvent);
        });
    };

    /*
     * ConfirmLoggedIn: Method to verify any existing authentication with vCD
     *
     * Events triggered: vmware.events.cloud.LOGIN
     *
     * Example:
     * cloud.confirmLoggedIn()
     */
    that.confirmLoggedIn = function() {
        vmware.rest.addHeader("Accept", "application/*+xml;version=5.1");

        vmware.rest.get(base.concat("session"))
            .done(function(xhr) {
            var loginEvent = {
                    success: true,
                    confirm: true,
                    data: $.parseXML((xhr.xml ? xhr.xml : (new XMLSerializer())
                        .serializeToString(xhr)))
                },
                user = loginEvent.data.childNodes[0].getAttribute("user"),
                org = loginEvent.data.childNodes[0].getAttribute("org"),
                adminUrl = $(loginEvent.data).find('Link[href*="/api/admin"]').attr('href'),
                orgUrl = $(loginEvent.data).find('Link[name="'+ org +'"]').attr('href');
            that.user = new User(user, org, orgUrl, adminUrl);
            that.begin();
            that.trigger(vmware.events.cloud.LOGIN, loginEvent);
        })
            .fail(function(xhr) {
            var loginEvent = {
                success: false,
                confirm: true,
                data: xhr.statusText // Timeout!
            };
            that.trigger(vmware.events.cloud.LOGIN, loginEvent);
        });
    };

    /*
     * Internal: Helper method to fetch a given URL with an optional method, acceptType,
     * body and callback for completion.
     */
    that.fetchURL = function(url, method, acceptType, callback, body) {

        var _callback = function(xhr) {
            if (callback != null) {
                callback($.parseXML(
                    (xhr.xml ? xhr.xml : (new XMLSerializer()).serializeToString(xhr))
                ));
            }
        }

        vmware.rest.removeAllHeaders();
        if (acceptType) vmware.rest.addHeader("Accept", acceptType);
        else vmware.rest.addHeader("Accept", "application/*+xml;version=5.1");

        if (method == "GET" || method == null) {
            vmware.rest.get(url).done(function(xhr) {
                connectivity = 1;
                _callback(xhr);
            })
            .fail(function(x, y) {
                if (connectivity) {
                    console.warn("Fetch error: " + x.statusText);
                    connectivity = 0;
                    that.trigger(vmware.events.cloud.ERROR, localizer.get("LOST_CONNECTIVITY"));
                }
            });
        }
        else if (method == "POST") {
            vmware.rest.post(url).done(function(xhr) { _callback(xhr); })
            .fail(function(x) {
                console.warn("Post error: " + x.statusText);
            });
        }
        else if (method == "DELETE") {
            vmware.rest.del(url).done( function(xhr) { _callback(xhr); })
            .fail(function(x, y) {
                console.warn("Delete error: " + x.statusText);
            });
        }
        else if (method == 'SOAP') {
            vmware.soap.addHeader('Content-Type', 'text/xml; charset=utf-8');
            vmware.soap.addHeader('SOAPAction', 'urn:vim25/4.1');
            vmware.soap.post(url, body).done( function(xhr) { _callback(xhr); })
            .fail(function(xhr, textStatus) {
                    console.warn("SOAP error: " + textStatus);
            });
        }
    };

    /*
     * Internal: Populate the models from the xml response from a vApp API query
     */
    var comissionStructures = function(xmlDoc) {
        if (me.comissioning == false) {
            setTimeout(function() {
                me.comissioning = false;
            }, 30000);
            me.comissioning = true;

            var vrecords = xmlDoc.getElementsByTagName("VAppRecord");
            if (vrecords.length != 0) {

                tempModels["vapps"] = {};
                tempModels["vms"] = {};

                var app;
                for (var i = 0; i < vrecords.length; i++) {
                    if (vrecords[i].nodeName == "VAppRecord") {
                        app = new vApp(that);
                        for (var j = 0; j < vrecords[i].attributes.length; j++) {
                            app.setAttr(vrecords[i].attributes[j].name, vrecords[i].attributes[j].value);
                        }
                        that.fetchURL(vrecords[i].getAttribute("href"), null, null, buildStructures(app));
                    }
                }
            } else {
                that.trigger(vmware.events.cloud.REFRESH_COMPLETE, false);
                me.comissioning = false;
            }

        }
    };

    var me = this;
    this.comissioning = false;
    var single = false;
    var vmsrecieved = 0;
    var totalvms = 0;
    var oneDoneCheck = function(obj) {
        if (totalvms != 0) {
            that.trigger(vmware.events.cloud.PROGRESS_UPDATE, that.percentageDoneUpdate());
            vmsrecieved++;
            if (vmsrecieved == totalvms) {
                vmsrecieved = 0;
                totalvms = 0;
                if (single == false) models = tempModels;
                tempModels = {
                    "vapps": [],
                    "vms": []
                };
                me.comissioning = false;
                if (single == true) that.trigger(vmware.events.cloud.REFRESH_SINGLE, {
                    vapp: obj
                });
                else that.trigger(vmware.events.cloud.REFRESH_COMPLETE, true);
                single = false;
            }
        }
    };

    var doneloadingCallback;

    /*
     * Internal: Checks for how many vMs we should be receiving for progress purposes.
     * Then starts the load.
     */
    var setTotalVmNumber = function(xmlDoc) {
        totalvms = 0;

        var vMs = xmlDoc.getElementsByTagName("VMRecord");
        for (var i = 0; i < vMs.length; i++)
        if (vMs[i].getAttribute("status") != "UNRESOLVED" && vMs[i].getAttribute("isVAppTemplate") == 'false') totalvms++;

        that.fetchURL(base.concat("query?type=vApp&format=records&pageSize=1024"), "GET", null, comissionStructures);
    };

    /*
     * Internal: Populate the model structures
     */
    var buildStructures = function(obj) {
        return function(xmlDoc) {

            // Work out the namespace
            var namespace = namespacex = "";
            if (xmlDoc.childNodes[0].getAttribute("xmlns:vcloud") != null) {
                namespace = "vcloud";
                namespacex = namespace + ":";
            }

            var customGetTag = (namespace == "") ? function(tag) {
                    return xmlDoc.getElementsByTagName(tag);
                } : function(tag) {
                    return xmlDoc.getElementsByTagNameNS(xmlDoc.childNodes[0].getAttribute("xmlns:vcloud"), tag);
                };

            if (xmlDoc.childNodes[0].nodeName == namespacex + "VApp") {
                // Populate all VMs and Link for a vApp

                var textquestionmark = customGetTag("Description")[0].childNodes;

                if (textquestionmark && textquestionmark.length) obj.setAttr("description", textquestionmark[0].nodeValue);

                for (var j = 0; j < xmlDoc.childNodes[0].attributes.length; j++) {
                    obj.setAttr(xmlDoc.childNodes[0].attributes[j].name, xmlDoc.childNodes[0].attributes[j].value);
                }

                textquestionmark = customGetTag("DateCreated")[0].childNodes;
                if (textquestionmark && textquestionmark.length) obj.setAttr("creationDate", textquestionmark[0].nodeValue);

                textquestionmark = customGetTag("Owner")[0].childNodes;
                if (textquestionmark && textquestionmark.length) obj.setAttr("ownerName", textquestionmark[1].getAttribute("name"));

                if (!single) tempModels["vapps"][obj.getID()] = obj;
                else models["vapps"][obj.getID()] = obj;

                var links = customGetTag("Link");
                for (var i = 0; i < links.length; i++) {
                    if (xmlDoc.childNodes[0].nodeName == links[i].parentNode.nodeName) { // make sure it's the parent, not a child
                        obj.addLink(links[i].getAttribute("rel"), links[i].getAttribute("href"));
                    }
                }

                obj.setAttr("searchTerm", "name:" + obj.getName() + "owner:" + obj.getOwnerName() + "status:" + obj.getStatusMessage() + "description:" + obj.getDescription());

                obj.setAttr("searchTerm", obj.getAttr("searchTerm").toLowerCase());

                obj.children = [];
                var vMs = customGetTag("Vm");

                if (single) totalvms = vMs.length;

                for (var i = 0; i < vMs.length; i++) {
                    getTag = function(tag) {
                        return vMs[i].getElementsByTagName(tag);
                    }

                    var app = new vM(that);
                    for (var j = 0; j < vMs[i].attributes.length; j++) {
                        app.setAttr(vMs[i].attributes[j].name, vMs[i].attributes[j].value);
                    }

                    if (getTag("IpAddress")[0] != null) app.setAttr("ip", getTag("IpAddress")[0].childNodes[0].nodeValue);
                    if (xmlDoc.getElementsByTagNameNS("http://schemas.dmtf.org/ovf/envelope/1", "Description")[0] != null) app.setAttr("guestOS", vMs[i].getElementsByTagNameNS("http://schemas.dmtf.org/ovf/envelope/1", "Description")[0].childNodes[0].nodeValue);
                    if (customGetTag("NetworkConnection")[0] != null) app.setAttr("network", getTag("NetworkConnection")[0].getAttribute("network"));
                    var textquestionmark = getTag("Description")[0].childNodes;
                    if (textquestionmark && textquestionmark.length) app.setAttr("description", textquestionmark[0].nodeValue);

                    var links = customGetTag("Link");
                    for (var a = 0; a < links.length; a++) {
                        if (vMs[i].nodeName == links[a].parentNode.nodeName) {
                            app.addLink(links[a].getAttribute("rel"), links[a].getAttribute("href"));
                        }
                    }

                    //TODO: fetch thumbnail for this vMs[i]
                    app.updateConsoleThumbnail();

                    obj.children.push(app.getID());
                    if (!single) {
                        tempModels["vms"][app.getID()] = app;
                        oneDoneCheck();
                    } else {
                        models["vms"][app.getID()] = app;
                        oneDoneCheck(obj);
                    }
                }
            }
        };
    };

    /*
     * Internal: Returns a VM data structure from an xml VM representation
     */
    var makeVM = function(xmlDoc, customGetTag) {
        customGetTag = customGetTag ? customGetTag : function(tag) {
            return xmlDoc.getElementsByTagName(tag);
        };

        var app = new vM(that);
        for (var j = 0; j < xmlDoc.childNodes[0].attributes.length; j++) {
            app.setAttr(xmlDoc.childNodes[0].attributes[j].name, xmlDoc.childNodes[0].attributes[j].value);
        }

        if (customGetTag("IpAddress")[0] != null) app.setAttr("ip", customGetTag("IpAddress")[0].childNodes[0].nodeValue);
        if (xmlDoc.getElementsByTagNameNS("http://schemas.dmtf.org/ovf/envelope/1", "Description")[0] != null) app.setAttr("guestOS", xmlDoc.getElementsByTagNameNS("http://schemas.dmtf.org/ovf/envelope/1", "Description")[0].childNodes[0].nodeValue);
        if (customGetTag("NetworkConnection")[0] != null) app.setAttr("network", customGetTag("NetworkConnection")[0].getAttribute("network"));
        var textquestionmark = customGetTag("Description")[0].childNodes;
        if (textquestionmark && textquestionmark.length) app.setAttr("description", textquestionmark[0].nodeValue);

        var links = customGetTag("Link");
        for (var i = 0; i < links.length; i++) {
            if (xmlDoc.childNodes[0].nodeName == links[i].parentNode.nodeName) {
                app.addLink(links[i].getAttribute("rel"), links[i].getAttribute("href"));
            }
        }

        return app;
    };

    /*
     * Internal: Take a vM or vApp and perform an action on them figure out the
     * link, and post the request with the taskManager to deal with the
     * recieved tasks
     */
    var performLinkAction = function(id, action) {
        if (that.getVM(id) != null) that.fetchURL(that.getVM(id).links[action], "POST", null, that.taskManager.newTask);
        else if (that.getVApp(id) != null) {
            that.taskManager.addFakeTask(that.getVApp(id).getHref());
            if (action == "power:powerOff") { // poweroff is actual undeploy behind teh scenes
                vmware.rest.addHeader("Content-Type", "application/vnd.vmware.vcloud.undeployVAppParams+xml");
                xml = '<?xml version="1.0" encoding="UTF-8"?>\
                    <UndeployVAppParams\
                       xmlns="http://www.vmware.com/vcloud/v1.5">\
                       <UndeployPowerAction>powerOff</UndeployPowerAction>\
                    </UndeployVAppParams>';
                vmware.rest.post(that.getVApp(id).links["undeploy"], xml).done(

                function(xhr) {
                    that.taskManager.newTask($.parseXML((xhr.xml ? xhr.xml : (new XMLSerializer())
                        .serializeToString(xhr))));
                });
                return true;
            } else if (action == "remove") {
                that.fetchURL(that.getVApp(id).links[action], "DELETE", null, that.taskManager.newTask);
            } else that.fetchURL(that.getVApp(id).links[action], "POST", null, that.taskManager.newTask);
        } else {
            // do not have structure in cache, assuming it's a valid id
            var urlAttempt = guessURL(id, action);
            that.fetchURL(urlAttempt, "POST", null, that.taskManager.newTask);
        }
    };

    /*
     * Internal: Best guess at what a URL would be without looking at the
     * actual object.
     */
    var guessURL = function(id, action) {

        var initial = base.concat("vApp/" + id.split(":")[id.split(":").length - 2] + "-" + id.split(":")[id.split(":").length - 1]);

        if (action.split(":")[0] == "power") return initial + "/power/action/" + action.split(":")[1];
        else return initial + "/action/" + action;
    };


    /*
     * Internal: Checks if given string can be shortened/converted to
     * human-readable. Returns the new or the old if no new can be found.
     */
    var shorten = function(str) {
        return (shortened[str] ? shortened[str] : str);
    };

    var shortened = {
        "ownerName": "owner",
        "memoryAllocationMB": "memory",
        "catalogName": "catalog",
        "storageKB": "storage",
        "cpuAllocationMhz": "cpu"
    };

    /*
     * Internal: Populate Template model from xml response of Template API query
     */
    var setUpTemplates = function(num, size, all) {
        return function(xmlDoc) {
            var templates = xmlDoc.getElementsByTagName("VAppTemplateRecord");

            if (templates.length != 0) {
                var template;
                for (var i = 0; i < templates.length; i++) {
                    template = new Template();
                    for (var j = 0; j < templates[i].attributes.length; j++) {
                        template.setAttr(shorten(templates[i].attributes[j].name), templates[i].attributes[j].value);
                        template.setAttr("searchTerm", template.getAttr("searchTerm") + shorten(templates[i].attributes[j].name) + ":" + templates[i].attributes[j].value);
                    }
                    catalog[(num - 1) * size + i] = template;
                }
            }
            if (all) {
                var links = xmlDoc.getElementsByTagName("Link");
                for (var i = 0; i < links.length; i++)
                if (links[i].getAttribute("rel") == "nextPage") {
                    that.fetchURL(links[i].getAttribute("href"), "GET", null, setUpTemplates(num + 1, 128, true));
                    return;
                }
                catalogFull = true;
            }

            that.trigger(vmware.events.cloud.TEMPLATE_REFRESH, catalog);
        };
    };

    /*
     * Internal: User object
     */
    that.user = null;
    var User = function(name, org, orgUrl, adminUrl) {
        var name = name;
        var org = org;
        var orgUrl = orgUrl;
        var adminUrl = adminUrl;
        var that = {};
        that.getName = function() {
            return name;
        };
        that.getOrg = function() {
            return org;
        };
        that.getAdminUrl= function() {
            return adminUrl
        };
        that.getOrgUrl= function() {
            return orgUrl;
        };
        return that;
    };


    /*
     * GetUserName: Method to get the authenticated User name
     */
    that.getUserName = function() {
        return this.user.getName();
    };

    /*
     * GetUserOrg: Method to get the authenticated User Organization
     */
    that.getUserOrg = function() {
        return this.user.getOrg();
    };

    /*
     * GetAdminUrl: Method to get the admin end-point URL if the
     * authenticated User has administrator rights
     */
    that.getAdminUrl = function () {
        return this.user.getAdminUrl();
    };

    /*
     * GetUserOrgUrl: Method to get the authenticated User Organization REST URL
     */
    that.getUserOrgUrl = function() {
        return this.user.getOrgUrl();
    };

    /*
     * Internal: Retrives more data above the given template, adds the data to
     * the template and then fires a TEMPLATE_FILLED+href event.
     */
    that.fleshOutTemplate = function(templ) {
        if (templ.getAttr("childNames") == null) that.fetchURL(templ.getHref(), "GET", null, callbackTemplate(templ));
        else that.trigger(vmware.events.cloud.TEMPLATE_FILLED + templ.getHref(), templ);
    };

    /*
     * Internal: Loads multiple templates and triggers on the completion of all
     * of the templates.
     */
    that.fleshOutMultiple = function(arrayOfTempl) {
        var donepoint = arrayOfTempl.length;
        var prog = 0;
        var incProg = function() {
            prog++;
            if (prog == donepoint) that.trigger(vmware.events.cloud.TEMPLATE_FILLED);
        };

        for (var i = 0; i < donepoint; i++) {
            templ = arrayOfTempl[i];
            that.once(vmware.events.cloud.TEMPLATE_FILLED + templ.getHref(), function() {
                incProg();
            });
            that.fetchURL(templ.getHref(), "GET", null, callbackTemplate(templ));
        }
    };

    /*
     * Internal: Fills a given template object with information from an XMLdoc.
     */
    var callbackTemplate = function(templ) {
        return function(xmlDoc) {
            var getFirst = function(a) {
                return xmlDoc.getElementsByTagName(a)[0];
            };

            if (getFirst("Description").childNodes[0] != null) templ.setAttr("description", getFirst("Description").childNodes[0].nodeValue);

            if (getFirst("NetworkConfig") != null) templ.setAttr("network", getFirst("NetworkConfig").getAttribute("networkName"));

            templ.setAttr("childNames", []);
            for (var i = 0; i < xmlDoc.getElementsByTagName("Vm").length; i++) {
                templ.setAttr("childNames", templ.getAttr("childNames").concat(xmlDoc.getElementsByTagName("Vm")[i].getAttribute("name")));
            }

            that.trigger(vmware.events.cloud.TEMPLATE_FILLED + templ.getHref(), templ);
        };
    };

    /*
     * GetAllTemplates: Method to fetch all vApp Templates
     */
    that.getAllTemplates = function() {
        that.fetchURL(base.concat("query?type=vAppTemplate&format=records&page=1&pageSize=128"), "GET", null, setUpTemplates(1, 128, true));
    };

    /*
     * Internal: Query for the given term, and stores the href and the name of
     * the given returnterm in the obj.
     */
    var learnAbstract = function(queryterm, returnterm, array) {
        that.fetchURL(base.concat("query?type=" + queryterm + "&format=records"), "GET", null, parseAbstract(returnterm, array));
    };

    /*
     * Internal: Parse term out of xml response from an API query
     */
    var parseAbstract = function(retterm, array) {
        return function(xmlDoc) {
            var nets = xmlDoc.getElementsByTagName(retterm);
            for (var i = 0; i < nets.length; i++) {
                if (nets[i].getAttribute("linkType") != -1) array[nets[i].getAttribute("name")] = nets[i].getAttribute("href");
            }
        };
    };


    /*
     * Metrics: Returns and object of statistics for the authenticated Users Org
     */
    that.metrics = function() {
        m = {
            totalStorage: 0,
            totalMemory: 0,
            totalRunning: 0,
            totalStopped: 0,
            totalSuspended: 0,
            totalError: 0,
            tasksPerHour: 0
        };

        temp = that.getVApps(that.SORTBY.DATE);
        for (var i = 0; i < temp.length; i++) {
            switch (temp[i].getStatus()) {
                case (temp[i].STATUS_OFF):
                    m.totalStopped++;
                    break;
                case (temp[i].STATUS_SUSPENDED):
                    m.totalSuspended++;
                    break;
                case (temp[i].STATUS_ERROR):
                    m.totalError++;
                    break;
                default:
                    m.totalRunning++;
            }

            m.totalStorage += parseInt(temp[i].getAttr("storageKB")) / 1000;
            m.totalMemory += parseInt(temp[i].getAttr("memoryAllocationMB"));
        }

        m.tasksPerHour = Math.ceil(that.taskManager.tasksPerHour());

        return m;
    };


    var catalogFull = false;

    /*
     * Internal: Catalog search
     *
     * Confirm the searched values exist in the searched term.
     *
     * Ranges: if you ask for {memory : "10 - 4992"} or {storage:"4-5"}
     * then it will return all the templates with memory or storage within
     * the given ranges.
     *
     * obj = {attribute : searchPhrase}
     * if attribute == "searchTerm" then it activates supermode.
     */
    var actualSearch = function(obj) {
        return function() {
            global = obj;
            catalogFull = true;
            var found = [];
            var yes;
            for (var t = 0; t < catalog.length; t++) {
                yes = true;
                if (catalog[t]) {
                    for (var a in obj) {
                        if (obj[a].match("-")) {
                            terms = obj[a].split("-");
                            if (!(((terms[0].replace(" ", "").replace(",", "") == "" || parseInt(terms[0].replace(" ", "").replace(",", "")) <= parseInt(catalog[t].getAttr(a)))) && (terms[1].replace(" ", "").replace(",", "") == "" || (parseInt(terms[1].replace(" ", "").replace(",", "")) >= parseInt(catalog[t].getAttr(a)))))) {
                                yes = false;
                                break;
                            }
                        } else {
                            for (var b = 0; b < obj[a].split(" ").length; b++) {
                                if (obj[a].split(" ")[b] != "" && (catalog[t].getAttr(a) == null || catalog[t].getAttr(a).toLowerCase().match(obj[a].split(" ")[b].toLowerCase()) == null)) {
                                    yes = false;
                                    break;
                                }
                            }
                        }
                    }
                    if (yes) found.push(catalog[t]);
                }
            }
            that.trigger(vmware.events.cloud.SEARCH_COMPLETE, found);
        };
    };

    /*
     * GetNetworks: Method to retrieve list of available Network names
     */
    that.getNetworks = function() {
        names = [];
        for (var n in networks)
        names.push(n);
        return names;
    };

    /*
     * GetVdcList: Method to retrieve list of available VDC names
     */
    that.getVdcList = function() {
        names = [];
        for (var n in vdcList)
        names.push(n);
        return names;
    };

    /*
     * EditVApp: Method to submit a new name a description for a vApp
     */
    that.editVApp = function(vappID, name, desc) {
        var xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\
                        <vcloud:VApp\
                            xmlns:vcloud="http://www.vmware.com/vcloud/v1.5"\
                            name="' + (name || that.getVApp(vappID).getName()) + '">\
                            <vcloud:Description>' + (desc || that.getVApp(vappID).getDescription()) + '</vcloud:Description>\
                    </vcloud:VApp>';
        vmware.rest.addHeader("Content-Type", "application/vnd.vmware.vcloud.vApp+xml");
        vmware.rest.put(that.getVApp(vappID).getHref(), xml)
            .done(function (xhr) {
                that.taskManager.newTask($.parseXML((xhr.xml ? xhr.xml : (new XMLSerializer()).serializeToString(xhr))));
            })
    };

    /*
     * InstantiateVApp: Method to instantiate a vApp from a Template
     */
    that.instantiateVApp = function(name, desc, vdc, parentNetwork, templateHref, power) {

        templateObj = that.getTemplateFromHref(templateHref);

        if (!vdcList[vdc] || (!templateObj)) return false;

        that.once(vmware.events.cloud.TEMPLATE_FILLED + templateHref, function(e) {

            networkName = e.eventData.getNetwork();

            parentNetwork = networks[parentNetwork] ? parentNetwork : networks[0];
            var xml = instantTempParams(name, desc, networkName, networks[parentNetwork], templateHref, power);
            vmware.rest.addHeader("Content-Type", "application/vnd.vmware.vcloud.instantiateVAppTemplateParams+xml");
            vmware.rest.post(vdcList[vdc] + "/action/instantiateVAppTemplate", xml)
                .done(function (xhr) {
                    that.once(vmware.events.cloud.TASK_START, that.updateModels);
                    that.taskManager.newTask($.parseXML((xhr.xml ? xhr.xml : (new XMLSerializer()).serializeToString(xhr))));
                })
                .fail(function (xhr) {
                    that.trigger(vmware.events.cloud.ERROR, $(xhr.responseXML).find('Error').attr('message'));
                });
        });

        that.fleshOutTemplate(templateObj);

        return true;
    };

    /*
     * SearchCatalogFaceted: Method to search Templates in the Catalog using
     * facets or multiple terms provides in a JSON object
     *
     * Example JSON object:
     * {
     *     "name": "",    // template name
     *     "owner": "",   // template owner username
     *     "catalog": "", // catalog name
     *     "cpu": "-",    // cpu Mhz range, '-'=any, e.g. '0-2', '3-4', '4-'
     *     "memory": "-", // memory MB range, '-'=any, e.g. '0-127', '128-256', '256-1024', '1024-'
     *     "storage": "-" // storage KB range, '-'=any, e.g. '0-199999', '200000-399999', '4000000-'
     *     "searchTerm": "", // general search term which is not a facet
     *  }
     *
     * name, owner, catalog, cpu, memory and storage are facets.
     * searchTerm is a container for a general search term not attributed to any facet
     */
    that.searchCatalogFaceted = function(obj) {
        if (catalogFull) actualSearch(obj)();
        else {
            that.once(vmware.events.cloud.TEMPLATE_REFRESH, actualSearch(obj));
            that.getAllTemplates();
        }
    };

    /*
     * SearchCatalog: Method to present a search string to the faceted catalog
     * search method above
     */
    that.searchCatalog = function(term) {
        that.searchCatalogFaceted({
            "searchTerm": term
        });
    };

    /*
     * TaskHistory: Method to retrieve tasks
     */
    that.taskHistory = function() {
        return that.taskManager.taskLog();
    };

    /*
     * UpdateModels: Method to force a refresh of all models
     */
    that.updateModels = function() {
        that.fetchURL(base.concat("query?type=vm&format=records&pageSize=1024"), "GET", null, setTotalVmNumber);
    };

    /*
     * Internal: Queues up all the initial loading
     */
    that.begin = function() {
        that.metadata = new Metadata(base);
        that.taskManager = new TaskManager(that);
        that.register(vmware.events.cloud.TASK_COMPLETE, that.updateSingle);
        learnAbstract("orgVdcNetwork", "OrgVdcNetworkRecord", networks);
        learnAbstract("orgVdc", "OrgVdcRecord", vdcList);
        that.taskManager.autoRefresh = function(callback) {
            that.fetchURL(base.concat("query?type=task&filter=(status==running)"), "GET", null, callback);
        };
        that.fetchURL(base.concat("query?type=task&pageSize=15&sortDesc=startDate"), "GET", null, that.taskManager.loadTasksLog);
        that.updateModels();
        that.getAllTemplates();
        that.once(vmware.events.cloud.TEMPLATE_REFRESH, function() {
            that.metadata.register(that.metadata.filterTemplates('downloads'), function(filterObj) {
                for (t in filterObj)
                that.getTemplateFromHref(t).setAttr('downloads', filterObj[t]);
            });
        });
    };

    /*
     * Internal: Update the information of a single vApp given the vApp task.
     */
    that.updateSingle = function(t) {
        var task = t.eventData.data;
        single = true;
        that.fetchURL(task.attr["ownerHref"], "GET", null, buildStructures((that.getVAppFromHref(task.attr["ownerHref"]) || new vApp(that)), true));
    };

    /*
     * Internal: Fetch the given number of Templates from the catalog.
     * NOTE: Max page size is 128.
     */
    that.updateCatalog = function(pageNum, pageSize) {
        for (var i = (pageNum - 1) * pageSize; i < pageNum * pageSize; i++)
        if (catalog[i] == null) return that.fetchURL(base.concat("query?type=vAppTemplate&format=records&page=" + pageNum + "&pageSize=" + pageSize), "GET", null, setUpTemplates(pageNum, pageSize, false));

        that.trigger(vmware.events.cloud.TEMPLATE_REFRESH, catalog);
    };

    /*
     * GetCatalog: Method to retrieve the cached catalog of Templates
     *
     * NOTE: Fill it first with a search or with a updateCatalog call
     */
    that.getCatalog = function() {
        return catalog;
    };

    /*
     * Internal: Retrieve the status of a VM
     */
    that.getVMStatus = function(vm) {
        var inprog = that.taskManager.inProgress();
        for (var i = 0; i < inprog.length; i++) {
            if (vm.getID().match(inprog[i]) != null) return vm.STATUS_WORKING; // task in progress
        }
        return vm.getStatus();
    };

    /*
     * Internal: Returns the percentage done of fetching the vApps and vMs.
     */
    that.percentageDoneUpdate = function() {
        return (totalvms != 0) ? ((100) * vmsrecieved) / totalvms : 0;
    };

    /*
     * GetvApps: Method to retrieve the cached vApps list using the given
     * sort method
     *
     * Example:
     * cloud.getVApps(cloud.SORTBY.DATE)
     */
    that.getVApps = function(sortby) {
        list = [];
        for (var key in models['vapps'])
        list.push(models['vapps'][key]);

        if (sortby != null) {
            switch (sortby) {
                case that.SORTBY.NAME:
                    sorter = function(a, b) {
                        return a.getName() > b.getName();
                    };
                    break;
                case that.SORTBY.DATE:
                    sorter = function(a, b) {
                        return a.getCreationDate() > b.getCreationDate();
                    };
                    break;
            }
            return list.sort(sorter);
        }

        return list;
    };

    /*
     * Sort methods
     */
    that.SORTBY = {
        NAME: 0,
        DATE: 1
    };

    /*
     * Internal: Method to retrieve the cached VMs
     */
    that.getVMs = function() {
        list = [];
        for (var key in models['vms'])
        list.push(models['vms'][key]);

        return list;
    };

    /*
     * GetVM: Method to retrieve a specific VM given its id
     */
    that.getVM = function(id) {
        return models['vms'][id];
    };

    /*
     * GetVApp: Method to retrieve a specific vApp given its id
     */
    that.getVApp = function(id) {
        return models['vapps'][id];
    };

    /*
     * GetVObject: Method to retrieve a vApp or VM given its id
     *
     * Useful when you're not sure if the id you have is for a VM or a vApp
     */
    that.getVObject = function(id) {
        return (that.getVApp(id) || that.getVM(id));
    };

    /*
     * GetVAppFromHref: Method to retrieve a specific vApp given its URL
     *
     * Useful when retriving a vApp object from its URL presented in a task
     * object
     *
     * Example:
     * var task = t.eventData.data;
     * cloud.getVAppFromHref(task.attr["ownerHref"]);
     */
    that.getVAppFromHref = function(id) {
        for (var key in models['vapps'])
        if (models['vapps'][key].getAttr('href') == id) return models['vapps'][key];
    };

    /*
     * GetTemplateFromHref: Method to retrieve a specific Template given its URL
     */
    that.getTemplateFromHref = function(id) {
        for (var key in catalog)
        if (catalog[key].getAttr('href') == id) return catalog[key];
    };

    /*
     * PowerOff: Method to power off a specific vApp or VM given its id
     *
     * Example:
     * cloud.powerOff(vmObject.getID());
     */
    that.powerOff = function(id) {
        performLinkAction(id, "power:powerOff");
    };

    /*
     * PowerOn: Method to power on a specific vApp or VM given its id
     *
     * Example:
     * cloud.powerOn(vmObject.getID());
     */
    that.powerOn = function(id) {
        performLinkAction(id, "power:powerOn");
    };

    /*
     * Suspend: Method to suspend a specific vApp or VM given its id
     *
     * Example:
     * cloud.suspend(vmObject.getID());
     */
    that.suspend = function(id) {
        performLinkAction(id, "power:suspend");
    }

    /*
     * DeleteVApp: Method to delete a vApp given its id
     *
     * Example:
     * cloud.deleteVApp(vappObject.getID());
     */
    that.deleteVApp = function(id) {
        performLinkAction(id, "remove");
    };

    /*
     * DisplayConsole: Method to isplay a console of a VM
     *
     * Takes a ticket generated by the VM and a location in which to display
     * Installs the plugin if necessary
     *
     * NOTE: THIS IS A WORK IN PROGRESS
     */
    that.displayConsole = function(where, vm) {
        that.once(vmware.events.cloud.NEW_TICKET, function(res) {
            // TODO: var url = 'wss://' + ticket.host + ':' + ticket.cpport + '/' + ticket.ticket;
            // TODO: wmksHandle = $("#" + where).wmks();
            // TODO: $("#" + where).wmks('connect', url, ticket.vmx);
            // TODO: $("#"+where).wmks('disconnect');
        });
        vm.getConsoleTicket();
    };

    /*
     * SaveCache: Method that returns the entire cache of cloud objects in the
     * form of a stringified JASON object.
     *
     * Useful when you want to save this to local storage on your client.
     */
    that.saveCache = function() {
        var tosave = {};
        tosave.vapps = [];
        var a = that.getVApps();
        for (var i = 0; i < a.length; i++) {
            tosave.vapps.push(a[i].save());
        }
        tosave.vms = [];
        a = that.getVMs();
        for (var i = 0; i < a.length; i++) {
            tosave.vms.push(a[i].save());
        }
        tosave.catalog = [];
        a = that.getCatalog();
        for (var i = 0; i < a.length; i++) {
            tosave.catalog.push(a[i].save());
        }

        tosave.tasks = that.taskManager.saveLog();

        return JSON.stringify(tosave);
    };

    /*
     * LoadCache: Method to restore the cache of cloud objects from a
     * stringified JASON object generated by the SaveCache method.
     *
     * Events triggered: vmware.events.cloud.REFRESH_COMPLETE
     *
     * Useful when you want to restore this from local storage on your client.
     */
    that.loadCache = function(obj) {
        obj = JSON.parse(obj);
        models = {
            vapps: {},
            vms: {}
        };
        catalog = [];
        var a;
        for (var i = 0; i < obj.vapps.length; i++) {
            a = new vApp(that);
            a.load(obj.vapps[i]);
            models.vapps[a.getID()] = a;
        }
        for (var i = 0; i < obj.vms.length; i++) {
            a = new vM(that);
            a.load(obj.vms[i]);
            models.vms[a.getID()] = a;
        }
        for (var i = 0; i < obj.catalog.length; i++) {
            a = new Template();
            a.load(obj.catalog[i]);
            catalog.push(a);
        }
        that.taskManager.loadLog(obj.tasks);

        that.trigger(vmware.events.cloud.REFRESH_COMPLETE);
    };

    return that;
};
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * System for event management, please register to a specific id,
 * and then when it is triggered, all the callbacks are called with
 * any data that was sent.
 */

var vmware = (typeof vmware == "undefined" || !vmware) ? {} : vmware;

vmware.events.log = [];

vmware.eventManager = function(that) {
    var registry = {};

    that.register = function(key, method, data) {

        vmware.events.log.push("Registering " + String(method).split(" ")[1] + " with " + key);

        var handler = {
            method: method,
            handlerData: data
        };
        if (registry.hasOwnProperty(key)) {
            registry[key].push(handler);
        } else {
            registry[key] = [handler];
        }
    };

    that.unregister = function(key, method) {

        vmware.events.log.push("Unregistering " + String(method).split(" ")[1] + " with " + key);

        for (var i = registry[key].length - 1; i >= 0; i--) {
            if (registry[key][i].method === method) {
                registry[key].splice(i, 1);
            }
        }
    };

    that.trigger = function(key, data) {



        if (registry.hasOwnProperty(key)) {
            var handlers = registry[key];

            vmware.events.log.push("Triggering " + key + ", " + handlers.length + " registered.");

            for (var i = 0; i < handlers.length; i += 1) {
                var handler = handlers[i];
                handler.method.apply(this, [{
                    key: key,
                    handlerData: handler.handlerData,
                    eventData: data
                }]);
            }
        }
    };

    that.once = function(key, method, data) {

        var onceMethod = function(event) {
            method(event);
            that.unregister(key, onceMethod);
        };
        that.register(key, onceMethod, data);
    };

    return that;

};
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * The format of the instantiateTemplateParams XML document required
 * to start up a vApp from a template. Variables include the name
 * of the vApp, description, networkName and the address of the template
 * that we want to instantiate.
 * NOTE: the networkName and/or parentNetwork must correspond with the
 * networks specified in the template.
 */

var instantTempParams = function(name, description, networkName, parentNetwork, href, powerOn) {
    return "<?xml version='1.0' encoding='UTF-8'?>\
    <InstantiateVAppTemplateParams\
       xmlns='http://www.vmware.com/vcloud/v1.5'\
       name='" + name + "'\
       deploy='" + (powerOn == null ? false : powerOn) + "'\
       powerOn='" + (powerOn == null ? false : powerOn) + "'\
       xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'\
       xmlns:ovf='http://schemas.dmtf.org/ovf/envelope/1'>\
       <Description>" + description + "</Description>\
       <InstantiationParams>" + (parentNetwork ? "\
          <NetworkConfigSection>\
             <ovf:Info>Configuration parameters for logical networks\
             </ovf:Info>\
             <NetworkConfig\
                networkName='" + networkName + "'>\
                <Configuration>\
                   <ParentNetwork\
                      href='" + parentNetwork + "' />\
                   <FenceMode>bridged</FenceMode>\
                </Configuration>\
             </NetworkConfig>\
          </NetworkConfigSection>" : "") + "</InstantiationParams>\
       <Source\
          href='" + href + "' />\
    </InstantiateVAppTemplateParams>";

};
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * Plugin to deal with Metadata from the cloud
 * Start it up with the base url, and then register to a get or set, which
 * will trigger your callback on completion
 *
 * You can also filter Templates or vApps for a certain metadata tag
 */

function Metadata(base) {

    var CONTENT_TYPE = "application/vnd.vmware.vcloud.metadata+xml";
    var counter = 0;
    var base = base;
    var registry = {};

    var that = {};


    /*
     * Event management system, register and trigger
     */
    that.register = function(id, f) {
        registry[id] = f;
    };

    var trigger = function(id, data) {
        if (registry[id]) registry[id](data);
        delete registry[id];
    };

    var send = function(href, xml, triggerID) {
        vmware.rest.addHeader("Content-Type", CONTENT_TYPE);
        vmware.rest.post(href, xml).done(function() {
            trigger(triggerID);
        });
    };
    var get = function(href, triggerID, parser) {
        vmware.rest.get(href).done(function(x) {
            trigger(triggerID, parser(
            $.parseXML(x.xml ? x.xml : (new XMLSerializer())
                .serializeToString(x))));
        });
    };

    /*
     * Parse the Entries in the table for a specific item
     */
    var parseMetadata = function(doc) {

        var results = {};

        var entries = doc.getElementsByTagName("MetadataEntry");
        for (var e = 0; e < entries.length; e++) {
            results[entries[e].getElementsByTagName("Key")[0].childNodes[0].nodeValue] = entries[e].getElementsByTagName("Value")[0].childNodes[0].nodeValue;
        }

        return results;
    };

    /*
     * Parse the return for a filter, either vApps or Templates.
     */
    var filterParser = function(doc) {
        var results = {};

        var entries = (doc.getElementsByTagName("VAppRecord").length != 0) ? doc.getElementsByTagName("VAppRecord") : doc.getElementsByTagName("VAppTemplateRecord");
        for (var e = 0; e < entries.length; e++) {
            results[entries[e].getAttribute("href")] = entries[e].getElementsByTagName("Value")[0].childNodes[0].nodeValue;
        }
        return results;
    };

    /*
     * Current XML structure of a call
     * does not work with datetime values
     */
    var generate = function(key, value) {
        return '<Metadata\
            xmlns="http://www.vmware.com/vcloud/v1.5"\
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\
            type="application/vnd.vmware.vcloud.metadata+xml">\
                <MetadataEntry\
                    type="application/vnd.vmware.vcloud.metadata.value+xml">\
                        <Key>' + key + '</Key>\
                        <TypedValue\
                            xsi:type="Metadata' + (typeof value).substring(0, 1).toUpperCase() + (typeof value).substr(1) + 'Value">\
                                <Value>' + value + '</Value>\
                        </TypedValue>\
                </MetadataEntry>\
        </Metadata>';
    };

    /*
     * These functions return IDs that you register a callback to.
     */
    that.get = function(object) {
        var id = counter++;
        get(object.getHref() + "/metadata", id, parseMetadata);
        return id;
    };
    that.filterTemplates = function(term) {
        var id = counter++;
        get(base.concat("query?type=vAppTemplate&fields=metadata:" + term + "&filter=metadata:" + term + "=ge=NUMBER:0"), id, filterParser);
        return id;
    };
    that.filterVApps = function(term) {
        var id = counter++;
        get(base.concat("query?type=vApp&fields=metadata:" + term + "&filter=metadata:" + term + "=ge=NUMBER:0"), id, filterParser);
        return id;
    };
    that.set = function(object, key, value) {
        var id = counter++;
        send(object.getHref() + "/metadata", generate(key, value), id);
        return id;
    };

    return that;

}
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * vApp and vM extend the base vObj.
 *
 * Each structure holds a plethora of information garnered from the inital loading calls.
 */

function vObj() {
    this.cloud = null;

    this.zfavorite = false;

    this.STATUS_ON = 0;
    this.STATUS_OFF = 1;
    this.STATUS_WORKING = 2;
    this.STATUS_SUSPENDED = 3;
    this.STATUS_ERROR = 4;
    this.STATUS_PARTIAL = 5;

    this.addChild = function(id) {
        this.children.push(id);
    };

    this.setAttr = function(a, b) {
        this.attr[a] = b;
    };

    this.getAttr = function(key) {
        return this.attr[key];
    };

    this.addLink = function(value, link) {
        this.links[value] = link;
    };

    this.getID = function() {
        return this.attr["id"];
    };
    this.getName = function() {
        return this.attr["name"];
    };
    this.getHref = function() {
        return this.attr["href"];
    };

    this.save = function() {
        return {
            attr: this.attr,
            links: this.links,
            children: this.children,
            favorite: this.zfavorite
        };
    };
    this.load = function(loadObj) {
        this.attr = loadObj.attr || this.attr;
        this.links = loadObj.links || this.links;
        this.children = loadObj.children || this.children;
        this.zfavorite = loadObj.favorite || this.zfavorite;
    };

    this.favorite = function(param) {
        if (param != null) this.zfavorite = param;

        return this.zfavorite;
    };

    this.getDescription = function() {
        return this.attr["description"];
    };

    this.getStatusMessage = function() {
        var numerical = this.getStatus();

        switch (numerical) {
            case this.STATUS_ON:
                return localizer.get("STATUS_ON");
            case this.STATUS_OFF:
                return localizer.get("STATUS_OFF");
            case this.STATUS_ERROR:
                return localizer.get("STATUS_ERROR");
            case this.STATUS_WORKING:
                return localizer.get("STATUS_WORKING");
            case this.STATUS_PARTIAL:
                return localizer.get("STATUS_PARTIAL");
            case this.STATUS_SUSPENDED:
                return localizer.get("STATUS_SUSPENDED");
        }
    };

    this.isVM = function() {
        return (this.attr["guestOS"] != null);
    };

    this.canPowerOn = function() {
        return (([this.STATUS_OFF, this.STATUS_PARTIAL, this.STATUS_SUSPENDED].indexOf(this.getStatus()) != -1) && (this.links["power:powerOn"] != null));

    };
    this.canPowerOff = function() {
        return (([this.STATUS_ON, this.STATUS_PARTIAL, this.STATUS_SUSPENDED].indexOf(this.getStatus()) != -1) && (this.links["power:powerOff"] != null));
    };
    this.canSuspend = function() {
        return ((this.getStatus() == this.STATUS_ON) && (this.links["power:suspend"] != null));
    };

    this.powerOn = function(c) {
        return this.cloud.powerOn(this.getID());
    };
    this.powerOff = function() {
        return this.cloud.powerOff(this.getID());
    };
    this.suspend = function() {
        return this.cloud.suspend(this.getID());
    };
}

vApp.prototype = new vObj();
vApp.prototype.constructor = vApp;

function vApp(cloud) {
    this.cloud = cloud;
    this.children = [];
    this.attr = {};
    this.links = {};

    this.searchTerm = function() {
        return this.attr["searchTerm"];
    };

    this.getNumberOfVMs = function() {
        return this.children.length;
    };
    this.getOwnerName = function() {
        return this.attr["ownerName"];
    };
    this.getCreationDate = function() {
        return this.attr["creationDate"];
    };
    this.getChildren = function() {
        return this.children.map(cloud.getVM);
    };
    this.canDelete = function() {
        return (this.links["remove"] != null);
    };
    this.getVDCName = function() {
        return (this.attr["vdcName"]);
    };
    this.edit = function(name, description) {
        return cloud.editVApp(this.getID(), name, description);
    };

    this.getStatus = function() {
        var prog = this.cloud.taskManager.inProgress();
        for (var i = 0; i < prog.length; i++)
        if (this.getID().indexOf(prog[i]) != -1) return this.STATUS_WORKING;

        var on = 0;
        var total = this.children.length;
        var childrenObjects = this.getChildren();
        for (var i = 0; i < childrenObjects.length; i++) {
            stat = childrenObjects[i].getStatus();
            switch (stat) {
                case this.STATUS_ON:
                    on++;
                    break;
                case this.STATUS_SUSPENDED:
                    on += 3.1415;
                    break;
                case this.STATUS_ERROR:
                    return this.STATUS_ERROR;
                default:
                    break;
            }
        }
        var allSus = 3.1415 * total;
        switch (on) {
            case 0:
                return this.STATUS_OFF;
            case total:
                return this.STATUS_ON;
            case allSus:
                return this.STATUS_SUSPENDED;
            default:
                return this.STATUS_PARTIAL;
        }
    };
}

vM.prototype = new vObj();
vM.prototype.constructor = vM;

function vM(cloud) {
    this.cloud = cloud;
    this.children = [];
    this.attr = {};
    this.links = {};

    this.consoleThumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAH0lEQVRoge3BAQEAAACCIP+vbkhAAQAAAAAAAAAALwYkMAABjuvAZwAAAABJRU5ErkJggg==';

    this.getStatus = function() {
        if (this.attr["status"] == 4) return this.STATUS_ON;
        else if (this.attr["status"] == 8) return this.STATUS_OFF;
        else if (this.attr["status"] == 3) return this.STATUS_SUSPENDED;
        else {
            return this.STATUS_ERROR;
        }
    };

    this.getGuestOS = function() {
        return this.attr["guestOS"];
    };
    this.getNetwork = function() {
        return this.attr["network"];
    };
    this.getIP = function() {
        return this.attr["ip"];
    };

    /**
     * Fetch VM console thumbnail image.
     *
     * The API call doesn't always
     * provide an image we retun a black image if no image data has been found.
     *
     * TODO: Complete retrieval logic
     */
    this.updateConsoleThumbnail = function() {
        return this.consoleThumbnail;
    };

    /**
     * Retrieve a ticket to communicate with the VM console service
     *
     * A VMRC connection just needs the ticket provided by the vCD API.
     * A webMKS (wmks) connection needs to the ticket provided by vCD to talk
     * to the vCD console proxy to make two other calls; one for the ESX ticket
     * and one for the VM screen ticket itself.
     *
     * Until this is all handled by the vCD console proxy, this object provides
     * a shim for that functionality.
     *
     * TODO: Complete ticket handshake logic
     */
    this.getConsoleTicket = function() {
        // this is the vCD rest url to fetch a vCD ticket for this vm
        var url = this.links['screen:acquireTicket'];
        if (url == undefined) {
            // TODO: A warning dialog interaction would be good here.
            console.log('Unable to open console. The VM should be powered-on.');
            return false;
        }

        var _parseVcdTicket = function (ticket) {
            var regex = /mks:\/\/([^\/]*)\/([^\?]*)\?ticket=(.*)/;
            var result = regex.exec(ticket);
            if (!result) {
                return false;
            }
            return {host: result[1], moid: result[2], ticket: unescape(result[3])};
        };

        var _parseVcdTicketResponse = function(xml) {
            var response = xml.getElementsByTagName('ScreenTicket')[0];
            return response.childNodes[0].nodeValue;
        }

        var _soapBodyUpdateTicket = function(ticket) {
            return '<CloneSession xmlns="urn:vim25">'+
                '<_this type="SessionManager">SessionManager</_this>'+
                '<cloneTicket xsi:type="xsd:string">'+ ticket +'</cloneTicket>'+
            '</CloneSession>';
        }

        // STEP 1: Retrieve the vCD Screen Ticket
        this.cloud.fetchURL(url, 'POST', '', function(xml) {
            var vcdTicket = _parseVcdTicketResponse(xml);
            var vcdTicketParts = _parseVcdTicket(vcdTicket);
            console.log('vCD ScreenTicket: '+ vcdTicket);
            // TODO: If we support VMRC, then we'd return this vcdTicket

            // STEP 2: Retrieve the (ESX) Host communication ticket
            // TODO: Port 9443 used for development purposes - take out
            var url = 'https://'+ vcdTicketParts.host +':9443/sdk';
            this.cloud.fetchURL(url, 'SOAP', '*/*', function(xml) {
                console.log('Host ticket fetched');
                // TODO: STEP 3: Request VM screen ticket from (ESX) Host
                // TODO: cloud.trigger(vmware.events.cloud.NEW_TICKET, ticket);
            }, _soapBodyUpdateTicket(vcdTicketParts.ticket));
        });

    }

};

function Template() {
    this.attr = {
        "searchTerm": ""
    };
    this.xml = "";

    this.setAttr = function(a, b) {
        this.attr[a] = b;
    };

    this.getAttr = function(key) {
        return this.attr[key];
    };

    this.save = function() {
        return {
            attr: this.attr
        };
    };
    this.load = function(loadObj) {
        this.attr = loadObj.attr || this.attr;
    };

    this.getHref = function() {
        return this.getAttr('href');
    }
    this.getName = function() {
        return this.getAttr('name');
    }
    this.getDescription = function() {
        return this.getAttr('description');
    }
    this.getDownloads = function() {
        return this.getAttr('downloads');
    }
    this.getNetwork = function() {
        return this.getAttr('network');
    }
    this.getChildren = function() {
        return this.getAttr('childNames');
    }
    this.getOwnerName = function() {
        return this.getAttr('owner');
    }
    this.getCatalogName = function() {
        return this.getAttr('catalog');
    }
    this.getCPUMhz = function() {
        return this.getAttr('cpu');
    }
    this.getMemoryMB = function() {
        return this.getAttr('memory');
    }
    this.getStorageKB = function() {
        return this.getAttr('storage');
    }


};
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * Talking to the REST API is done through this vmware.rest object.
 * Adds a body if given to the request, and then performs a jQuery AJAX call,
 * returning a deferred object.
 */


var vmware = (typeof vmware == "undefined" || !vmware) ? {} : vmware;
vmware.rest = (function() {
    var dataType = "xml";
    var headers = {};
    var that = {};

    var createAjaxRequest = function(type, url, dtype) {
        return $.ajax(url, {
            type: type,
            headers: headers,
            dataType: (dtype || dataType)
        });
    };

    /*
     * Send a body simply in the url for now - parsed
     * by the proxy and turned into an actual body
     * for the request to vcloud.eng or wherever
     */
    var createAjaxRequestBody = function(type, url, body, dtype) {
        return $.ajax(url, {
            type: type,
            data: body,
            headers: headers,
            dataType: (dtype || dataType)
        });
    };

    that.dataType = dataType;

    that.addHeader = function(name, value) {
        headers[name] = value;
    };

    that.hasHeader = function(name) {
        return (headers[name] != null);
    };

    that.removeHeader = function(name) {
        delete headers[name];
    };

    that.removeAllHeaders = function(name) {
        headers = {};
    };

    that.get = function(url) {
        return createAjaxRequest("GET", url);
    };

    that.postGetJSON = function(url, body) {
        if (body) return createAjaxRequestBody("POST", url, body, "json");
        return createAjaxRequest("POST", url, "json");
    };

    that.post = function(url, body) {
        if (body) return createAjaxRequestBody("POST", url, body);
        return createAjaxRequest("POST", url);
    };

    that.put = function(url, body) {
        if (body) return createAjaxRequestBody("PUT", url, body);
        return createAjaxRequest("PUT", url);
    };

    that.del = function(url) {
        return createAjaxRequest("DELETE", url);
    };

    return that;

}());
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * Talking to the SOAP API is done through this vmware.rest object.
 * Wraps the body in a soap envelope and then performs a jQuery AJAX call,
 * returning a deferred object.
 */


var vmware = (typeof vmware == "undefined" || !vmware) ? {} : vmware;
vmware.soap = (function() {
    var dataType = "xml";
    var headers = {};
    var that = {};

    var createAjaxRequest = function(type, url, body, dtype) {
        return $.ajax(url, {
            type: type,
            data: body,
            headers: headers,
            dataType: (dtype || dataType),
            cache: false
        });
    };

    var envelope = function(body) {
        return '<?xml version="1.0" encoding="UTF-8"?>'+
        '<soapenv:Envelope '+
            'xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" '+
            'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '+
            'xmlns:xsd="http:/www.w3.org/2001/XMLSchema" '+
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'+
            '<soapenv:Body>'+ body + '</soapenv:Body>'+
        '</soapenv:Envelope>';
    }

    that.dataType = dataType;

    that.addHeader = function(name, value) {
        headers[name] = value;
    };

    that.hasHeader = function(name) {
        return (headers[name] != null);
    };

    that.removeHeader = function(name) {
        delete headers[name];
    };

    that.removeAllHeaders = function(name) {
        headers = {};
    };

    that.post = function(url, body) {
        var body = envelope(body);
        return createAjaxRequest('POST', url, body);
    };

    return that;

}());
// Copyright © 2012 VMware, Inc. All rights reserved.

/*
 * Task Manager
 * ---------------
 * Purpose: Deal with tasks from the server and alert other people
 *             when the tasks are complete/failed
 *
 * Implementation: each time a power-op is triggered or a vApp instantiated,
 *                     this guy is given the returned task, and then proceeds
 *                     to query the server every specified interval of time
 *                     and if the task has a different status, trigger the callback
 *
 */

function TaskManager(c) {
    var refresh;
    var cloud = c;
    var tasks = {};
    var taskLog = {};

    // if the cloud decides, it can give a function to autocheck if any other updates
    // have been made by another user

    var CHECK_INTERVAL = 5000; // check to see if my tasks are complete
    var PASSIVE_INTERVAL = 10000; // check to see if I have any tasks

    var Task = function() {
        this.attr = {};
    };
    Task.prototype.addAttr = function(a, b) {
        this.attr[a] = b;
    };

    var that = {};

    that.autoRefresh = null;
    /*
     * if I know of some tasks, check their status
     * set loop time to specified interval
     */
    that.update = function() {
        clearTimeout(refresh);
        var somethingThere = false;
        for (key in tasks) {
            cloud.fetchURL(tasks[key].attr["href"], "GET", null, that.refreshTask);
            somethingThere = true;
        }

        if (that.autoRefresh) that.autoRefresh(that.loadTasks);

        if (somethingThere) refresh = setTimeout(function () { that.update(); }, CHECK_INTERVAL);
        else refresh = setTimeout(function () { that.update(); }, PASSIVE_INTERVAL);
    };

    that.loadTasks = function(xmlDoc) {
        that.loadTasksTo(tasks)(xmlDoc);
    };
    that.loadTasksLog = function(xmlD0c) {
        that.loadTasksTo(taskLog)(xmlD0c);
    };
    /*
     * Work in progress.
     */
    that.loadTasksTo = function(storage) {
        return function(xmlDoc) {
            var t,
            j;

            for (j = 0; j < xmlDoc.getElementsByTagName("TaskRecord").length; j++) {
                t = new Task();
                var taskdom = xmlDoc.getElementsByTagName("TaskRecord")[j];
                for (var i = 0; i < taskdom.attributes.length; i++) {
                    t.addAttr(taskdom.attributes[i].name, taskdom.attributes[i].value);
                }

                storage[t.attr["href"]] = t;
            }
        };
    };

    /*
     * This function is given to the REST client as the callback
     * through the above wrapper
     *
     * Analyze the XML Document for Tasks, add their attributes to
     * the models
     * If the task is done or has failed, perform the appropriate
     * action, and if not, keep track of this task for later
     */
    that.newTask = function(xmlDoc) {
        that.refreshTask(xmlDoc);
        cloud.trigger(vmware.events.cloud.TASK_START);
    };
    that.refreshTask = function(xmlDoc) {
        var t = new Task();
        var taskdom = xmlDoc.getElementsByTagName("Task")[0];
        for (var i = 0; i < taskdom.attributes.length; i++) {
            t.addAttr(taskdom.attributes[i].name, taskdom.attributes[i].value);
        }

        if (xmlDoc.getElementsByTagName("Link").length != 0) t.addAttr("cancel", xmlDoc.getElementsByTagName("Link")[0].getAttribute("href"));
        t.addAttr("ownerHref", xmlDoc.getElementsByTagName("Owner")[0].getAttribute("href"));
        t.addAttr("user", xmlDoc.getElementsByTagName("User")[0].getAttribute("name"));
        if (xmlDoc.getElementsByTagName("Progress").length != 0) t.addAttr("progress", xmlDoc.getElementsByTagName("Progress")[0].childNodes[0].data);

        if (taskLog[t.attr["href"]] != null) return;

        if (t.attr["status"] == "success") {
            var taskResults = {
                success: true,
                data: t
            };
            taskLog[t.attr["href"]] = t;
            if (t.attr["ownerHref"].match("vapp") != -1) that.addFakeTask(t.attr["ownerHref"]);
            delete tasks[t.attr["href"]];
            if (t.attr["progress"] == null && t.attr["name"].match("elete") == null && t.attr["operationName"].match("elete") == null) cloud.trigger(vmware.events.cloud.TASK_COMPLETE, taskResults);
            else cloud.updateModels();
        } else if (t.attr["status"] == "error") {
            var taskResults = {
                success: false,
                data: t
            };


            message = xmlDoc.getElementsByTagName("Error")[0].getAttribute("message") || (xmlDoc.getElementsByTagName("Details")[0].childNodes[0] ? xmlDoc.getElementsByTagName("Details")[0].childNodes[0].data : null);

            t.addAttr("error", message);
            taskLog[t.attr["href"]] = t;
            delete tasks[t.attr["href"]];
            cloud.trigger(vmware.events.cloud.TASK_COMPLETE, taskResults);
        } else {
            tasks[t.attr["href"]] = t;
        }
    };

    // return the number of tasks that the manager currently knows about
    that.numberOfTasks = function() {
        return that.inProgress().length;
    };

    that.saveLog = function() {
        return taskLog;
    };
    that.loadLog = function(x) {
        taskLog = x;
    };

    that.details = function(href) {
        task = (tasks[href] == null ? taskLog[href] : tasks[href]);

        //filtering here maybe?

        return task;
    };

    that.taskLog = function() {
        var list = [];
        var holders = [taskLog, tasks];
        var combine = {};

        // to solve duplicates
        for (var h = 0; h < holders.length; h++) {
            for (key in holders[h]) {
                combine[key] = holders[h][key];
            }
        }

        for (key in combine) {
            list.push([(combine[key].attr['ownerName'] != null ? combine[key].attr['ownerName'] : combine[key].attr['user']),
            humanReadable((combine[key].attr['name'] != "task" ? combine[key].attr['name'] : combine[key].attr['operationName'])), (combine[key].attr['startDate'] != null ? combine[key].attr['startDate'] : combine[key].attr['startTime']),
            combine[key].attr['status'],
            key]);
        }
        return list.sort(function(c, d) {
            if (c[2] > d[2]) return -1;
            if (c[2] < d[2]) return 1;
            return 0;
        });
    };

    var humanReadable = function(string) {
        var dict = {
            "poweron": localizer.get("TASK_POWERING_ON"),
            "poweroff": localizer.get("TASK_POWERING_OFF"),
            "acquirescreen": localizer.get("TASK_CONSOLE"),
            "suspend": localizer.get("TASK_SUSPEND"),
            "instantiate": localizer.get("TASK_CREATE_VAPP"),
            "delete": localizer.get("TASK_DELETE"),
            "jobundeploy": localizer.get("TASK_UNDEPLOY_VAPP"),
            "jobdeploy": localizer.get("TASK_DEPLOY_VAPP"),
            "vappundeploy": localizer.get("TASK_UNDEPLOY_VAPP"),
            "vappdeploy": localizer.get("TASK_DEPLOY_VAPP"),
            "update": localizer.get("TASK_EDIT_VAPP"),
            "uploadovf": localizer.get("TASK_UPLOAD_OVF")
        };

        for (var en in dict) {
            if (string.toLowerCase().match(en) != null) return dict[en];
        }
        return string;
    };

    that.tasksPerHour = function() {
        hours = [];
        count = 0;

        tl = that.taskLog();
        for (var i = 0; i < tl.length; i++) {
            newdate = new Date(tl[i][2]);
            if (hours.length == 0 || (hours[hours.length - 1] - newdate) > 3600000) hours.push(newdate);
        }

        return tl.length / hours.length;
    };

    that.tasks = function() {
        return tasks;
    };

    that.fakeTasks = {};

    that.addFakeTask = function(a) {
        that.fakeTasks[a] = 1;
        cloud.trigger(vmware.events.cloud.REFRESH_SINGLE, {
            vapp: cloud.getVAppFromHref(a),
            dontdeleteplease: 1
        });
    };

    // return an array of all the ids of the tasks in progress
    that.inProgress = function() {
        var list = [];
        for (key in tasks) {
            if (tasks[key].attr['ownerHref']) list.push(tasks[key].attr['ownerHref'].
            split("/")[tasks[key].attr['ownerHref'].
            split("/").length - 1].
            split("-").
            slice(1).
            join("-"));
        }

        for (key in that.fakeTasks)
        list.push(key.split("/")[key.split("/").length - 1].split("-").slice(1).join("-"));

        return list;
    };

    /*
     * When something updates, remove the fake task.
     */
    that.update();
    cloud.register(vmware.events.cloud.REFRESH_COMPLETE, function() {
        that.fakeTasks = {};
    });
    cloud.register(vmware.events.cloud.REFRESH_SINGLE, function(x) {
        if (x.eventData.dontdeleteplease != null) {
            return;
        }
        //delete that.fakeTasks[x.eventData.vapp.getHref()];
        that.fakeTasks = {}; // possibly an issue?
        x.eventData.dontdeleteplease = 1;
        cloud.trigger(vmware.events.cloud.REFRESH_SINGLE, x.eventData);
    });

    return that;

}
// Copyright © 2012 VMware, Inc. All rights reserved.

/* Includes the implementation for the localization of the JS-SDK.
 *
 * To add a language, add first a entry in #1, and then .setlang(localizer.languages.X).add(key,value)
 */

localizer = {
    lang: 0,
    languages: {
        EN: 0
    }, // #1
    setlang: function(lan) {
        lang = lan;
        if (!(this[lang])) this[lang] = {};

        return this;
    },
    add: function(key, value) {
        this[lang][key] = value;
        return this;
    },
    get: function(key) {
        if (this[lang]) return this[lang][key];
        return key;
    }
};
localizer.setlang(localizer.languages.EN)
    .add("SYSTEM_NOT_SUPPORTED", "You are attempting to connect to a system no longer supported.")
    .add("LOST_CONNECTIVITY", "You seem to have lost connectivity - your changes will not be saved until connectivity is reestablished.")
    .add("STATUS_ON", "Powered On")
    .add("STATUS_OFF", "Powered Off")
    .add("STATUS_ERROR", "Error!")
    .add("STATUS_WORKING", "Working...")
    .add("STATUS_PARTIAL", "Partially On")
    .add("STATUS_SUSPENDED", "Suspended")

    .add("TASK_POWERING_ON", "Powering On")
    .add("TASK_POWERING_OFF", "Powering Off")
    .add("TASK_CONSOLE", "Connecting To Console")
    .add("TASK_SUSPEND", "Suspending")
    .add("TASK_CREATE_VAPP", "Creating vApp")
    .add("TASK_DELETE", "Deleting")
    .add("TASK_UNDEPLOY_VM", "Undeploying VM")
    .add("TASK_DEPLOY_VM", "Deploying VM")
    .add("TASK_UNDEPLOY_VAPP", "Undeploying vApp")
    .add("TASK_DEPLOY_VAPP", "Deploying vApp")
    .add("TASK_EDIT_VAPP", "Editing vApp")

    .add("TASK_UPLOAD_OVF", "Uploading OVF");
