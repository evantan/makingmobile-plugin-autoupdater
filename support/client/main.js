/*jslint sub:true */
var PROP_NAME = 'autoupdater',
    ROOT_DIR = 'MakingMobile';

/*
 * clientSide autoupdater-plugin class
 */
function MMP_autoupdater(mm, plugin_config){
    this.config = plugin_config;
    this.mm = mm;
    this._ajax = mm.Ajax();
}

/*
 * Do client auto update
 *      msgCallback:    function(msg) publish message during update process
 *      successCallback:    function() update success
 *      failCallback:   function(reason) update failed 
 *      appfolder: string root folder for app. Should be a single level folder name without '/'
 *      appendNames: [string,] tags for specific patch
 */
MMP_autoupdater.prototype.update = function (msgCallback, successCallback, failCallback, appfolder, appendNames){
    var i;
    
    if (!this.mm.hasPhoneGap) {
        return failCallback('Phonegap no found');
    }
    
    this.url = (this.mm.localstore.get('url') || this.mm.config.url.replace(/\/$/, '')) + 
             this.mm.util.slash_url(this.mm.config.urlprefix) +
             this.mm.util.slash_url(this.config.urlspace);
    this.appfolder = appfolder || this.mm.config.name;
    this.msgCallback = msgCallback;
    this.successCallback = successCallback;
    this.failCallback = failCallback;
    this.counter = 0;
    this.magicName = [device.platform.toLowerCase()];
    if (appendNames instanceof Array){
        for(i = 0;i < appendNames.length;i++){
            if (typeof(appendNames[i]) === 'string'){
                this.magicName.push(appendNames[i]);
            }   
        }
    }else if (typeof(appendNames) === 'string') {
        this.magicName.push(appendNames);
    }
    
    this.metaFilename = null;
    for (i = 0; i < this.config.destination.length; i++) {
        if (this.config.destination[i]["repository-meta-filename"]) {
            this.metaFilename = this.config.destination[i]["repository-meta-filename"];
            break;
        }
    }
    if (!this.metaFilename) {
        return failCallback('Server repository no found'); 
    }
    
    window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, this._onFileSystemSuccess.bind(this), this._rootNotFound.bind(this));
};

MMP_autoupdater.prototype._onFileSystemSuccess = function (fileSystem) {
    this.fsRoot = fileSystem.root;
    this._getOrCreateAppRootDir();
};

MMP_autoupdater.prototype._getOrCreateAppRootDir = function () {
    this.fsRoot.getDirectory(ROOT_DIR, {create: true, exclusive: false}, this._onGotRootDir.bind(this), this._fileIOFailWithoutDeleteRoot.bind(this));
};

MMP_autoupdater.prototype._onGotRootDir = function (directoryEntry) {
    directoryEntry.getDirectory(this.appfolder, null, this._onGotAppRootDir.bind(this), this._onAppRootDirNotFound.bind(this));
};

MMP_autoupdater.prototype._onGotAppRootDir = function (directoryEntry) {
    this.appRoot = directoryEntry;
    this._fetchMetaData();
};

MMP_autoupdater.prototype._onAppRootDirNotFound = function (error) {
    if (error.code == FileError.NOT_FOUND_ERR){
        this.fsRoot.getDirectory(this.fsRoot.fullPath + '/' + ROOT_DIR + '/' + this.appfolder, {create: true, exclusive: false}, this._onGotAppRootDir.bind(this), this._fileIOFailWithoutDeleteRoot.bind(this));
    }else {
        console.log('Autoupdater: FileIO fail! code:' + error.code);
        this.failCallback('文件读写出现错误！');
    }
};

MMP_autoupdater.prototype._fetchMetaData = function(){
    var me = this;
    
    this._ajax.get(this.url + '/' + this.metaFilename, 3000,
        function(responseText){
            try {
                responseText = JSON.parse(responseText);
            } catch(error) {
                console.log('Autoupdater: Broken Meta file!');
                return me.failCallback('获取数据文件时出现错误！');
            }
            me.rMeta = responseText;
            me._toBeCompare();
        }, function(){
            console.log('Autoupdater: Ajax fail when get meta file');
            me.failCallback('下载数据文件出现错误！');
    });
};

