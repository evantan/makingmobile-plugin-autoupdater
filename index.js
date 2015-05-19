/*jslint sub:true */
var fs = require('fs'),
    path = require('path'),
    doUpdate = require('./doupdate');

function find_plugin_config(config) {
    for (var i = 0; i < config.plugins.length; i++) {
        if (config.plugins[i].name === 'autoupdater') {
            return config.plugins[i];
        }
    }
    return null;
}

function post_build (config, rootdir, next) {
    var pconfig = find_plugin_config(config);
    
    doUpdate(pconfig, rootdir, next);
}

function init (mm) {
    var Autoupdater = require('./autoupdater'),
        pconfig = find_plugin_config(mm.config);
        
    new Autoupdater(mm, pconfig);
}

exports.docmd = null;
exports.build = null;
exports.post_build = post_build;
exports.init = init;
exports.post_init = null;