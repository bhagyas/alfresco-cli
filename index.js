#!/usr/bin/env node

const AlfrescoApi = require("alfresco-js-api-node");
const vorpal = require('vorpal')();
const fsAutocomplete = require('vorpal-autocomplete-fs');

var fs = require('fs');
var AsciiTable = require('ascii-table')
var flatten = require('flat')
const _cliProgress = require('cli-progress');

let parseNodeRef = (nodeRef) => {
    return nodeRef;
}

let alfrescoJsApi = new AlfrescoApi({provider: 'ECM'});
let host = '';
let ticket = ''
vorpal
    .command('login <username> [password] [host]', 'Login to an Alfresco instance.')
    .option('-p', '--password', 'Password')
    .option('-h', '--host', "Host")
    .action(function (args, callback) {
        this.log('logging in..');
        let password;

        let self = this;
        self.log(JSON.stringify(args));
        if (args.host) {
            host = args.host;
            this.log("Updating host: " + args.host);
            vorpal.localStorage.setItem('host', args.host);
            alfrescoJsApi.changeEcmHost(host);
        }

        if (args.password) {
            password = args.password;
        } else {
            //prompt for password
        }

        alfrescoJsApi.login(args.username, password).then(function (data) {
            self.log('API authentication performed successfully. Login ticket:' + data);
            vorpal.localStorage.setItem('ticket', data);
        }, function (error) {
            console.error(error);
            callback();
        });
        callback();
    });


vorpal
    .command('list sites [info]', 'Lists all sites.')
    .option('-I --info', "Show all info for each site")
    .types({
        boolean: ['i', 'info']
    })
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.core.sitesApi.getSites().then(function (data) {
            self.log('API called successfully. Returned data for ' + data.list.entries.length + ' sites');
            let sites = data.list.entries.map((item) => {
                let i = {};
                if (args.options.info) {
                    i[item.entry.id] = item.entry ;
                } else {
                    i[item.entry.id] = item.entry.title + (item.entry.description ? " - " + item.entry.description : "");
                }
                return i;
            })

            let rows = flatten(sites);
            var table = new AsciiTable();
            if (args.info) {
                table.setHeading('site-id/property', 'value', "id");
            } else {
                table.setHeading('site-id', 'site-name', "id");
            }
            for (var key in rows) {
                if (args.property) {
                    if (args.property == key) {
                        table.addRow(key, rows[key])
                    }
                } else {
                    table.addRow(key, rows[key]);
                }
            }

            self.log(table.toString());
        }, function (error) {
            console.error(error);
        });
        callback();
    });

vorpal.command('list people', "Lists all users in system.")
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.core.peopleApi.getPersons().then(function (data) {
            self.log('API called successfully. Returned data for ' + data.list.entries.length + ' users.');

            //TODO: Add the user information table.
        }, function (error) {
            console.error(error);
        });
    });

vorpal
    .command('debug', 'Debug current connection information.')
    .action(function (args, callback) {
        this.log('debug: ');
        this.log(JSON.stringify(alfrescoJsApi));
        callback();
    });

vorpal.command('list parents <nodeRef>', 'Lists parents for a given nodeRef.')
    
    .action(function(args, cb){
            // alfrescoJsApi.nodes.getParents(args.nodeRef).then((data) => {
            //     data.list.entries.forEach(entry => {
            //         this.log(entry.entry.nodeId)
            //     })
            // }).then(() => {
            //     cb();
            // })
            let self = this;
            alfrescoJsApi.core.childAssociationsApi.listParents(args.nodeRef, {}).then(function(data) {
                self.log('API called successfully. ' + data.list.entries.length + ' parent(s) found.');
                data.list.entries.forEach(element => {
                    self.log(element.entry.id);  
                });
                cb();
            }, function(error) {
                console.error(error);
                cb();
            });
        }   
    );

vorpal
    .command('upload-file <destinationNodeRef> <filePath> [autoRename]', 'Uploads a file to the given destination.')
    .option('-arn', "--autoRename", "Automatically rename the file if a similarly named file exists.")
    .action(function (args, callback) {
        let ongoing = false;
        let self = this;
        var fileToUpload = fs.createReadStream(args.filePath);
        const bar1 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
        bar1.start();
        let upload = alfrescoJsApi.upload.uploadFile(fileToUpload, null, args.destinationNodeRef, null, {autoRename: args.options.autoRename})
            .on('progress', (progress) => {

                bar1.update(progress.percent);
                // this.log( 'Total :' + progress.total );
                // this.log( 'Loaded :' + progress.loaded );
                // this.log( 'Percent :' + progress.percent );
                // vorpal.ui.redraw('progress: ' + progress.percent);
            })
            .on('success', () => {
                bar1.stop();
                vorpal.ui.redraw.clear()
                self.log('Your File is uploaded');
                
            })
            .on('abort', () => {
                bar1.stop();
                self.log('Upload Aborted');
            })
            .on('error', () => {
                bar1.stop();
                self.log('There was an error during the upload');
            })
            .on('unauthorized', () => {
                bar1.stop();
                self.log('You are unauthorized');
            });

            upload.then(()=>{
                callback();
            }).catch(() => {
                callback();
            });

    })
    .autocomplete(fsAutocomplete());