MMP_autoupdater.prototype._toBeCompare = function () {
    this.appRoot.getFile(this.metaFilename, {create: true, exclusive: false}, this._onGotMetaFileEntry.bind(this), this._fileIOFailWithoutDeleteRoot.bind(this));
};

MMP_autoupdater.prototype._onGotMetaFileEntry = function (fileEntry) {
    fileEntry.file(this._onGotMetaFile.bind(this), this._fileIOFailWithoutDeleteRoot.bind(this));
};

MMP_autoupdater.prototype._onLocalMetaEmpty = function () {
    this.lMeta = {
        lastupdate: '', 
        root: {
            items: {}
        }
    };
    this.lMeta.root.items[this.metaFilename] = {md5: ''};
    this._compare();
};

MMP_autoupdater.prototype._onGotMetaFile = function (file) {
    var me = this,
        reader = new FileReader();
    
    reader.onload = function(evt){
        var data = null;
        
        try {
            data = JSON.parse(evt.target.result);
        } catch (error) {
            console.log('Autoupdater: Empty local metaData! Maybe the first init?');
            me._onLocalMetaEmpty();
        }
        me.lMeta = data;
        me.lMeta.root.items[me.metaFilename] = {md5: ''};
        me._compare();
    };
    reader.onerror = function(evt){
        console.log('Autoupdater: FileIO fail when read meta file!');
        me.failCallback('读写元数据文件时出现错误！');
    };
    
    reader.readAsText(file);
};

MMP_autoupdater.prototype._isSpName = function (name) {
    if ((name[0] == '_') && (name.indexOf('_', 1) != -1)) {
        return true;
    }else {
        return false;
    }
};

MMP_autoupdater.prototype._cleanName = function (name) {
    var i;
    for (i = 0; i < this.magicName.length; i++){
        if (name.indexOf('_' + this.magicName[i] + '_') === 0){
            return name.substr(this.magicName[i].length + 2);
        }   
    }
    return '';
};

