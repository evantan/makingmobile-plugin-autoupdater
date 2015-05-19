/*jslint sub:true */
var PROP_NAME = 'autoupdater',
    path = require('path'),
    fs = require('fs'),
    doUpdate = require('./index');

/*
 * nodeSide autoupdater-plugin class
 */
function MMP_autoupdater(mm, plugin_config){
    var repdir = null,
        repository_file = null, 
        i;
    
    plugin_config['source'] = plugin_config['source'] || [];
    plugin_config['destination'] = plugin_config['destination'] || [];
    this.config = plugin_config;
    this.mm = mm;
    
    for (i = 0; i < plugin_config['destination'].length; i++){
        if (plugin_config['destination'][i]['repository-meta-filename']) {
            repository_file = path.resolve(mm._rootdir, plugin_config['destination'][i]['path'], plugin_config['destination'][i]['repository-meta-filename']);
            repdir = plugin_config['destination'][i]['path'];
            break;
        }
    }
    if (repository_file && fs.existsSync(repository_file)) {
        try {
            this.lastupdate = new Date(JSON.parse(fs.readFileSync(repository_file,  {encoding: 'utf-8'})).lastupdate);
        } catch (err) {
            console.warn('Autoupdater: bad repository meta file');
            this.lastupdate = null;
        }
    } else {
        this.lastupdate = null;
    }
    
    mm.register(this, PROP_NAME);
    
    if (repdir) {
        mm.app.use(this.mm.util.slash_url(this.mm.config.urlprefix) + this.mm.util.slash_url(this.config.urlspace), mm.express.static(path.resolve(mm._rootdir, repdir), {hidden: true}));
    } else {
        console.warn("Autoupdater: repository not set, skip client-side auto update");
    }
}

/*
 * Do update, just like what's doing in build phase. 
 * 
 * Attention: althougn this is a asynchronous method, it invokes a 
 * lots of synchronous file system I/O, which mean occupy a 
 * lots of cpu and time, and block you normal web request. 
 *   cb(err)
 *      if success, err is null
 */
MMP_autoupdater.prototype.update = function(cb) {
    doUpdate(this.config, this.mm._rootdir, cb);
};

module.exports = MMP_autoupdater;