vorpal.command('view-metadata [nodeRef] [property]', "Shows metadata for the selected node.")
    .option('-p', '--property', 'Show only a particualr property.')
    .alias('info')
    .alias('stat')
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.nodes.getNodeInfo(getCurrentNodeRef(args.nodeRef)).then(function (data) {
            self.log('name: ' + data.name);
            let rows = flatten(data);
            var table = new AsciiTable();
            table.setHeading('property', 'value');
            for (var key in rows) {
                if (args.property) {
                    if (args.property == key) {
                        table.addRow(key, rows[key])
                    }
                } else {
                    table.addRow(key, rows[key]);
                }
            }

            self.log(table.toString());

        }, function (error) {
            self.log('This node does not exist');
        });
        callback();
    });

vorpal.command('move-node <nodeRef> <destinationNodeRef>', "Moves a node to a destination.")
    .action(function (args, callback) {
        alfrescoJsApi.nodes.moveNode(args[0])
    });


vorpal.command("delete node <nodeRef>", "Deletes a given node.")
    .action(function (args, callback) {
        this.log('deleting node: ' + args.nodeRef)
        callback();
    });

vorpal.command("about", "About Alfresco CLI")
    .action(function (args, callback) {
        this.log("Alfresco CLI by Bhagya Nirmaan Silva (https://about.me/bhagyas) and other contributors.");
        callback();
    });

vorpal.command("create folder <folderName> <destinationNodeRef> [path]", "Create folder")
    .option('-p', "--path", "Relative path from the destination nodeRef.")
    .alias('mkdir')
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.nodes.createFolder(args.folderName, args.path, args.destinationNodeRef).then(function (data) {
            self.log('The folder is created.');
        }, function (error) {
            self.log('Error in creation of this folder or folder already exist' + error);
        });
        callback();
    });

let init = async () => {
    let ticket = vorpal.localStorage.getItem('ticket');
    let _host = vorpal.localStorage.getItem('host');
    try {
        if (ticket && _host) {
            host = _host;
            alfrescoJsApi.changeEcmHost(_host);
            await alfrescoJsApi.loginTicket(ticket).then(function (data) {
                vorpal.log("Automatically logged into host: " + host + " with ticket: " + ticket);
                vorpal.log("If this is not intended, please logout from the terminal.");
            }, function (error) {
                throw error;
            });
        } else {
            throw new Error("Invalid login ticket.");
        }
    } catch (e) {
        vorpal.log("You are not logged in. Please make sure you are logged in before issuing any commands.")
    }
};

vorpal.command("cd [nodeRef]", "Change into a nodeRef")
    .action(function (args, callback) {
        let self = this;

        if(args.nodeRef == ".."){
            //find and move to the parent.
            let list = alfrescoJsApi.core.childAssociationsApi.listParents(getCurrentNodeRef());

            list.then(function(data) {
                self.log('API called successfully. ' + data.list.entries.length + ' parent(s) found.');
                let parentNodeRef;
                data.list.entries.forEach(element => {
                    self.log(element.entry.id);
                    parentNodeRef = element.entry.id;
                });
                if(parentNodeRef) {
                    setCurrentNodeRef(parentNodeRef);
                    callback();
                }else{
                    throw new Error("Unable to find a navigable parent.");
                }
            }).catch((e) => {
                self.log(e);
                callback();
            });
        }else{
            //TODO: Validate the nodeRef.
            setCurrentNodeRef(args.nodeRef);
        }
        callback();
    });

vorpal.command('clear', "Clears the current node context.")
.alias('cls')
.action((args, callback) => {
    setCurrentNodeRef("")
    callback();
});


function setCurrentNodeRef(nodeRef){
    vorpal.localStorage.setItem('currentNodeRef', nodeRef);
    vorpal.log(vorpal.localStorage.getItem('currentNodeRef'));
    vorpal.delimiter(getDelimiter());
}

vorpal.command('ls [nodeRef]', "List all children of a given folder.")
    .action(function(args, callback){
        let self = this;
        try{
            let nodeRef = getCurrentNodeRef(args.nodeRef);

            self.log(`listing content for nodeRef : ${nodeRef}`)

            alfrescoJsApi.nodes.getNodeChildren(nodeRef).then(function (data) {
                data.list.entries.map(item => {
                    self.log(`${item.entry.id} ${item.entry.name} ${item.entry.nodeType}`)
                });
                self.log('The number of children in this folder are ' + data.list.pagination.count );
            }, function (error) {
                self.log('This node does not exist');
            });
        }catch(e){ 
            self.log(e.message);
        }
        callback();
    });

vorpal.localStorage('alfresco-cli');
vorpal.history('alfresco-cli');

function getCurrentNodeRef(nodeRef) {
    if(nodeRef){
        return nodeRef;
    }
    let storedNodeRef = vorpal.localStorage.getItem('currentNodeRef');

    if(!storedNodeRef){
        throw new Error("Unable to find applicable nodeRef.");
    }

    return storedNodeRef;
}

function getDelimiter() {
    let item;
    try {
        item = getCurrentNodeRef();
        return `alfresco-cli:${item}$`;
    }catch(error){
        return `alfresco-cli$`;
    }
}

vorpal
    .delimiter(getDelimiter())
    .show();

init();