MMP_autoupdater.prototype._walkTree = function (pathArr) {
    var me = this,
        finished = true,
        lc = me.lMeta.root,
        rc = me.rMeta.root,
        key = null, k = null, akey = null, path = '',
        ln, i;
    
    for (i = 0; i < pathArr.length; i++) {
        lc = lc['items'][pathArr[i]];
        rc = rc['items'][pathArr[i]];
    }
    
    for (key in lc.items) {
        //looup file to be deleted
        if (rc.items[key] === undefined && (!me._isSpName(key) || me._cleanName(key))) {
            finished = false;
            akey = me._isSpName(key) ? me._cleanName(key) : key;
            for (k = 0; k < me.magicName.length; k++) {
                if (rc.items['_' + me.magicName[k] + '_' + akey] !== undefined){
                    finished = true;
                    break;
                }
            }
            if (rc.items[akey] !== undefined){
                finished = true;
            }
            if (finished && (lc.items[key]['items'] === undefined)){
                for (k = 0; k < me.magicName.length; k++) {
                    if (lc.items['_' + me.magicName[k] + '_' + akey] !== undefined){
                        lc.items['_' + me.magicName[k] + '_' + akey]['md5'] = '';
                    }
                }
                if (lc.items[akey] !== undefined){
                    lc.items[akey]['md5'] = '';
                }
            }
            if (!finished){
                for (i = 0; i < pathArr.length; i++) {
                    path += ( me._isSpName(pathArr[i]) ? me._cleanName(pathArr[i]) : pathArr[i] ) + '/';
                }
                path += me._isSpName(key) ? me._cleanName(key) : key;
                if (lc.items[key]['items'] !== undefined){
                    me._deletDir(path);
                }else {
                    me._deleteFile(path);
                }
                delete lc.items[key];
                return false;
            }
        }
    }
    
    if (finished){
        for (key in rc.items) {
            akey = me._isSpName(key) ? me._cleanName(key) : key;
            if (!akey){
                rc.items[key]['status'] = 'done';
                return ;
            }
            ln = -1;
            for (k = 0; k < me.magicName.length; k++) {
                if (rc.items['_' + me.magicName[k] + '_' + akey] !== undefined){
                    ln = Math.max(ln, k);
                }
            }
            if (ln != -1){
                if (rc.items[akey] !== undefined){
                    rc.items[akey]['status']  = 'done';
                }
            }
            for(k = 0; k < ln; k++) {
                if (rc.items['_' + me.magicName[k] + '_' + akey] !== undefined){
                    rc.items['_' + me.magicName[k] + '_' + akey]['status']  = 'done';
                }
            }
        }
        for(key in rc.items) {
            if (rc.items[key]['items'] !== undefined){//Found a dir
                if (rc.items[key]['status'] != 'done'){
                    if (lc.items[key] === undefined){
                        if (!me._isSpName(key) || me._cleanName(key)){
                            finished = false;
                            path = '';
                            for (i = 0; i < pathArr.length; i++) {
                                path += ( me._isSpName(pathArr[i]) ? me._cleanName(pathArr[i]) : pathArr[i] ) + '/';
                            }
                            path += me._isSpName(key) ? me._cleanName(key) : key;
                            lc.items[key] = {'items': {}};
                            me._createDir(path);
                            return false;
                        }else {
                            //bybass dir not specify to this platform
                            rc.items[key]['status'] = 'done';
                        }
                    }else {
                        if (!me._isSpName(key) || me._cleanName(key)){
                            if (me._walkTree(pathArr.concat(key))){
                                rc.items[key]['status'] = 'done';
                            }else {
                                finished = false;
                                return false;
                            }
                        }else {
                            //Bybass dir not specify to this platform
                            rc.items[key]['status'] = 'done';
                        }
                    }
                }
            }else {//Found a file
                if (rc.items[key]['status'] != 'done'){
                    if (    ( !me._isSpName(key) || me._cleanName(key) ) && 
                            ( (lc.items[key] === undefined) || (lc.items[key]['md5'] != rc.items[key]['md5']) )
                        ){
                        finished = false;
                        path = '',
                            fpath = '';
                        for(i = 0; i < pathArr.length; i++) {
                            path += ( me._isSpName(pathArr[i]) ? me._cleanName(pathArr[i]) : pathArr[i] ) + '/';
                            fpath += pathArr[i] + '/';
                        }
                        path += me._isSpName(key) ? me._cleanName(key) : key;
                        fpath += key;
                        lc.items[key] = {'md5': ''};
                        rc.items[key]['status'] = 'done';
                        me._downfile(path, fpath);
                        return false;
                    }else {
                        rc.items[key]['status'] = 'done';
                    }
                }
            }
        }
    }

    return finished;
};

MMP_autoupdater.prototype._compare = function () {
    var me = this;
    
    //avoid deep nest, wrap in a setTimeout
    setTimeout(function () {
        if (!me.rMeta.root.status){
            if (me.lMeta.lastupdate === me.rMeta.lastupdate){
                //bypass update
                me.successCallback();
            } else {
                me.rMeta.root.status = 'ing';
                me._compare();
            }
        } else if (me.rMeta.root.status == 'ing'){
            //Start to check:
            try{
                if (me._walkTree([])) {
                    me.rMeta.root.status = 'done';
                    me._compare();
                }
            } catch (error) {
                console.log('Autoupdater: Walk tree fail!:' + error);
                me._clearAppRootDir();
                me.failCallback('升级过程中出现未知错误！');
            }
            
        } else if (me.rMeta.root.status == 'done') {          
            me.msgCallback('更新完毕！共更新' + me.counter + '个文件。');
            me.successCallback();
        }
    }, 0);
};

MMP_autoupdater.prototype._deletDir = function (dirpath) {
    this.counter += 1;
    this.msgCallback('正在删除目录' + dirpath);
    //this.appRoot.getDirectory(dirpath, null, this._onDeletedir.bind(this), this._fileIOFail.bind(this));
    this.appRoot.getDirectory(dirpath, null, this._onDeletedir.bind(this), this._compare.bind(this));
};

MMP_autoupdater.prototype._onDeletedir = function (directoryEntry) {
    //When success or fail, continue to do compare:
    //directoryEntry.removeRecursively(this._compare.bind(this), this._fileIOFail.bind(this));
    directoryEntry.removeRecursively(this._compare.bind(this), this._compare.bind(this));
};

MMP_autoupdater.prototype._deleteFile = function (filepath) {
    this.counter += 1;
    this.msgCallback('正在删除文件' + filepath);
    //this.appRoot.getFile(filepath, null, this._onDeletefile.bind(this), this._fileIOFail.bind(this));
    this.appRoot.getFile(filepath, null, this._onDeletefile.bind(this), this._compare.bind(this));
};

MMP_autoupdater.prototype._onDeletefile = function (fileEntry) {
    //When success or fail, continue to do compare:
    //fileEntry.remove(this._compare.bind(this), this._fileIOFail.bind(this));
    fileEntry.remove(this._compare.bind(this), this._compare.bind(this));
};

MMP_autoupdater.prototype._createDir = function (dirpath) {
    this.counter += 1;
    this.msgCallback('正在创建目录' + dirpath);
    this.appRoot.getDirectory(dirpath, {create: true, exclusive: false}, this._compare.bind(this), this._fileIOFail.bind(this));
};

MMP_autoupdater.prototype._downfile = function (filepath, remotepath) {
    var ft = new FileTransfer();
    
    this.counter += 1;
    this.msgCallback('正在下载文件' + filepath);
    ft.download(this.url + '/' + remotepath, 
        this.fsRoot.fullPath + '/' + ROOT_DIR + '/' + this.appfolder + '/' + filepath,
        this._compare.bind(this), 
        this._fileDownFail.bind(this));
};

MMP_autoupdater.prototype._fileIOFail = function (error) {
    console.log('Autoupdater: FileIO fail! code:' + error.code);
    this._clearAppRootDir();
    this.failCallback('文件读写出现错误！');
};

MMP_autoupdater.prototype._fileDownFail = function (error) {
    console.log('Autoupdater: File download fail! code:' + error.code);
    this._clearAppRootDir();
    this.failCallback('文件下载出现错误！');
};

MMP_autoupdater.prototype._fileIOFailWithoutDeleteRoot = function (error) {
    console.log('Autoupdater: FileIO fail! code:' + error.code);
    this.failCallback('文件读写出现错误！');
};

MMP_autoupdater.prototype._rootNotFound = function (error) {
    console.log('Autoupdater: Root filesystem not found! code:' + error.code);
    this.failCallback('未能找到可读写的文件系统！（可能是由于SD卡未加载）');
};

MMP_autoupdater.prototype._clearAppRootDir = function () {
    var me = this;
    
    if(this.appRoot){
        this.appRoot.removeRecursively(function() {
            console.log('Autoupdater: Clear app(' + me.appfolder + ')root dir success!');
        }, function(error){
            console.log('Autoupdater: Clear app(' + me.appfolder + ')root dir fail:' + error.code);
        });
    }
};


/*
 * Check if appfolder does exist
 *      successCallback:    function() appfolder does exist
 *      failCallback:   function(reason) appfolder does not exist or has error when read file systems.
 *      appfolder: string root folder for app. Should be a single level folder name without '/'
 */
MMP_autoupdater.prototype.appfolderExist = function (successCallback, failCallback, appfolder) { 
    window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function(fileSystem) {
        fileSystem.root.getDirectory(ROOT_DIR, {create: true, exclusive: false}, function(directoryEntry) {
            directoryEntry.getDirectory(appfolder, null, function() {
                successCallback();
            }, function() {
                failCallback('no found');
            });
        }, function() {
            failCallback('文件读写出现错误！');
        });      
    }, function() {
        failCallback('未能找到可读写的文件系统！（可能是由于SD卡未加载）');
    });
};


function plugin_init (mm, config) {
    var plugin_instance = new MMP_autoupdater(mm, config);
    mm.register(plugin_instance, PROP_NAME);
}

exports._init = plugin_init;
